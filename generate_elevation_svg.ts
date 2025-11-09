#!/usr/bin/env node

import fs from "node:fs/promises";
import * as SVG from "@svgdotjs/svg.js";
import { createSVGWindow } from "svgdom";
import type { Trip, Stage } from "./trips.js";
import pretty from "pretty";

const FILENAME = "./travels.json";
const OUTPUT_DIR = "./output";

// We need to extend the Element prototype with the namespaces for svgdom
const window = createSVGWindow();
const document = window.document;
// @ts-ignore
SVG.registerWindow(window, document);

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

async function generateElevationSvg(
  trip: Trip,
  stage: Stage,
  stageIndex: number,
  elevationData: number[],
  distanceData: number[]
) {
  const SVG_WIDTH = 600;
  const SVG_HEIGHT = 150;
  const LEFT_PADDING = 50;
  const RIGHT_PADDING = 20;
  const TOP_PADDING = 10;
  const BOTTOM_PADDING = 30;

  const canvas = SVG.SVG().size(SVG_WIDTH, SVG_HEIGHT);

  const clampedElevationData = elevationData.map((e) => Math.max(0, e));
  const maxElevation = Math.max(Math.max(...clampedElevationData), 200);
  const minElevation = Math.min(...clampedElevationData);
  const elevationRange = maxElevation - minElevation;

  const maxDistance = Math.max(...distanceData);

  const plotWidth = SVG_WIDTH - LEFT_PADDING - RIGHT_PADDING;
  const plotHeight = SVG_HEIGHT - TOP_PADDING - BOTTOM_PADDING;

  const points = clampedElevationData.map((elevation, index) => {
    const x = (distanceData[index] / maxDistance) * plotWidth + LEFT_PADDING;
    const y = (1 - (elevation - minElevation) / elevationRange) * plotHeight + TOP_PADDING;
    return [x, y];
  });

  // Add gridlines
  const gridlineColor = "#e0e0e0";
  const numHorizontalGridlines = 5;
  for (let i = 0; i < numHorizontalGridlines; i++) {
    const y = TOP_PADDING + (i / (numHorizontalGridlines - 1)) * plotHeight;
    canvas
      .line(LEFT_PADDING, y, SVG_WIDTH - RIGHT_PADDING, y)
      .stroke({ color: gridlineColor, width: 1 });
  }

  // Create a path from the points
  const pathString = points.map((p, i) => (i === 0 ? "M" : "L") + p.join(" ")).join(" ");

  // Create a gradient fill
  const gradient = canvas.gradient("linear", function (add) {
    add.stop({ offset: 0, color: "#ffcccb", opacity: 1 });
    add.stop({ offset: 1, color: "#ffffff", opacity: 1 });
  });
  gradient.from(0, 0).to(0, 1);

  // Create a path for the fill area
  const fillPathString =
    pathString +
    ` L ${points[points.length - 1][0]} ${SVG_HEIGHT - BOTTOM_PADDING} L ${points[0][0]} ${
      SVG_HEIGHT - BOTTOM_PADDING
    } Z`;
  canvas.path(fillPathString).fill(gradient).stroke("none");

  canvas
    .path(pathString)
    .fill("none")
    .stroke({ color: "#C61016", width: 2, linecap: "round", linejoin: "round" });

  // Add elevation labels
  canvas
    .text(`${Math.round(maxElevation)}m`)
    .amove(LEFT_PADDING - 5, TOP_PADDING)
    .font({ family: "Helvetica", size: 12, anchor: "end", "dominant-baseline": "middle" });
  canvas
    .text(`${Math.round(minElevation)}m`)
    .amove(LEFT_PADDING - 5, SVG_HEIGHT - BOTTOM_PADDING)
    .font({ family: "Helvetica", size: 12, anchor: "end", "dominant-baseline": "middle" });

  // Add distance labels with ticks
  const numVerticalTicks = 4;
  for (let i = 0; i < numVerticalTicks; i++) {
    const distance = (i / (numVerticalTicks - 1)) * maxDistance;
    const x = LEFT_PADDING + (i / (numVerticalTicks - 1)) * plotWidth;
    canvas
      .line(x, SVG_HEIGHT - BOTTOM_PADDING, x, SVG_HEIGHT - BOTTOM_PADDING + 5)
      .stroke({ color: gridlineColor, width: 1 });
    canvas
      .text(`${(distance / 1000).toFixed(1)}km`)
      .amove(x, SVG_HEIGHT - BOTTOM_PADDING + 10)
      .font({
        family: "Helvetica",
        size: 12,
        anchor: "middle",
        "dominant-baseline": "hanging",
      });
  }

  // Add icons
  const FWD_ICON_PATH = "M10 17l5-5-5-5-1.41 1.41L12.17 12l-3.58 3.59z";
  const INFO_ICON_PATH =
    "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z";

  const defs = canvas.defs();
  defs.path(FWD_ICON_PATH).id("fwd-icon");
  defs.path(INFO_ICON_PATH).id("info-icon");

  canvas.style().rule(".icon", {
    fill: "currentColor",
    "stroke-width": 0,
  });

  canvas
    .use("#fwd-icon")
    .addClass("icon")
    .size(24, 24)
    .move(SVG_WIDTH - RIGHT_PADDING, 5);
  canvas
    .use("#info-icon")
    .addClass("icon")
    .size(24, 24)
    .move(SVG_WIDTH - RIGHT_PADDING, 35);

  // Add max elevation indicator
  const maxElevationIndex = clampedElevationData.indexOf(Math.max(...clampedElevationData));
  const maxElevationPoint = points[maxElevationIndex];

  // Use a filled triangle for the max elevation indicator
  const triangleSize = 10;
  const cx = maxElevationPoint[0];
  const cy = maxElevationPoint[1];

  // Points for an upward-pointing equilateral triangle centered at (cx, cy)
  const trianglePoints = [
    [cx, cy - triangleSize * (Math.sqrt(3) / 3)], // Top vertex
    [cx - triangleSize / 2, cy + triangleSize * (Math.sqrt(3) / 6)], // Bottom-left vertex
    [cx + triangleSize / 2, cy + triangleSize * (Math.sqrt(3) / 6)], // Bottom-right vertex
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  canvas
    .polygon(trianglePoints)
    .fill("#C61016")
    .stroke({ color: "white", width: 2, linejoin: "round" });

  const tripYear = new Date(trip.startDate).getFullYear();
  const filename = `${tripYear}-${toSnakeCase(trip.name)}-stage-${stageIndex + 1}-elevation.svg`;
  const filepath = `${OUTPUT_DIR}/${filename}`;

  try {
    await fs.writeFile(filepath, pretty(canvas.svg()));
    console.log(`Generated elevation SVG: ${filepath}`);
  } catch (error) {
    console.error(`Error writing SVG file ${filepath}:`, error);
  }
}

async function main() {
  console.log("Generating elevation SVGs...");

  let travelsJson: Trip[];
  try {
    const data = await fs.readFile(FILENAME, { encoding: "utf8" });
    travelsJson = JSON.parse(data);
  } catch (error) {
    console.error(`Error reading or parsing ${FILENAME}:`, error);
    process.exit(1);
  }

  // Ensure output directory exists
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating output directory ${OUTPUT_DIR}:`, error);
    process.exit(1);
  }

  for (const trip of travelsJson) {
    if (!trip.stages) continue;
    for (const [i, stage] of trip.stages.entries()) {
      if (
        stage.strava_data &&
        stage.strava_data.elevation_stream &&
        stage.strava_data.distance_stream
      ) {
        let elevationStream: number[];
        if (typeof stage.strava_data.elevation_stream === "string") {
          elevationStream = stage.strava_data.elevation_stream.split(",").map(Number);
        } else {
          elevationStream = stage.strava_data.elevation_stream;
        }

        let distanceStream: number[];
        if (typeof stage.strava_data.distance_stream === "string") {
          distanceStream = stage.strava_data.distance_stream.split(",").map(Number);
        } else {
          distanceStream = stage.strava_data.distance_stream;
        }

        await generateElevationSvg(trip, stage, i, elevationStream, distanceStream);
      }
    }
  }

  console.log("Finished generating elevation SVGs.");
}

main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exit(1);
});
