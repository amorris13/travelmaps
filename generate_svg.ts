#!/usr/bin/env node

import parseArgs from "minimist";
import { createSVGWindow } from "svgdom";
import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.filter.js";
import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";
import pretty from "pretty";
import pixelWidth from "string-pixel-width";
import type { Shape } from "svg-intersections";
import { intersect, shape } from "svg-intersections";
import seedrandom from "seedrandom";
import simplify from "simplify-js";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Import shared types
import type {
  Trip as RawTrip,
  Stage as RawStage,
  Location as RawLocation,
  LatLng,
} from "./trips.ts";

// --- Type Definitions ---

interface RegionBounds {
  north: number;
  east: number;
  south: number;
  west: number;
  scale?: number; // Optional scale factor for region overview
}

interface TripBounds extends RegionBounds {
  lngShift?: number; // Added during calculation if wrapping occurs
}

interface Location extends RawLocation {
  latlng: LatLng;
}

interface Stage extends RawStage {
  startLocation?: Location;
  endLocation: Location;
  lngShift?: number; // Added during calculation if wrapping occurs
}

interface Trip extends RawTrip {
  stages: Stage[];
}

interface Regions {
  [key: string]: RegionBounds;
}

interface LabelPoint {
  name: string;
  point: SVG.Point;
  partialAttendance?: boolean;
}

interface SimpleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LabelOffsetOption {
  offset: number;
  offsetPoint: SVG.Point;
  labelRect: SimpleRect;
  shape: Shape;
  prominence: {
    prominence: number;
    closestPoint: LabelPoint | undefined;
  };
}

interface LabelPlacement extends LabelOffsetOption {
  label: LabelPoint;
  intersects: boolean;
}

interface LabelPlacementResult {
  result: LabelPlacement[];
  numberOfIntersections: number;
  averageOffset: number;
  labelSeparationScore: number;
  labelProminenceScore: number;
}

interface ParsedArgs extends parseArgs.ParsedArgs {
  year?: number;
  filename?: string;
  staticmap?: boolean;
  specificMap?: string;
  stageMaps?: boolean;
}

interface TripSvgResult {
  svgCanvas: SVG.Svg;
  boundingBox: SVG.Box;
}

// --- Constants ---
const EXPORT_PRECISION = 3;
const SIDE_PX = 1200;

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGIONS: Regions = {
  UK: {
    north: 61,
    east: 2.4,
    south: 49.4,
    west: -12,
    scale: 0.625,
  },
  Europe: {
    north: 63.3313,
    east: 39.0154,
    south: 27.3501,
    west: -15.0154,
  },
  Australia: {
    north: -10,
    east: 155,
    south: -44,
    west: 112,
  },
  World: {
    north: 75,
    east: 180,
    south: -60,
    west: -180,
  },
};

// --- SVG.js Extensions ---

// Augment the SVG.js Point interface
declare module "@svgdotjs/svg.js" {
  interface Point {
    round(precision: number): this;
  }
  interface Element {
    at(point: SVG.Point | SVG.Point): this;
    centerAt(point: SVG.Point | SVG.Point): this;
  }
}

SVG.extend(SVG.Point, {
  round: function (this: SVG.Point, precision: number): SVG.Point {
    this.x = round(this.x, precision);
    this.y = round(this.y, precision);
    return this;
  },
});

SVG.extend(SVG.Element, {
  at: function (this: SVG.Element, point: SVG.Point): SVG.Element {
    return this.x(point.x).y(point.y);
  },
  centerAt: function (this: SVG.Element, point: SVG.Point): SVG.Element {
    // Use cx/cy for elements that support it (like Circle), fallback to x/y adjustments
    if ("cx" in this && typeof this.cx === "function") {
      (this as SVG.Circle).cx(point.x).cy(point.y);
    } else {
      const box = this.bbox();
      this.x(point.x - box.width / 2).y(point.y - box.height / 2);
    }
    return this;
  },
});

const svgExportModifier = (node: SVG.Dom): void => {
  node.round(EXPORT_PRECISION);
};

// --- Main Execution ---

async function main(): Promise<void> {
  const argv: ParsedArgs = parseArgs(process.argv.slice(2), {
    boolean: ["staticmap", "stageMaps"],
  }) as ParsedArgs;
  const year = argv.year;
  const filename = argv.filename;
  const fetchStaticMap = argv.staticmap;
  const generateStageMaps = argv.stageMaps;

  if (!filename) {
    console.error("Error: --filename argument is required.");
    process.exit(1);
  }
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    console.error("Error: MAPBOX_ACCESS_TOKEN environment variable is not set.");
    process.exit(1);
  }

  let trips: Trip[];
  try {
    const data = await fs.readFile(filename, { encoding: "utf8" });
    trips = JSON.parse(data) as Trip[];
  } catch (error: any) {
    console.error(`Error reading or parsing ${filename}:`, error?.message || error);
    process.exit(1);
  }

  if (year) {
    trips = trips.filter((trip) => new Date(trip.startDate).getFullYear() === year);
  }

  // Process each trip
  for (const trip of trips) {
    const mapname = new Date(trip.startDate).getFullYear() + "-" + toSnakeCase(trip.name);
    if (argv.specificMap && argv.specificMap !== mapname) {
      continue;
    }
    await processTrip(mapname, trip, fetchStaticMap ?? false);

    // Generate individual stage maps if requested
    if (generateStageMaps) {
      await processStageMaps(mapname, trip, fetchStaticMap ?? false);
    }
  }

  if (fetchStaticMap) {
    for (const [region, bounds] of Object.entries(REGIONS)) {
      await fetchRegionMap(region, bounds);
    }
  }

  // Calculate all years covered by trips. Ignore home. Dedupe.
  const years = new Set(
    trips.filter((trip) => !trip.isHome).map((trip) => new Date(trip.startDate).getFullYear())
  );

  for (const year of years) {
    // Find all trips covered by this year
    const tripsForYear = trips.filter(
      (trip) =>
        new Date(trip.startDate).getFullYear() <= year &&
        new Date(trip.endDate).getFullYear() >= year
    );

    // Group trips by region - Map.groupBy requires ES2022+ target or polyfill
    // Using a manual grouping approach for broader compatibility
    const tripsByRegion = new Map<string, Trip[]>();
    for (const trip of tripsForYear) {
      const tripBounds = computeTripBounds(trip);
      const regionKey =
        Object.keys(REGIONS).find((region) => {
          const regionBounds = REGIONS[region];
          return (
            tripBounds.north <= regionBounds.north &&
            tripBounds.east <= regionBounds.east &&
            tripBounds.south >= regionBounds.south &&
            tripBounds.west >= regionBounds.west
          );
        }) || "World";

      if (!tripsByRegion.has(regionKey)) {
        tripsByRegion.set(regionKey, []);
      }
      tripsByRegion.get(regionKey)!.push(trip);
    }

    for (const [region, tripsForRegion] of tripsByRegion) {
      const mapname = `${year}-overview-${toSnakeCase(region)}`;
      if (argv.specificMap && argv.specificMap !== mapname) {
        continue;
      }
      await processRegion(mapname, region, REGIONS[region], tripsForRegion);
    }
  }
}

