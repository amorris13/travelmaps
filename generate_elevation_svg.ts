#!/usr/bin/env node

import fs from "node:fs/promises";
import * as SVG from "@svgdotjs/svg.js";
import { createSVGWindow } from "svgdom";
import type { Trip } from "./trips.js";
import pretty from "pretty";
import { computeElevationProfile } from "./lib/elevation.js";
import { ACCENT_COLOR } from "./lib/constants.js";

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

function generateElevationSvg(
  elevationStream: number[],
  distanceStream: number[],
  plotWidth: number,
  plotHeight: number,
  options?: {
    stageMarkers?: { distance: number; label: string }[];
    horizontalGridlines?: boolean;
    labelProminentElevations?: {
      minProminence?: number;
    };
    showKeyElevations?: boolean;
  }
): string {
  const profileData = computeElevationProfile(
    [{ elevationStream, distanceStream }],
    plotWidth,
    plotHeight,
    options
  );

  const {
    svgWidth,
    svgHeight,
    segmentPaths,
    maxElevationTrianglePoints,
    gridlines,
    prominentLabels,
    stageMarkerPositions,
    keyElevations,
    gradientStartColor,
    gradientEndColor,
    plotWidth: effectivePlotWidth,
  } = profileData;

  const canvas = SVG.SVG().size(svgWidth, svgHeight);

  canvas.style().rule(".label", {
    fontFamily: "Helvetica Neue, Helvetica, sans-serif",
    fontSize: "16px",
    fontWeight: 300,
    "letter-spacing": "0.05em",
    "dominant-baseline": "alphabetical",
  });

  // Create a gradient fill
  const gradient = canvas.gradient("linear", function (add) {
    add.stop({ offset: 0, color: gradientStartColor, opacity: 1 });
    add.stop({ offset: 1, color: gradientEndColor, opacity: 1 });
  });
  gradient.from(0, 0).to(0, 1);

  // Add gridlines
  for (const gy of gridlines) {
    canvas.line(5, gy, effectivePlotWidth + 5, gy).stroke({ color: "#e0e0e0", width: 1 });
  }

  // Add paths
  for (const segment of segmentPaths) {
    canvas.path(segment.fillD).fill(gradient as unknown as string).stroke("none");
    canvas
      .path(segment.pathD)
      .fill("none")
      .stroke({ color: ACCENT_COLOR, width: 2, linecap: "round", linejoin: "round" });
  }

  // Add max elevation indicator
  canvas
    .polygon(maxElevationTrianglePoints)
    .fill(ACCENT_COLOR)
    .stroke({ color: "white", width: 2, linejoin: "round" });

  // Prominent elevation labels
  for (const label of prominentLabels) {
    canvas
      .text(`${label.elevation}m`)
      .amove(label.x, label.y)
      .addClass("label")
      .font({ anchor: label.anchor });
  }

  // Stage markers
  for (const marker of stageMarkerPositions) {
    canvas.line(marker.x, marker.elevationY, marker.x, profileData.plotOffsetY + profileData.plotHeight).stroke({ color: "#808080", width: 1, dasharray: "2 4" });
    canvas.line(marker.x, profileData.plotOffsetY + profileData.plotHeight, marker.x, profileData.plotOffsetY + profileData.plotHeight + 5).stroke({ color: "#808080", width: 1 });
    canvas
      .text(marker.label)
      .amove((marker.x + marker.xNext) / 2, profileData.plotOffsetY + profileData.plotHeight + 15)
      .addClass("label")
      .font({ anchor: "middle" });
  }
  if (stageMarkerPositions.length > 0) {
    canvas
      .line(effectivePlotWidth + 5, profileData.plotOffsetY + profileData.plotHeight, effectivePlotWidth + 5, profileData.plotOffsetY + profileData.plotHeight + 5)
      .stroke({ color: "#808080", width: 1 });
  }

  // Key elevations
  if (options?.showKeyElevations) {
    const keyY = profileData.plotOffsetY + profileData.plotHeight + (stageMarkerPositions.length > 0 ? 15 : 0) + 20;

    // Start elevation
    canvas
      .text(`${keyElevations.start}m`)
      .amove(5, keyY)
      .addClass("label")
      .font({ anchor: "start" });

    // Peak elevation
    canvas
      .text(`⏶ ${keyElevations.peak}m`)
      .amove(effectivePlotWidth / 2, keyY)
      .addClass("label")
      .font({ anchor: "middle" });

    // End elevation
    canvas
      .text(`${keyElevations.end}m`)
      .amove(effectivePlotWidth - 5, keyY)
      .addClass("label")
      .font({ anchor: "end" });
  }

  return pretty(canvas.svg());
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
    const filteredStages = trip.stages.filter((stage) => stage.strava_data);

    let tripElevationData: number[] = [];
    let tripDistanceData: number[] = [];
    let stageMarkers: { distance: number; label: string }[] = [];
    let cumulativeDistance = 0;

    for (const [i, stage] of filteredStages.entries()) {
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

        const svgContent = generateElevationSvg(elevationStream, distanceStream, 600, 180, {
          horizontalGridlines: true,
          labelProminentElevations: { minProminence: 100 },
        });

        const tripYear = new Date(trip.startDate).getFullYear();
        const filename = `${tripYear}-${toSnakeCase(trip.name)}-stage-${i + 1}-elevation.svg`;
        const filepath = `${OUTPUT_DIR}/${filename}`;

        try {
          await fs.writeFile(filepath, svgContent);
          console.log(`Generated elevation SVG: ${filepath}`);
        } catch (error) {
          console.error(`Error writing SVG file ${filepath}:`, error);
        }

        tripElevationData = tripElevationData.concat(elevationStream);
        const lastDistance =
          distanceStream.length > 0 ? distanceStream[distanceStream.length - 1] : 0;
        tripDistanceData = tripDistanceData.concat(
          distanceStream.map((d) => d + cumulativeDistance)
        );
        stageMarkers.push({ distance: cumulativeDistance, label: `${i + 1}` });
        cumulativeDistance += lastDistance;
      }
    }

    if (tripElevationData.length > 0) {
      const svgContent = generateElevationSvg(tripElevationData, tripDistanceData, 1600, 200, {
        stageMarkers,
        labelProminentElevations: { minProminence: 250 },
      });
      const tripYear = new Date(trip.startDate).getFullYear();
      const filename = `${tripYear}-${toSnakeCase(trip.name)}-elevation.svg`;
      const filepath = `${OUTPUT_DIR}/${filename}`;

      try {
        await fs.writeFile(filepath, svgContent);
        console.log(`Generated elevation SVG: ${filepath}`);
      } catch (error) {
        console.error(`Error writing SVG file ${filepath}:`, error);
      }
    }
  }

  console.log("Finished generating elevation SVGs.");
}

main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exit(1);
});
