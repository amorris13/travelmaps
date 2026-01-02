#!/usr/bin/env node

import fs from "node:fs/promises";
import * as SVG from "@svgdotjs/svg.js";
import { createSVGWindow } from "svgdom";
import type { Trip, Stage } from "./trips.js";
import pretty from "pretty";
import simplify from "simplify-js";

const FILENAME = "./travels.json";
const OUTPUT_DIR = "./output";

const PADDING = 5;
const KEY_ELEVATIONS_HEIGHT = 20;
const STAGE_MARKERS_HEIGHT = 15;
const PROMINENT_ELEVATION_LABELS_HEIGHT = 15;

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
  elevationData: number[],
  distanceData: number[],
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
  const svgWidth = PADDING + plotWidth + PADDING;
  const svgHeight =
    PADDING +
    (options?.labelProminentElevations ? PROMINENT_ELEVATION_LABELS_HEIGHT : 0) +
    plotHeight +
    (options?.stageMarkers ? STAGE_MARKERS_HEIGHT : 0) +
    (options?.showKeyElevations ? KEY_ELEVATIONS_HEIGHT : 0) +
    PADDING;
  const canvas = SVG.SVG().size(svgWidth, svgHeight);

  let svgY = PADDING;

  const clampedElevationData = elevationData.map((e) => Math.max(0, e));
  const maxElevation = Math.max(Math.max(...clampedElevationData), 200);
  const minElevation = 0;
  const elevationRange = maxElevation - minElevation;

  const maxDistance = Math.max(...distanceData);

  if (options?.labelProminentElevations) {
    svgY += PROMINENT_ELEVATION_LABELS_HEIGHT;
  }

  const points = clampedElevationData.map((elevation, index) => {
    const x = (distanceData[index] / maxDistance) * plotWidth + PADDING;
    const y = (1 - (elevation - minElevation) / elevationRange) * plotHeight + svgY;
    return { x, y };
  });

  const simplifiedPoints = simplify(points, 0.1, true).map(({ x, y }) => [x, y]);

  if (options?.horizontalGridlines) {
    // Add gridlines
    const gridlineColor = "#e0e0e0";
    const numHorizontalGridlines = 4;
    for (let i = 0; i < numHorizontalGridlines; i++) {
      const y = svgY + (i / (numHorizontalGridlines - 1)) * plotHeight;
      canvas.line(PADDING, y, plotWidth - PADDING, y).stroke({ color: gridlineColor, width: 1 });
    }
  }

  // Create a path from the points
  const pathString = simplifiedPoints.map((p, i) => (i === 0 ? "M" : "L") + p.join(" ")).join(" ");

  // Create a gradient fill
  const gradient = canvas.gradient("linear", function (add) {
    add.stop({ offset: 0, color: "#ec9598", opacity: 1 });
    add.stop({ offset: 1, color: "#ffe8e9", opacity: 1 });
  });
  gradient.from(0, 0).to(0, 1);

  // Create a path for the fill area
  const fillPathString =
    pathString +
    ` L ${simplifiedPoints[simplifiedPoints.length - 1][0]} ${plotHeight + svgY} L ${
      simplifiedPoints[0][0]
    } ${plotHeight + svgY} Z`;
  canvas.path(fillPathString).fill(gradient).stroke("none");

  canvas
    .path(pathString)
    .fill("none")
    .stroke({ color: "#C61016", width: 2, linecap: "round", linejoin: "round" });

  svgY += plotHeight;

  canvas.style().rule(".label", {
    fontFamily: "Helvetica Neue, sans-serif",
    fontSize: "16px",
    fontWeight: 300,
    "letter-spacing": "0.05em",
    "dominant-baseline": "alphabetical",
  });

  if (options?.labelProminentElevations) {
    // Calculate most prominent elevations based on the 1D elevation profile

    const minProminence = options.labelProminentElevations.minProminence ?? 30;

    for (let i = 0; i < clampedElevationData.length; i++) {
      const elevation = clampedElevationData[i];

      let minLeft = elevation;
      let hasHigherLeft = false;
      // Scan left
      for (let j = i - 1; j >= 0; j--) {
        if (clampedElevationData[j] > elevation) {
          hasHigherLeft = true;
          break;
        }
        if (clampedElevationData[j] < minLeft) {
          minLeft = clampedElevationData[j];
        }
      }

      let minRight = elevation;
      let hasHigherRight = false;
      // Scan right
      for (let j = i + 1; j < clampedElevationData.length; j++) {
        if (clampedElevationData[j] > elevation) {
          hasHigherRight = true;
          break;
        }
        if (clampedElevationData[j] < minRight) {
          minRight = clampedElevationData[j];
        }
      }

      let prominence = 0;
      if (hasHigherLeft && hasHigherRight) {
        prominence = elevation - Math.max(minLeft, minRight);
      } else if (hasHigherLeft) {
        prominence = elevation - minLeft;
      } else if (hasHigherRight) {
        prominence = elevation - minRight;
      } else {
        // Global maximum
        prominence = Infinity;
      }

      if (prominence >= minProminence) {
        const x = points[i].x;
        const labelY = points[i].y - 5;

        canvas
          .text(`${Math.round(elevation)}m`)
          .amove(x, labelY)
          .addClass("label")
          .font({ anchor: "middle" });
      }
    }
  }

  if (options?.stageMarkers) {
    const stageMarkers = options.stageMarkers;
    const color = "#808080";
    for (const [i, marker] of stageMarkers.entries()) {
      const x = (marker.distance / maxDistance) * plotWidth + PADDING;
      const xNext =
        ((stageMarkers[i + 1]?.distance || maxDistance) / maxDistance) * plotWidth + PADDING;
      canvas.line(x, svgY, x, svgY + 5).stroke({ color, width: 1 });
      const elevationY = points[distanceData.findIndex((value) => value >= marker.distance)];
      canvas.line(x, svgY, x, elevationY.y).stroke({ color, width: 1, dasharray: "2 4" });
      canvas
        .text(marker.label)
        .amove((x + xNext) / 2, svgY + 15)
        .addClass("label")
        .font({ anchor: "middle" });
    }
    canvas
      .line(plotWidth + PADDING, svgY, plotWidth + PADDING, svgY + 5)
      .stroke({ color, width: 1 });

    svgY += STAGE_MARKERS_HEIGHT;
  }

  // Add distance labels with ticks
  // const numVerticalTicks = 4;
  // for (let i = 0; i < numVerticalTicks; i++) {
  //   const distance = (i / (numVerticalTicks - 1)) * maxDistance;
  //   const x = LEFT_PADDING + (i / (numVerticalTicks - 1)) * plotWidth;
  //   canvas
  //     .line(x, svgHeight - BOTTOM_PADDING, x, svgHeight - BOTTOM_PADDING + 5)
  //     .stroke({ color: gridlineColor, width: 1 });
  //   canvas
  //     .text(`${(distance / 1000).toFixed(1)}km`)
  //     .amove(x, svgHeight - BOTTOM_PADDING + 10)
  //     .font({
  //       family: "Montserrat, sans-serif",
  //       size: 12,
  //       anchor: "middle",
  //       "dominant-baseline": "hanging",
  //     });
  // }

  // Key elevations
  if (options?.showKeyElevations) {
    svgY += KEY_ELEVATIONS_HEIGHT;

    // Start elevation
    const startElevation = clampedElevationData[0];
    canvas
      .text(`${Math.round(startElevation)}m`)
      .amove(PADDING, svgY)
      .addClass("label")
      .font({ anchor: "start" });

    // Peak elevation
    const actualMaxElevation = Math.max(...clampedElevationData);
    canvas
      .text(`⏶ ${Math.round(actualMaxElevation)}m`)
      .amove(plotWidth / 2, svgY)
      .addClass("label")
      .font({ anchor: "middle" });

    // End elevation
    const endElevation = clampedElevationData[clampedElevationData.length - 1];
    canvas
      .text(`${Math.round(endElevation)}m`)
      .amove(plotWidth - PADDING, svgY)
      .addClass("label")
      .font({ anchor: "end" });
  }

  // Add max elevation indicator
  const maxElevationIndex = clampedElevationData.indexOf(Math.max(...clampedElevationData));
  const maxElevationPoint = points[maxElevationIndex];

  // Use a filled triangle for the max elevation indicator
  const triangleSize = 10;
  const cx = maxElevationPoint.x;
  const cy = maxElevationPoint.y;

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
          showKeyElevations: true,
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
        labelProminentElevations: { minProminence: 300 },
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