// --- Processing Functions ---

async function processTrip(
  filename: string,
  tripJson: Trip,
  fetchStaticMap: boolean
): Promise<void> {
  if (!tripJson.stages || tripJson.stages.length < 2) {
    // Need at least 2 stages for bounds/lines
    console.info(`Skipping trip "${tripJson.name}" as it has less than 2 stages.`);
    return;
  }

  await fs.mkdir("output", { recursive: true });

  const tripSvgResult = generateTripSvg(tripJson);
  await writeFileAndLog(
    "output/" + filename + ".svg",
    pretty(tripSvgResult.svgCanvas.svg(svgExportModifier))
  );

  const mapFileName = "output/" + filename + ".png";
  const mapExists = await fileExists(mapFileName);
  if (fetchStaticMap && !mapExists) {
    try {
      const staticMap = await fetchStaticMapMapbox(tripSvgResult.boundingBox);
      await writeFileAndLog(mapFileName, staticMap);
    } catch (error) {
      console.error(`Failed to fetch or process static map for ${filename}:`, error);
      // Continue without the map background
    }
  }

  tripSvgResult.svgCanvas
    .image(filename + ".png")
    .size(SIDE_PX, SIDE_PX)
    .back();
  await writeFileAndLog(
    "output/" + filename + "-withmap.svg",
    pretty(tripSvgResult.svgCanvas.svg(svgExportModifier))
  );
}

async function processRegion(
  name: string,
  regionName: string,
  regionBounds: RegionBounds,
  trips: Trip[]
): Promise<void> {
  await fs.mkdir("output", { recursive: true });

  const regionSvg = generateRegionSvg(name, regionName, regionBounds, trips);
  await writeFileAndLog("output/" + name + ".svg", pretty(regionSvg.svg(svgExportModifier)));

  const mapFileName = "output/" + toSnakeCase(regionName) + ".png";
  const mapExists = await fileExists(mapFileName);
  if (mapExists) {
    const box = regionSvg.viewbox();
    regionSvg
      .image(toSnakeCase(regionName) + ".png")
      .size(box.width, box.height)
      .back();
    await writeFileAndLog(
      "output/" + name + "-withmap.svg",
      pretty(regionSvg.svg(svgExportModifier))
    );
  } else {
    console.warn(
      `Static map file ${mapFileName} not found for region ${regionName}. Skipping map background.`
    );
  }
}

// --- SVG Generation ---

function generateTripSvg(trip: Trip): TripSvgResult {
  console.log(`Generating Trip SVG for ${trip.name}`);
  const tripBounds = computeTripBounds(trip, true); // This now adds lngShift to stages

  // Convert trip bounds to mercator projection
  const boundingBox = latlngToMercatorBbox(tripBounds);
  const maxSize = Math.max(boundingBox.width, boundingBox.height);
  // Ensure no division by zero
  const scaleX = boundingBox.width === 0 ? 1 : maxSize / boundingBox.width;
  const scaleY = boundingBox.height === 0 ? 1 : maxSize / boundingBox.height;

  const squareBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(scaleX, scaleY, boundingBox.cx, boundingBox.cy)
  );
  const expandedBoundingBox = squareBoundingBox.transform(
    new SVG.Matrix().scale(1.3, squareBoundingBox.cx, squareBoundingBox.cy)
  );

  // Ensure no division by zero for transform scale
  const sidePx = SIDE_PX;
  const transformScale = Math.min(
    expandedBoundingBox.width === 0 ? 1 : sidePx / expandedBoundingBox.width,
    expandedBoundingBox.height === 0 ? 1 : sidePx / expandedBoundingBox.height
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(transformScale))
    .lmultiply(new SVG.Matrix().translate(sidePx / 2, sidePx / 2));

  const window = createSVGWindow();
  const document = window.document;
  SVG.registerWindow(window, document);
  const canvas = SVG.SVG(document.documentElement) as SVG.Svg;
  canvas.viewbox(0, 0, sidePx, sidePx);

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);

  const markerMask = canvas.mask();
  markerMask.add(canvas.rect(sidePx, sidePx).move(0, 0).fill("white"));

  // Use the shape type from svg-intersections
  const shapes: Shape[] = [];

  // Add lines for each leg
  for (const stage of trip.stages) {
    if (!stage.polyline || stage.hidePolyline) {
      continue;
    }
    const pathArray = pathFromPolyline(decodePolyline(stage.polyline), transform, stage.lngShift);
    if (pathArray.length > 0) {
      const pathBackground = canvas.path(pathArray).addClass("lineBackground");
      const path = canvas
        .path(pathArray)
        .addClass("line")
        .addClass(stage.mode ?? "unknown")
        .maskWith(markerMask);
      if (stage.partialAttendance) {
        pathBackground.addClass("partialAttendance");
        path.addClass("partialAttendance");
      }
      // Create shape for intersection testing
      shapes.push(shape("path", { d: pathArray.toString() }));
    }
  }

  const labelPoints: LabelPoint[] = [];

  // Add marker for each stage
  for (const stage of trip.stages) {
    if (stage.hideWaypoint) {
      continue;
    }
    const point = toMercator(shiftLatLng(stage.endLocation.latlng, stage.lngShift || 0)).transform(
      transform
    );
    const marker = canvas.circle().radius(markerRadius).centerAt(point);
    markerMask.add(marker.clone().fill("black"));
    marker.addClass("stage");
    if (stage.dayStop) {
      marker.addClass("dayStop");
    }
    if (stage.partialAttendance) {
      marker.addClass("partialAttendance");
    }
    // Create shape for intersection testing
    shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius }));

    if (!stage.hideWaypoint && !stage.hideLabel) {
      labelPoints.push({
        name: stage.endLocation.name,
        point,
        partialAttendance: stage.partialAttendance,
      });
    }

    // Add markers for stops in this stage
    if (stage.stops && stage.stops.length > 0) {
      for (const stop of stage.stops) {
        if (stop.latlng) {
          const point = toMercator(stop.latlng).transform(transform);
          const marker = canvas
            .circle()
            .radius(markerRadius * 0.7)
            .centerAt(point);
          markerMask.add(marker.clone().fill("black"));
          marker.addClass("dayStop");
          // Create shape for intersection testing
          shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius * 0.7 }));
          if (stop.name) {
            labelPoints.push({
              name: stop.name,
              point,
            });
          }
        }
      }
    }
  }

  const bestLabelPlacement = calculateBestLabelPositions(
    labelPoints,
    32,
    labelFontSizePx,
    shapes,
    sidePx,
    sidePx
  );

  for (const labelPlacement of bestLabelPlacement.result) {
    if (labelPlacement.intersects) {
      console.log(`Intersecting ${labelPlacement.label.name}`);
    }
    const rect = labelPlacement.labelRect;
    canvas
      .rect(rect.width, rect.height)
      .x(rect.x)
      .y(rect.y)
      .opacity(0.2)
      .fill(labelPlacement.intersects ? "red" : "green")
      .addClass("labelRect");
    // Add the label's shape to the list for future intersection checks
    shapes.push(labelPlacement.shape);
    const label = canvas
      .text(labelPlacement.label.name)
      .at(labelPlacement.offsetPoint)
      .addClass("label");
    if (labelPlacement.label.partialAttendance) {
      label.addClass("partialAttendance");
    }
  }

  return { svgCanvas: canvas, boundingBox: expandedBoundingBox };
}

