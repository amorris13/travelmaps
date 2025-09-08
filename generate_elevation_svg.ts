#!/usr/bin/env node

import fs from 'node:fs/promises';
import * as SVG from '@svgdotjs/svg.js';
import { createSVGWindow } from 'svgdom';
import type { Trip, Stage } from './trips.js';
import pretty from 'pretty';

const FILENAME = './travels.json';
const OUTPUT_DIR = './output';

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

async function generateElevationSvg(trip: Trip, stage: Stage, stageIndex: number, elevationData: number[]) {
  const SVG_WIDTH = 800;
  const SVG_HEIGHT = 200;
  const PADDING = 20;

  const canvas = SVG.SVG().size(SVG_WIDTH, SVG_HEIGHT);

  const maxElevation = Math.max(...elevationData);
  const minElevation = Math.min(...elevationData);
  const elevationRange = maxElevation - minElevation;

  const points = elevationData.map((elevation, index) => {
    const x = (index / (elevationData.length - 1)) * (SVG_WIDTH - 2 * PADDING) + PADDING;
    const y = (1 - (elevation - minElevation) / elevationRange) * (SVG_HEIGHT - 2 * PADDING) + PADDING;
    return [x, y];
  });

  // Create a path from the points
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.join(' ')).join(' ');

  canvas.path(path)
    .fill('none')
    .stroke({ color: '#C61016', width: 2, linecap: 'round', linejoin: 'round' });

  // Add a title
  const title = `${trip.name}: ${stage.strava_data?.name || `Stage ${stageIndex + 1}`}`;
  canvas.text(title)
    .move(PADDING, PADDING / 2)
    .font({ family: 'Helvetica', size: 16, weight: 'bold' });

  // Add elevation labels
  canvas.text(`${Math.round(maxElevation)}m`)
      .move(PADDING, PADDING)
      .font({ family: 'Helvetica', size: 12 });
  canvas.text(`${Math.round(minElevation)}m`)
      .move(PADDING, SVG_HEIGHT - PADDING - 12)
      .font({ family: 'Helvetica', size: 12 });


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
  console.log('Generating elevation SVGs...');

  let travelsJson: Trip[];
  try {
    const data = await fs.readFile(FILENAME, { encoding: 'utf8' });
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
      if (stage.strava_data && stage.strava_data.elevation_stream) {
        const elevationStream = stage.strava_data.elevation_stream.split(',').map(Number);
        await generateElevationSvg(trip, stage, i, elevationStream);
      }
    }
  }

  console.log('Finished generating elevation SVGs.');
}

main().catch(error => {
  console.error('An unhandled error occurred:', error);
  process.exit(1);
});
