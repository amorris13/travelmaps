#!/usr/bin/env node

import fs from "node:fs/promises";
import type { Trip } from "./trips.js";
import {
  computeElevationProfile,
  renderElevationProfileAsSvg,
  parseStream,
} from "./lib/elevation.js";
import { toSnakeCase } from "./lib/utils.js";

const FILENAME = "./travels.json";
const OUTPUT_DIR = "./output";

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

  return renderElevationProfileAsSvg(profileData, {
    width: profileData.svgWidth,
    height: profileData.svgHeight,
    includeSvgTag: true,
  });
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
        const elevationStream = parseStream(stage.strava_data.elevation_stream);
        const distanceStream = parseStream(stage.strava_data.distance_stream);

        const svgContent = generateElevationSvg(
          elevationStream,
          distanceStream,
          600,
          180,
          {
            horizontalGridlines: true,
            labelProminentElevations: { minProminence: 100 },
          }
        );

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
          distanceStream.length > 0
            ? distanceStream[distanceStream.length - 1]
            : 0;
        tripDistanceData = tripDistanceData.concat(
          distanceStream.map((d) => d + cumulativeDistance)
        );
        stageMarkers.push({ distance: cumulativeDistance, label: `${i + 1}` });
        cumulativeDistance += lastDistance;
      }
    }

    if (tripElevationData.length > 0) {
      const svgContent = generateElevationSvg(
        tripElevationData,
        tripDistanceData,
        1600,
        200,
        {
          stageMarkers,
          labelProminentElevations: { minProminence: 250 },
        }
      );
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