function generateStageSvg(tripName: string, stage: Stage): TripSvgResult {
  console.log(`Generating Stage SVG for ${tripName} - ${stage.endLocation.name}`);

  // Calculate bounds for this stage including stops
  const stageBounds = computeStageBounds(stage);

  // Convert stage bounds to mercator projection
  const boundingBox = latlngToMercatorBbox(stageBounds);
  const maxSize = Math.max(boundingBox.width, boundingBox.height);
  // Ensure no division by zero
  const scaleX = boundingBox.width === 0 ? 1 : maxSize / boundingBox.width;
  const scaleY = boundingBox.height === 0 ? 1 : maxSize / boundingBox.height;

  const squareBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(scaleX, scaleY, boundingBox.cx, boundingBox.cy)
  );
  const expandedBoundingBox = squareBoundingBox.transform(
    new SVG.Matrix().scale(1.3, squareBoundingBox.cx, squareBoundingBox.cy)
  );

  // Ensure no division by zero for transform scale
  const sidePx = 800;
  const transformScale = Math.min(
    expandedBoundingBox.width === 0 ? 1 : sidePx / expandedBoundingBox.width,
    expandedBoundingBox.height === 0 ? 1 : sidePx / expandedBoundingBox.height
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(transformScale))
    .lmultiply(new SVG.Matrix().translate(sidePx / 2, sidePx / 2));

  const window = createSVGWindow();
  const document = window.document;
  SVG.registerWindow(window, document);
  const canvas = SVG.SVG(document.documentElement) as SVG.Svg;
  canvas.viewbox(0, 0, sidePx, sidePx);

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);

  const markerMask = canvas.mask();
  markerMask.add(canvas.rect(sidePx, sidePx).move(0, 0).fill("white"));

  // Use the shape type from svg-intersections
  const shapes: Shape[] = [];
  const labelPoints: LabelPoint[] = [];

  const decodedPolyline = stage.polyline
    ? decodePolyline(stage.polyline)
    : [stage.startLocation?.latlng, stage.endLocation.latlng].filter(
        (latlng) => latlng !== undefined
      );

  // Add polyline for this stage if it exists
  const pathArray = pathFromPolyline(decodedPolyline, transform);
  if (pathArray.length > 0) {
    const pathBackground = canvas.path(pathArray).addClass("lineBackground");
    const path = canvas
      .path(pathArray)
      .addClass("line")
      .addClass(stage.mode ?? "unknown")
      .maskWith(markerMask);
    if (stage.partialAttendance) {
      pathBackground.addClass("partialAttendance");
      path.addClass("partialAttendance");
    }
    // Create shape for intersection testing
    shapes.push(shape("path", { d: pathArray.toString() }));
  }

  // Add marker for the stage start location
  if (stage.startLocation) {
    const startPoint = toMercator(decodedPolyline.at(0)!).transform(transform);
    const startMarker = canvas.circle().radius(markerRadius).centerAt(startPoint);
    markerMask.add(startMarker.clone().fill("black"));
    startMarker.addClass("stage");
    if (stage.partialAttendance) {
      startMarker.addClass("partialAttendance");
    }
    // Create shape for intersection testing
    shapes.push(shape("circle", { cx: startPoint.x, cy: startPoint.y, r: markerRadius }));
    labelPoints.push({
      name: stage.startLocation.name,
      point: startPoint,
      partialAttendance: stage.partialAttendance,
    });
  }

  // Add marker for the stage end location
  const endPoint = toMercator(decodedPolyline.at(-1)!).transform(transform);
  const marker = canvas.circle().radius(markerRadius).centerAt(endPoint);
  markerMask.add(marker.clone().fill("black"));
  marker.addClass("stage");
  if (stage.partialAttendance) {
    marker.addClass("partialAttendance");
  }
  // Create shape for intersection testing
  shapes.push(shape("circle", { cx: endPoint.x, cy: endPoint.y, r: markerRadius }));
  labelPoints.push({
    name: stage.endLocation.name,
    point: endPoint,
    partialAttendance: stage.partialAttendance,
  });

  // Add markers for stops in this stage
  if (stage.stops && stage.stops.length > 0) {
    for (const stop of stage.stops) {
      if (stop.latlng) {
        const point = toMercator(stop.latlng).transform(transform);
        const marker = canvas
          .circle()
          .radius(markerRadius * 0.7)
          .centerAt(point);
        markerMask.add(marker.clone().fill("black"));
        marker.addClass("dayStop");
        // Create shape for intersection testing
        shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius * 0.7 }));
        if (stop.name) {
          labelPoints.push({
            name: stop.name,
            point,
          });
        }
      }
    }
  }

  // Add marker for max elevation point
  if (stage.strava_data?.elevation_stream && stage.strava_data?.distance_stream && stage.polyline) {
    const elevations = stage.strava_data.elevation_stream.split(",").map(Number);
    const distances = stage.strava_data.distance_stream.split(",").map(Number);
    const maxElevation = Math.max(...elevations);
    const maxElevationIndex = elevations.indexOf(maxElevation);
    const distanceAtMaxElevation = distances[maxElevationIndex];
    const totalStravaDistance = Math.max(...distances);
    const fraction = totalStravaDistance > 0 ? distanceAtMaxElevation / totalStravaDistance : 0;

    const maxElevationLatLng = findPointAtFraction(decodedPolyline, fraction);

    if (maxElevationLatLng) {
      const point = toMercator(maxElevationLatLng).transform(transform);
      const triangleSize = markerRadius * 3;
      // Points for an upward-pointing equilateral triangle centered at (0,0)
      const points = [
        [0, -triangleSize * (Math.sqrt(3) / 3)], // Top vertex
        [-triangleSize / 2, triangleSize * (Math.sqrt(3) / 6)], // Bottom-left vertex
        [triangleSize / 2, triangleSize * (Math.sqrt(3) / 6)], // Bottom-right vertex
      ]
        .map(([x, y]) => `${point.x + x},${point.y + y}`)
        .join(" ");

      const triangle = canvas.polygon(points);
      markerMask.add(triangle.clone().scale(1.5, 1.5, point.x, point.y).fill("black"));
      triangle.addClass("elevationMarker");

      // Add shape for intersection testing
      const bbox = triangle.bbox();
      shapes.push(shape("rect", { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }));
    }
  }

  const bestLabelPlacement = calculateBestLabelPositions(
    labelPoints,
    32,
    labelFontSizePx,
    shapes,
    sidePx,
    sidePx
  );

  for (const labelPlacement of bestLabelPlacement.result) {
    if (labelPlacement.intersects) {
      console.log(`Intersecting ${labelPlacement.label.name}`);
    }
    canvas
      .rect(labelPlacement.labelRect.width, labelPlacement.labelRect.height)
      .x(labelPlacement.labelRect.x)
      .y(labelPlacement.labelRect.y)
      .opacity(0.2)
      .fill(labelPlacement.intersects ? "red" : "green")
      .addClass("labelRect");
    // Add the label's shape to the list for future intersection checks
    shapes.push(labelPlacement.shape);
    const label = canvas
      .text(labelPlacement.label.name)
      .at(labelPlacement.offsetPoint)
      .addClass("label");
    if (labelPlacement.label.partialAttendance) {
      label.addClass("partialAttendance");
    }
  }

  return { svgCanvas: canvas, boundingBox: expandedBoundingBox };
}

