#!/usr/bin/env node

import fs from "node:fs/promises";
import type { Trip, Stage } from "./trips.ts";

const FILENAME = "./travels.json";

async function main(): Promise<void> {
  let travelsJson: Trip[];
  try {
    const data = await fs.readFile(FILENAME, { encoding: "utf8" });
    travelsJson = JSON.parse(data) as Trip[];
  } catch (error: any) {
    console.error(
      `Error reading or parsing ${FILENAME}:`,
      error?.message || error
    );
    process.exit(1);
  }

  for (const trip of travelsJson) {
    if (!trip.stages) continue;

    const newStages: Stage[] = [];
    let dayStopBuffer: Stage[] = [];

    for (let i = 0; i < trip.stages.length; i++) {
      const stage = trip.stages[i];

      if (stage.mode === "bicycling" && stage.dayStop) {
        dayStopBuffer.push(stage);
      } else if (stage.mode === "bicycling") {
        if (dayStopBuffer.length > 0) {
          if (!stage.stops) {
            stage.stops = [];
          }
          for (const dayStopStage of dayStopBuffer) {
            stage.stops.push({
              name: dayStopStage.endLocation.name,
              latlng: dayStopStage.endLocation.latlng,
            });
          }
          // Clear polyline to be regenerated
          stage.polyline = undefined;
          dayStopBuffer = [];
        }
        newStages.push(stage);
      } else {
        if (dayStopBuffer.length > 0) {
          const lastDayStop = dayStopBuffer.pop()!;
          delete lastDayStop.dayStop;
          newStages.push(...dayStopBuffer, lastDayStop);
          dayStopBuffer = [];
        }
        newStages.push(stage);
      }
    }

    if (dayStopBuffer.length > 0) {
      const lastDayStop = dayStopBuffer.pop()!;
      delete lastDayStop.dayStop;
      newStages.push(...dayStopBuffer, lastDayStop);
    }

    trip.stages = newStages;

    if (trip.name === "London to Rome Bicycling") {
      (trip as any).hideStops = true;
    }
  }

  try {
    await fs.writeFile(FILENAME, JSON.stringify(travelsJson, null, 2));
    console.log(`Updated ${FILENAME} with migrated bicycling stages.`);
  } catch (error: any) {
    console.error(
      `Error writing updated data to ${FILENAME}:`,
      error?.message || error
    );
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("An unhandled error occurred during migration:", message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