async function processStageMaps(
  tripFilename: string,
  tripJson: Trip,
  fetchStaticMap: boolean
): Promise<void> {
  if (!tripJson.stages || tripJson.stages.length === 0) {
    console.info(`Skipping stage maps for trip "${tripJson.name}" as it has no stages.`);
    return;
  }

  await fs.mkdir("output", { recursive: true });

  // Process each stage individually
  let j = 1;
  for (let i = 1; i < tripJson.stages.length; i++) {
    const stage = tripJson.stages[i];
    if (!stage.strava_data) continue;
    stage.startLocation = tripJson.stages[i - 1].endLocation;
    const stageFilename = `${tripFilename}-stage-${j++}`;

    await processStage(stageFilename, tripJson.name, stage, fetchStaticMap);
  }
}

async function processStage(
  filename: string,
  tripName: string,
  stage: Stage,
  fetchStaticMap: boolean
): Promise<void> {
  if (!stage.endLocation.latlng) {
    console.info(`Skipping stage "${stage.endLocation.name}" as it has no coordinates.`);
    return;
  }

  const stageSvgResult = generateStageSvg(tripName, stage);
  await writeFileAndLog(
    "output/" + filename + ".svg",
    pretty(stageSvgResult.svgCanvas.svg(svgExportModifier))
  );

  const mapFileName = "output/" + filename + ".png";
  const mapExists = await fileExists(mapFileName);
  if (fetchStaticMap && !mapExists) {
    try {
      const staticMap = await fetchStaticMapMapbox(stageSvgResult.boundingBox);
      await writeFileAndLog(mapFileName, staticMap);
    } catch (error) {
      console.error(`Failed to fetch or process static map for ${filename}:`, error);
      // Continue without the map background
    }
  }

  const box = stageSvgResult.svgCanvas.viewbox();
  stageSvgResult.svgCanvas
    .image(filename + ".png")
    .size(box.width, box.height)
    .back();
  await writeFileAndLog(
    "output/" + filename + "-withmap.svg",
    pretty(stageSvgResult.svgCanvas.svg(svgExportModifier))
  );
}

function generateRegionSvg(
  name: string,
  regionName: string,
  regionBounds: RegionBounds,
  trips: Trip[]
): SVG.Svg {
  console.log(`Generating Overview SVG for ${name}`);

  const boundingBox = latlngToMercatorBbox(regionBounds);
  // Ensure no division by zero
  const maxDim = Math.max(boundingBox.width, boundingBox.height);
  const baseScale = maxDim === 0 ? 1 : SIDE_PX / maxDim;
  const scale = baseScale * (regionBounds.scale || 1);
  const widthPx = boundingBox.width * scale;
  const heightPx = boundingBox.height * scale;

  const transform = new SVG.Matrix()
    .translate(-boundingBox.cx, -boundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(scale))
    .lmultiply(new SVG.Matrix().translate(widthPx / 2, heightPx / 2));

  const window = createSVGWindow();
  const document = window.document;
  SVG.registerWindow(window, document);
  const canvas = SVG.SVG(document.documentElement) as SVG.Svg;
  canvas.viewbox(0, 0, widthPx, heightPx);

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);

  // Use the shape type from svg-intersections
  const shapes: Shape[] = [];

  // Add shapes for other regions to avoid overlap if needed (optional)
  for (const [region, bounds] of Object.entries(REGIONS)) {
    if (region === regionName) {
      break; // Don't draw the current region's box on itself
    }
    const bbox = latlngToMercatorBbox(bounds).transform(transform);
    shapes.push(shape("rect", { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }));
  }

  const filteredTrips = trips.filter((trip) => !trip.hideOnOverview);

  // Add lines/markers for each trip
  for (const trip of filteredTrips) {
    if (!trip.stages || trip.stages.length === 0) continue;

    if (trip.stages.length === 1) {
      const stage = trip.stages[0];
      const point = toMercator(stage.endLocation.latlng).transform(transform);
      let marker: SVG.Element;
      if (trip.isHome) {
        marker = canvas
          .rect()
          .size(2 * markerRadius, 2 * markerRadius)
          .centerAt(point)
          .addClass("home");
        shapes.push(
          shape("rect", {
            x: point.x - markerRadius,
            y: point.y - markerRadius,
            width: 2 * markerRadius,
            height: 2 * markerRadius,
          })
        );
      } else {
        marker = canvas.circle().radius(markerRadius).centerAt(point).addClass("stage");
        if (stage.dayStop) {
          marker.addClass("dayStop");
        }
        if (stage.partialAttendance) {
          marker.addClass("partialAttendance");
        }
        shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius }));
      }
    } else {
      const pathArray = new SVG.PathArray();
      for (const stage of trip.stages) {
        const point = toMercator(stage.endLocation.latlng).transform(transform);
        if (stage.showWaypointOnOverview) {
          const marker = canvas.circle().radius(markerRadius).centerAt(point).addClass("stage");
          shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius }));
          if (stage.dayStop) {
            marker.addClass("dayStop");
          }
          if (stage.partialAttendance) {
            marker.addClass("partialAttendance");
          }
        }
        if (!stage.polyline || stage.hidePolyline || stage.hidePolylineOnOverview) {
          pathArray.push(["M", point.x, point.y]);
          continue;
        }
        // lngShift is not needed/calculated for region overviews
        const path = pathFromPolyline(decodePolyline(stage.polyline), transform);
        if (pathArray.length > 0 && path.length > 0 && path[0][0] === "M") {
          path.shift();
        }
        if (path.length > 0) {
          if (pathArray.length === 0 && path[0][0] !== "M") {
            path[0][0] = "M";
          }
          pathArray.push(...path);
        }
      }
      if (pathArray.length > 0) {
        canvas.path(pathArray).addClass("lineBackground");
        canvas.path(pathArray).addClass("line");
        shapes.push(shape("path", { d: pathArray.toString() }));
      }
    }
  }

  // Add label for each trip and each stage explicitly requested.
  const tripLabels: LabelPoint[] = filteredTrips
    .filter((trip) => !trip.hideLabel)
    .map((trip) => {
      const tripBounds = computeTripBounds(trip);
      const tripBoundingBox = latlngToMercatorBbox(tripBounds).transform(transform);
      const tripCenter = new SVG.Point(tripBoundingBox.cx, tripBoundingBox.cy);
      return {
        name: trip.name,
        point: tripCenter,
        partialAttendance: trip.stages.every((stage) => stage.partialAttendance),
      };
    });
  const stageLabels: LabelPoint[] = filteredTrips.flatMap((trip) =>
    trip.stages
      .filter((stage) => !!stage.showWaypointOnOverview)
      .map((stage) => ({
        name: stage.endLocation.name,
        point: toMercator(stage.endLocation.latlng).transform(transform),
        partialAttendance: stage.partialAttendance,
      }))
  );
  const labelPoints = [...tripLabels, ...stageLabels];

  const bestLabelPlacement = calculateBestLabelPositions(
    labelPoints,
    64,
    labelFontSizePx,
    shapes,
    widthPx,
    heightPx
  );

  for (const labelPlacement of bestLabelPlacement.result) {
    if (labelPlacement.intersects) {
      console.log(`Intersecting ${labelPlacement.label.name}`);
    }
    canvas
      .rect(labelPlacement.labelRect.width, labelPlacement.labelRect.height)
      .x(labelPlacement.labelRect.x)
      .y(labelPlacement.labelRect.y)
      .opacity(0.2)
      .fill(labelPlacement.intersects ? "red" : "green")
      .addClass("labelRect");
    // Add the label's shape to the list for future intersection checks
    shapes.push(labelPlacement.shape);
    const label = canvas
      .text(labelPlacement.label.name)
      .at(labelPlacement.offsetPoint)
      .addClass("label");
    if (labelPlacement.label.partialAttendance) {
      label.addClass("partialAttendance");
    }
  }

  return canvas;
}

function addCanvasStyles(canvas: SVG.Svg): { markerRadius: number; labelFontSizePx: number } {
  const color = "#C61016";
  canvas.style().rule(".lineBackground", {
    fill: "none",
    "stroke-width": 6,
    stroke: "#FFFFFF",
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  });
  canvas.style().rule(".line", {
    fill: "none",
    "stroke-width": 3,
    stroke: color,
    "stroke-linejoin": "round",
    "stroke-dasharray": "6 6",
    "stroke-linecap": "round",
  });
  canvas.style().rule(".flying", {
    "stroke-dasharray": "2 8",
  });
  canvas.style().rule(".ferry", {
    "stroke-dasharray": "2 12",
  });
  const markerRadius = 5;
  canvas.style().rule(".stage", {
    r: markerRadius,
    fill: color,
  });
  canvas.style().rule(".home", {
    fill: color,
  });
  canvas.style().rule(".partialAttendance", {
    opacity: 0.5,
  });
  const strokeRadius = 2.5;
  canvas.style().rule(".dayStop", {
    r: markerRadius - strokeRadius / 2,
    fill: "none",
    stroke: color,
    "stroke-width": strokeRadius,
  });
  canvas.defs().filter((add) => {
    add.id("whiteOutlineEffect");
    add.size("200%", "200%").move("-50%", "-50%");
    add.attr("color-interpolation-filters", "sRGB");

    const morphology = add.morphology("dilate", 1).in(add.$sourceAlpha);
    const matrix = add
      .colorMatrix("matrix", [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0])
      .in(morphology);

    add.merge([matrix, add.$source]);
  });

  const labelFontSizePx = 18;
  canvas.style().rule(".label", {
    fontFamily: "Helvetica",
    fontSize: labelFontSizePx + "px",
    fill: color,
    filter: "url(#whiteOutlineEffect)",
  });
  canvas.style().rule(".labelRect", {
    display: "none", // Set to 'block' or remove to debug label placement boxes
  });
  canvas.style().rule(".elevationMarker", {
    fill: color,
  });
  return { markerRadius, labelFontSizePx };
}

// --- Geometry and Calculation Functions ---

function shiftLatLng(latlng: LatLng, lngShift: number): LatLng {
  return { lat: latlng.lat, lng: latlng.lng + lngShift };
}

function computeTripBounds(trip: Trip | Trip, allowWrap = false): TripBounds {
  if (!trip.stages || trip.stages.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  let lngShift = 0;
  const firstStage = trip.stages[0];
  const lngs = [firstStage.endLocation.latlng.lng];
  if (allowWrap) firstStage.lngShift = 0; // Add property if allowing wrap

  for (let i = 1; i < trip.stages.length; i++) {
    const currentStage = trip.stages[i];
    const prevStage = trip.stages[i - 1];

    if (allowWrap) {
      const lngDiff = currentStage.endLocation.latlng.lng - prevStage.endLocation.latlng.lng;
      if (lngDiff < -180) {
        lngShift += 360;
      } else if (lngDiff > 180) {
        lngShift -= 360;
      }
      currentStage.lngShift = lngShift; // Add property
    }
    lngs.push(currentStage.endLocation.latlng.lng + lngShift);
  }

  const lats = trip.stages.map((stage) => stage.endLocation.latlng.lat);

  if (lats.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function computeStageBounds(stage: Stage): RegionBounds {
  const locations: LatLng[] = [];

  // Add stage polyline points
  if (stage.polyline) {
    locations.push(...decodePolyline(stage.polyline));
  }

  if (locations.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  const lngs = locations.map((loc) => loc.lng);
  const lats = locations.map((loc) => loc.lat);

  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function decodePolyline(encodedPolyline: string): LatLng[] {
  return polyline.decode(encodedPolyline).map((point) => ({ lng: point[1], lat: point[0] }));
}

function toMercator(latlng: LatLng): SVG.Point {
  const x = latlng.lng / 180;
  const rad = latlng.lat * (Math.PI / 180);
  const y = Math.log(Math.tan(rad / 2 + Math.PI / 4)) / Math.PI;
  const y2 = -y; // Invert Y for typical screen coordinates
  return new SVG.Point(x, y2);
}

function latlngToMercatorBbox(bounds: RegionBounds | TripBounds): SVG.Box {
  const tlMercator = toMercator({ lng: bounds.west, lat: bounds.north });
  const brMercator = toMercator({ lng: bounds.east, lat: bounds.south });

  // Handle cases where bounds might cross the antimeridian if needed
  // For simplicity, assuming standard bounds for now.

  return new SVG.PointArray([
    [tlMercator.x, tlMercator.y],
    [brMercator.x, brMercator.y],
  ]).bbox();
}

function fromMercator(p: { x: number; y: number }): LatLng {
  const lng = 180 * p.x;
  const latRad = Math.atan(Math.exp(-p.y * Math.PI)) * 2 - Math.PI / 2;
  const lat = latRad * (180 / Math.PI);
  return { lng, lat };
}

function pathFromPolyline(
  decodedPolyline: LatLng[],
  transform: SVG.Matrix,
  lngShift = 0
): SVG.PathArray {
  if (!decodedPolyline) return new SVG.PathArray();

  if (decodedPolyline.length == 2) {
    if (Math.abs(decodedPolyline[0].lng - decodedPolyline[1].lng) > 180) {
      const dir = Math.sign(decodedPolyline[0].lng - decodedPolyline[1].lng);
      // Add a dummy move as it may be removed later on (the arc path will add its own move so this will never matter)
      const path = new SVG.PathArray(["M", "0", "0"]);

      decodedPolyline[1].lng += dir * 360;

      const transformedPolyline1 = decodedPolyline.map((latlng) =>
        toMercator(shiftLatLng(latlng, lngShift)).transform(transform).round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(transformedPolyline1[0], transformedPolyline1[1]));

      const transformedPolyline2 = decodedPolyline.map((latlng) =>
        toMercator(shiftLatLng(latlng, lngShift - dir * 360))
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(transformedPolyline2[0], transformedPolyline2[1]));

      return path;
    } else {
      const transformedPolyline = decodedPolyline.map((latlng) =>
        toMercator(shiftLatLng(latlng, lngShift)).transform(transform).round(EXPORT_PRECISION)
      );
      return arcPathBetweenPoints(transformedPolyline[0], transformedPolyline[1]);
    }
  } else {
    const transformedPolyline = decodedPolyline.map((latlng) =>
      toMercator(shiftLatLng(latlng, lngShift)).transform(transform).round(EXPORT_PRECISION)
    );
    const simplifiedPolyline = simplify(transformedPolyline, 0.5, false);
    const polylinePathArray: SVG.PathCommand[] = simplifiedPolyline.map((point) => [
      "L",
      point.x,
      point.y,
    ]);
    polylinePathArray[0][0] = "M";
    return new SVG.PathArray(polylinePathArray);
  }
}

function arcPathBetweenPoints(p1: SVG.Point, p2: SVG.Point): SVG.PathArray {
  const dist = distanceBetweenPoints(p1, p2);
  // Heuristic for radius, adjust multiplier as needed
  const r = round(dist * 1.3, EXPORT_PRECISION);
  // Ensure radius is not zero to avoid invalid arc commands
  const radius = Math.max(r, 0.1);
  // Using large-arc-flag = 0, sweep-flag = 1 (clockwise) - adjust if needed
  return new SVG.PathArray([
    ["M", p1.x, p1.y],
    ["A", radius, radius, 0, 0, 1, p2.x, p2.y],
  ]);
}

function latLngDistance(latlng1: LatLng, latlng2: LatLng): number {
  const R = 6371e3; // metres
  const φ1 = (latlng1.lat * Math.PI) / 180; // φ, λ in radians
  const φ2 = (latlng2.lat * Math.PI) / 180;
  const Δφ = ((latlng2.lat - latlng1.lat) * Math.PI) / 180;
  const Δλ = ((latlng2.lng - latlng1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function findPointAtFraction(polyline: LatLng[], fraction: number): LatLng | null {
  if (fraction < 0) return polyline[0];
  if (fraction > 1) return polyline[polyline.length - 1];

  const totalPolylineDistance = polyline.reduce((acc, point, i) => {
    if (i === 0) return 0;
    return acc + latLngDistance(polyline[i - 1], point);
  }, 0);

  const distance = totalPolylineDistance * fraction;

  let distanceTraveled = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    const segmentDistance = latLngDistance(start, end);
    if (distanceTraveled + segmentDistance >= distance) {
      const distanceIntoSegment = distance - distanceTraveled;
      const segmentFraction = segmentDistance === 0 ? 0 : distanceIntoSegment / segmentDistance;
      return {
        lat: start.lat + (end.lat - start.lat) * segmentFraction,
        lng: start.lng + (end.lng - start.lng) * segmentFraction,
      };
    }
    distanceTraveled += segmentDistance;
  }
  return polyline[polyline.length - 1]; // return last point if something went wrong
}

// --- Label Placement Functions ---

function calculateBestLabelPositions(
  labelPoints: LabelPoint[],
  maxOffset: number,
  labelFontSizePx: number,
  shapesToAvoid: Shape[], // Updated type
  maxWidth: number,
  maxHeight: number
): LabelPlacementResult {
  // First calculate potential positions for each label with no intersections (with lines) and sufficient prominence
  const labelOffsetOptions: Map<LabelPoint, LabelOffsetOption[]> = new Map();
  for (let i = 0; i < labelPoints.length; i++) {
    const label = labelPoints[i];
    if (!label.name) continue; // Skip labels without names

    const options: LabelOffsetOption[] = [];
    const labelWidth = pixelWidth(label.name, {
      font: "helvetica", // Ensure this matches the SVG style
      size: labelFontSizePx,
    });
    const labelHeight = labelFontSizePx; // Approximate height

    for (let offset = 0; offset <= maxOffset; offset += 4) {
      const labelOffsetOptions = generateLabelOffsetOptions(
        label.point,
        offset,
        labelWidth,
        labelHeight,
        maxWidth,
        maxHeight
      );

      for (const offsetPoint of labelOffsetOptions) {
        const labelRect = {
          x: offsetPoint.x,
          y: offsetPoint.y + labelHeight * 0.1,
          width: labelWidth,
          height: labelHeight,
        };

        // Create shape for intersection testing using svg-intersections
        const shape = shapeForLabel(labelRect);

        const intersects = hasIntersections(shapesToAvoid, shape);
        const prominence = calculateIndividualLabelProminence(
          label,
          labelRect,
          labelPoints.filter((_, index) => index !== i)
        );
        if (!intersects) {
          options.push({
            offsetPoint,
            labelRect,
            shape,
            prominence,
            offset,
          });
        }
      }
    }
    // Filter to those with sufficient prominence, with a minimum of 5 options
    const filteredOptions = options.filter((option) => option.prominence.prominence > 5);
    if (filteredOptions.length < 5) {
      filteredOptions.push(
        ...options
          .sort((a, b) => b.prominence.prominence - a.prominence.prominence)
          .slice(0, 5 - filteredOptions.length)
      );
    }
    labelOffsetOptions.set(label, filteredOptions);
  }

  const rng = seedrandom("travelmaps"); // Consistent randomness
  const numAttempts = 50;
  let bestLabelPlacement: LabelPlacementResult | null = null;

  for (let attempt = 0; attempt < numAttempts; attempt++) {
    const currentPlacement = calculateLabelPositions(
      rng,
      labelPoints,
      labelOffsetOptions,
      shapesToAvoid
    );
    if (!bestLabelPlacement || compareLabelPlacement(currentPlacement, bestLabelPlacement) > 0) {
      bestLabelPlacement = currentPlacement;
      console.log(
        `Chose better placement with ${
          bestLabelPlacement.numberOfIntersections
        } intersections, offset ${bestLabelPlacement.averageOffset.toFixed(
          2
        )}, separation ${bestLabelPlacement.labelSeparationScore.toFixed(
          2
        )}, prominence ${bestLabelPlacement.labelProminenceScore.toFixed(2)} on attempt ${attempt}`
      );
    }
  }

  // Handle case where no labels could be placed
  if (!bestLabelPlacement) {
    console.warn("Could not determine any label placement.");
    return {
      result: [],
      numberOfIntersections: 0,
      averageOffset: 0,
      labelSeparationScore: 0,
      labelProminenceScore: 0,
    };
  }

  return bestLabelPlacement;
}

function calculateLabelPositions(
  rng: seedrandom.PRNG,
  labels: LabelPoint[],
  labelOffsetOptionsMap: Map<LabelPoint, LabelOffsetOption[]>,
  existingShapes: Shape[] // Updated type
): LabelPlacementResult {
  const shapes = [...existingShapes];
  const shuffledLabels = [...labels];
  shuffleArray(shuffledLabels, rng); // Shuffle in place
  const result: LabelPlacement[] = [];

  for (const label of shuffledLabels) {
    if (!label.name) continue; // Skip labels without names

    const labelOffsetOptions = [...labelOffsetOptionsMap.get(label)!];
    shuffleArray(labelOffsetOptions, rng); // Shuffle options
    labelOffsetOptions.sort((a, b) => a.offset - b.offset); // Sort by offset

    let hasLabelled = false;
    for (const labelOffsetOption of labelOffsetOptions) {
      const intersects = hasIntersections(shapes, labelOffsetOption.shape);

      // Place if it doesn't intersect
      if (!intersects) {
        shapes.push(labelOffsetOption.shape);
        result.push({
          ...labelOffsetOption,
          label,
          intersects,
        });
        hasLabelled = true;
        break;
      }
    }
    if (!hasLabelled) {
      console.log(`No non-intersecting options found for ${label.name}`);
      if (labelOffsetOptions.length > 0) {
        const lastOption = labelOffsetOptions[labelOffsetOptions.length - 1];
        shapes.push(lastOption.shape);
        result.push({
          ...lastOption,
          label,
          intersects: true,
        });
      }
    }
  }
  return {
    result,
    numberOfIntersections: numberOfIntersections(result),
    averageOffset: calculateOffsetScore(result),
    labelSeparationScore: calculateLabelSeparation(result),
    labelProminenceScore: calculateLabelProminenceScore(result),
  };
}

/** Returns positive if a is better than b */
function compareLabelPlacement(a: LabelPlacementResult, b: LabelPlacementResult): number {
  return scoreLabelPlacement(a) - scoreLabelPlacement(b);
}

// Higher score is better
function scoreLabelPlacement(labelPlacements: LabelPlacementResult): number {
  // Prioritize fewer intersections heavily, then smaller offsets, then separation/prominence
  return (
    -10000 * labelPlacements.numberOfIntersections +
    -2 * labelPlacements.averageOffset +
    Math.min(labelPlacements.labelSeparationScore, 100) +
    2 * Math.min(labelPlacements.labelProminenceScore, 100)
  );
}

function numberOfIntersections(labelPlacements: LabelPlacement[]): number {
  return labelPlacements.filter((label) => label.intersects).length;
}

function calculateOffsetScore(labelPlacements: LabelPlacement[]): number {
  if (labelPlacements.length === 0) return 0;
  // Use generalized mean (p=2, quadratic mean) to penalize larger offsets more
  return generalizedMean(
    labelPlacements.map((label) => label.offset),
    2
  );
}

function calculateLabelSeparation(labelPlacements: LabelPlacement[]): number {
  if (labelPlacements.length < 2) return 0; // No separation score needed for 0 or 1 label
  const labelSeparations: number[] = [];
  for (let i = 0; i < labelPlacements.length; i++) {
    let minDistanceToOtherLabel = Infinity;
    for (let j = 0; j < labelPlacements.length; j++) {
      if (i !== j) {
        minDistanceToOtherLabel = Math.min(
          minDistanceToOtherLabel,
          distanceBetweenRectangles(labelPlacements[i].labelRect, labelPlacements[j].labelRect)
        );
      }
    }
    labelSeparations.push(minDistanceToOtherLabel);
  }
  // Use generalized mean (p=-1, harmonic mean) to emphasize smaller separations
  return generalizedMean(labelSeparations, -1);
}

// Updated to return svg-intersection shape object
function shapeForLabel(rect: SimpleRect): Shape {
  // Construct a shape that includes lines within the fill of the rectangle to ensure we detect
  // collisions where the label fully overlaps with another shape.

  let { x, y, width, height } = rect;
  const buffer = height * 0.05; // Small buffer around label
  x -= buffer;
  y -= buffer;
  width += 2 * buffer;
  height += 2 * buffer;

  const divisions = 3;
  const pathArray = new SVG.PathArray([
    ["M", x, y],
    ["L", x + width, y],
    ["L", x + width, y + height],
    ["L", x, y + height],
    ["L", x, y],
  ]);
  for (var i = 1; i <= divisions; i++) {
    pathArray.push(["L", x + width, y + (height / divisions) * i]);
    pathArray.push(["L", x, y + (height / divisions) * i]);
  }

  return shape("path", { d: pathArray.toString() });
}

function calculateLabelProminenceScore(labelPlacements: LabelPlacement[]): number {
  if (labelPlacements.length === 0) return 0;
  const minProminence = labelPlacements.reduce(
    (min, current) => (current.prominence.prominence < min.prominence.prominence ? current : min),
    labelPlacements[0]
  );
  // console.log(
  //   `Label prominence score: ${minProminence.prominence.prominence.toFixed(2)} for ${
  //     minProminence.label.name
  //   } closest to ${minProminence.prominence.closestPoint?.name}`
  // );
  return minProminence.prominence.prominence;
}

function calculateIndividualLabelProminence(
  labelPoint: LabelPoint,
  labelRect: SimpleRect,
  otherPoints: LabelPoint[]
) {
  let minDistanceToOtherLabelPoint = Infinity;
  let closestPoint = undefined;
  for (const point of otherPoints) {
    const distance = distanceFromPointToRectangle(point.point, labelRect);
    if (distance < minDistanceToOtherLabelPoint) {
      minDistanceToOtherLabelPoint = distance;
      closestPoint = point;
    }
  }
  // Score is higher if other label points are further away,
  // and lower if its own point is far from its placed label (high offset)
  const ownDistance = distanceFromPointToRectangle(labelPoint.point, labelRect);
  const prominence = minDistanceToOtherLabelPoint - ownDistance;
  return { prominence, closestPoint };
}

function distanceFromPointToRectangle(point: SVG.Point, rectangle: SimpleRect): number {
  const dx = Math.max(rectangle.x - point.x, 0, point.x - (rectangle.x + rectangle.width));
  const dy = Math.max(rectangle.y - point.y, 0, point.y - (rectangle.y + rectangle.height));
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceBetweenRectangles(r1: SimpleRect, r2: SimpleRect): number {
  const dx = Math.max(r1.x - (r2.x + r2.width), 0, r2.x - (r1.x + r1.width));
  const dy = Math.max(r1.y - (r2.y + r2.height), 0, r2.y - (r1.y + r1.height));
  return Math.sqrt(dx * dx + dy * dy);
}

function generalizedMean(array: number[], exponent: number): number {
  if (array.length === 0) return 0;

  // Handle edge cases for exponent
  if (exponent === 0) {
    // Geometric mean
    // Avoid issues with zero or negative numbers if possible
    const product = array.reduce((a, b) => a * (b > 0 ? b : 1e-9), 1); // Use small positive for non-positive
    return Math.pow(product, 1 / array.length);
  }
  if (exponent === Infinity) return Math.max(...array);
  if (exponent === -Infinity) return Math.min(...array);

  // Power mean calculation
  let sumOfPowers = 0;
  for (const value of array) {
    // Handle negative bases with non-integer exponents carefully
    if (value < 0 && !Number.isInteger(exponent)) {
      // Option 1: Return NaN or throw error
      console.warn(
        `Cannot calculate generalized mean with negative base (${value}) and non-integer exponent (${exponent}). Returning NaN.`
      );
      return NaN;
      // Option 2: Use absolute value (might change meaning)
      // sumOfPowers += Math.pow(Math.abs(value), exponent);
    } else {
      sumOfPowers += Math.pow(value, exponent);
    }
  }

  const meanOfPowers = sumOfPowers / array.length;

  // Handle potential negative result before raising to 1/exponent
  if (meanOfPowers < 0 && !Number.isInteger(1 / exponent)) {
    console.warn(
      `Cannot calculate generalized mean resulting in negative base (${meanOfPowers}) with non-integer root (${
        1 / exponent
      }). Returning NaN.`
    );
    return NaN;
    // Or use Math.sign and absolute value if appropriate for the context
    // return Math.sign(meanOfPowers) * Math.pow(Math.abs(meanOfPowers), 1 / exponent);
  }

  return Math.pow(meanOfPowers, 1 / exponent);
}

function generateLabelOffsetOptions(
  point: SVG.Point,
  offset: number,
  labelWidth: number,
  labelHeight: number,
  maxWidth: number,
  maxHeight: number
): SVG.Point[] {
  const diagonalOffset = offset / Math.SQRT2;
  const buffer = 0.02; // Percentage buffer from edges

  // Define potential translation matrices
  const matrices = [
    // Diagonal offsets (adjust for label dimensions)
    new SVG.Matrix().translate(diagonalOffset, diagonalOffset), // bottom right
    new SVG.Matrix().translate(diagonalOffset, -diagonalOffset - labelHeight), // top right
    new SVG.Matrix().translate(-diagonalOffset - labelWidth, -diagonalOffset - labelHeight), // top left
    new SVG.Matrix().translate(-diagonalOffset - labelWidth, diagonalOffset), // bottom left
    // Cardinal offsets (center label relative to offset)
    new SVG.Matrix().translate(-labelWidth / 2, offset), // bottom center
    new SVG.Matrix().translate(-labelWidth / 2, -offset - labelHeight), // top center
    new SVG.Matrix().translate(-offset - labelWidth, -labelHeight / 2), // left center
    new SVG.Matrix().translate(offset, -labelHeight / 2), // right center
  ];

  // Apply matrices, filter points outside bounds
  return matrices
    .map((matrix) => point.transform(matrix))
    .filter(
      (p) =>
        p.x >= maxWidth * buffer &&
        p.y >= maxHeight * buffer &&
        p.x + labelWidth <= maxWidth * (1 - buffer) &&
        p.y + labelHeight <= maxHeight * (1 - buffer)
    );
}

// Updated to use svg-intersections
function hasIntersections(shapes: Shape[], testShape: Shape): boolean {
  for (const existingShape of shapes) {
    try {
      // Use the intersect function from svg-intersections
      const intersection = intersect(existingShape, testShape);
      // Check if there are any intersection points
      if (intersection.points.length > 0) {
        return true; // Found an intersection
      }
    } catch (error: unknown) {
      // svg-intersections might also throw errors, though perhaps less often
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Intersection check failed:", message);
      // Treat error as potential intersection to be safe
      return true; // Safer to assume intersection on error
    }
  }
  return false; // No intersections found
}

// --- Utility Functions ---

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function distanceBetweenPoints(point1: SVG.Point, point2: SVG.Point): number {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function shuffleArray<T>(array: T[], rng: seedrandom.PRNG): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
}

function round(number: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

// --- File and Network Functions ---

async function fetchRegionMap(region: string, bounds: RegionBounds): Promise<void> {
  const regionMapFileName = "output/" + toSnakeCase(region) + ".png";
  const mapExists = await fileExists(regionMapFileName);
  if (!mapExists) {
    console.log(`Static map for region ${region} not found, attempting to fetch...`);
    const boundingBox = latlngToMercatorBbox(bounds);
    try {
      const staticMap = await fetchStaticMapMapbox(boundingBox);
      await writeFileAndLog(regionMapFileName, staticMap);
    } catch (error) {
      console.error(`Failed to fetch static map for region ${region}:`, error);
    }
  }
}

async function fetchStaticMapMapbox(boundingBox: SVG.Box): Promise<Buffer> {
  // Ensure no division by zero
  const maxDim = Math.max(boundingBox.width, boundingBox.height);
  const scale = maxDim === 0 ? 1 : SIDE_PX / maxDim;
  const widthPx = Math.ceil(boundingBox.width * scale);
  const heightPx = Math.ceil(boundingBox.height * scale);

  // Convert corners back to LatLng
  const tlLatLng = fromMercator({
    x: boundingBox.x,
    y: boundingBox.y,
  });
  const brLatLng = fromMercator({
    x: boundingBox.x2,
    y: boundingBox.y2,
  });

  // Ensure longitude is within Mapbox's expected range if needed (often handles wrapping)
  // Mapbox static API usually takes [lon,lat,lon,lat] or auto bounds

  const style = "amorris13/clyk5oa2u01dw01rba38pe12t"; // muted, no labels (or choose another)
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN!; // Checked in main()

  // Construct URL - using bounds [west,south,east,north]
  const boundsString = `[${tlLatLng.lng},${brLatLng.lat},${brLatLng.lng},${tlLatLng.lat}]`;
  const url = `https://api.mapbox.com/styles/v1/${style}/static/${boundsString}/${widthPx}x${heightPx}@2x?access_token=${accessToken}&attribution=false&logo=false`;

  console.log(`Fetching static map: ${url}`); // Log URL without token

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error fetching static map (${response.status} ${response.statusText}): ${errorBody}`
      );
      throw new Error(`Mapbox API request failed with status ${response.status}`);
    }
    const staticMapBlob = await response.blob();
    const staticMapBuffer = Buffer.from(await staticMapBlob.arrayBuffer());

    // Crop the image back to the original desired height (removing padding)
    const staticMapCroppedBuffer = await sharp(staticMapBuffer)
      .extract({ left: 0, top: 0, width: widthPx * 2, height: heightPx * 2 }) // Use @2x dimensions
      .toBuffer();

    return staticMapCroppedBuffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed during static map fetch or processing:", message);
    throw error; // Rethrow to indicate failure
  }
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await fs.stat(path);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return false; // File does not exist
    }
    throw error; // Other error
  }
};

async function writeFileAndLog(filename: string, data: string | Buffer): Promise<void> {
  try {
    await fs.writeFile(filename, data);
    console.log(`Wrote ${filename}`);
  } catch (error: any) {
    console.error(`Error writing file ${filename}:`, error?.message || error);
  }
}

// --- Run Script ---
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error in main execution:", message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
