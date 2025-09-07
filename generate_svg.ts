#!/usr/bin/env node

import parseArgs from "minimist";
import * as SVG from "@svgdotjs/svg.js";
import fs from "node:fs/promises";
import pretty from "pretty";
import { shape } from "svg-intersections";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import {
  RegionBounds,
  Trip,
  Stage,
  computeTripBounds,
  computeStageBounds,
  decodePolyline,
  toMercator,
  toMercatorLatLng,
  latlngToMercatorBbox,
  fromMercator,
  pathFromPolyline,
  toSnakeCase,
  svgExportModifier,
  SIDE_PX,
} from "./svg-helpers.js";
import { SvgGenerator } from "./svg-common.js";

// Load environment variables from .env file
dotenv.config();

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Regions {
  [key: string]: RegionBounds;
}

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
    trips = trips.filter(
      (trip) => new Date(trip.startDate).getFullYear() === year
    );
  }

  for (const trip of trips) {
    const mapname =
      new Date(trip.startDate).getFullYear() + "-" + toSnakeCase(trip.name);
    if (argv.specificMap && argv.specificMap !== mapname) {
      continue;
    }
    await processTrip(mapname, trip, fetchStaticMap ?? false);

    if (generateStageMaps) {
      await processStageMaps(mapname, trip, fetchStaticMap ?? false);
    }
  }

  if (fetchStaticMap) {
    for (const [region, bounds] of Object.entries(REGIONS)) {
      await fetchRegionMap(region, bounds);
    }
  }

  const years = new Set(
    trips
      .filter((trip) => !trip.isHome)
      .map((trip) => new Date(trip.startDate).getFullYear())
  );

  for (const year of years) {
    const tripsForYear = trips.filter(
      (trip) =>
        new Date(trip.startDate).getFullYear() <= year &&
        new Date(trip.endDate).getFullYear() >= year
    );

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

async function processTrip(
  filename: string,
  tripJson: Trip,
  fetchStaticMap: boolean
): Promise<void> {
  if (!tripJson.stages || tripJson.stages.length < 2) {
    console.info(
      `Skipping trip "${tripJson.name}" as it has less than 2 stages.`
    );
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
      console.error(
        `Failed to fetch or process static map for ${filename}:`,
        error
      );
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
  await writeFileAndLog(
    "output/" + name + ".svg",
    pretty(regionSvg.svg(svgExportModifier))
  );

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
      `Static map file ${mapFileName} not found for region ${regionName}.`
    );
  }
}

function generateTripSvg(trip: Trip): TripSvgResult {
  console.log(`Generating Trip SVG for ${trip.name}`);
  const tripBounds = computeTripBounds(trip, true);
  const boundingBox = latlngToMercatorBbox(tripBounds);
  const maxSize = Math.max(boundingBox.width, boundingBox.height);
  const scaleX = boundingBox.width === 0 ? 1 : maxSize / boundingBox.width;
  const scaleY = boundingBox.height === 0 ? 1 : maxSize / boundingBox.height;

  const squareBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(scaleX, scaleY, boundingBox.cx, boundingBox.cy)
  );
  const expandedBoundingBox = squareBoundingBox.transform(
    new SVG.Matrix().scale(1.3, squareBoundingBox.cx, squareBoundingBox.cy)
  );

  const transformScale = Math.min(
    expandedBoundingBox.width === 0
      ? 1
      : SIDE_PX / expandedBoundingBox.width,
    expandedBoundingBox.height === 0
      ? 1
      : SIDE_PX / expandedBoundingBox.height
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(transformScale))
    .lmultiply(new SVG.Matrix().translate(SIDE_PX / 2, SIDE_PX / 2));

  const generator = new SvgGenerator(SIDE_PX, SIDE_PX, transform);
  const markerMask = generator.canvas.mask();
  markerMask.add(
    generator.canvas.rect(SIDE_PX, SIDE_PX).move(0, 0).fill("white")
  );

  for (const stage of trip.stages) {
    if (!stage.polyline || stage.hidePolyline) {
      continue;
    }
    const pathArray = pathFromPolyline(
      decodePolyline(stage.polyline),
      transform,
      stage.lngShift
    );
    if (pathArray.length > 0) {
      const path = generator.canvas
        .path(pathArray)
        .addClass("line")
        .addClass(stage.mode ?? "unknown")
        .maskWith(markerMask);
      if (stage.partialAttendance) {
        path.addClass("partialAttendance");
      }
      generator.addShape(shape("path", { d: pathArray.toString() }));
    }
  }

  for (const stage of trip.stages) {
    if (stage.hideWaypoint) {
      continue;
    }
    const point = toMercator(
      stage.endLocation.latlng.lng + (stage.lngShift || 0),
      stage.endLocation.latlng.lat
    ).transform(transform);
    const marker = generator.canvas
      .circle()
      .radius(generator.markerRadius)
      .centerAt(point);
    markerMask.add(marker.clone().fill("black"));
    marker.addClass("stage");
    if (stage.dayStop) {
      marker.addClass("dayStop");
    }
    if (stage.partialAttendance) {
      marker.addClass("partialAttendance");
    }
    generator.addShape(
      shape("circle", {
        cx: point.x,
        cy: point.y,
        r: generator.markerRadius,
      })
    );
    if (!stage.hideLabel) {
      generator.addLabel(
        stage.endLocation.name,
        point,
        stage.partialAttendance
      );
    }
  }

  generator.placeLabels(32);

  return { svgCanvas: generator.canvas, boundingBox: expandedBoundingBox };
}

function generateStageSvg(tripName: string, stage: Stage): TripSvgResult {
  console.log(
    `Generating Stage SVG for ${tripName} - ${stage.endLocation.name}`
  );

  const stageBounds = computeStageBounds(stage);
  const boundingBox = latlngToMercatorBbox(stageBounds);
  const maxSize = Math.max(boundingBox.width, boundingBox.height);
  const scaleX = boundingBox.width === 0 ? 1 : maxSize / boundingBox.width;
  const scaleY = boundingBox.height === 0 ? 1 : maxSize / boundingBox.height;

  const squareBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(scaleX, scaleY, boundingBox.cx, boundingBox.cy)
  );
  const expandedBoundingBox = squareBoundingBox.transform(
    new SVG.Matrix().scale(1.3, squareBoundingBox.cx, squareBoundingBox.cy)
  );

  const transformScale = Math.min(
    expandedBoundingBox.width === 0
      ? 1
      : SIDE_PX / expandedBoundingBox.width,
    expandedBoundingBox.height === 0
      ? 1
      : SIDE_PX / expandedBoundingBox.height
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(transformScale))
    .lmultiply(new SVG.Matrix().translate(SIDE_PX / 2, SIDE_PX / 2));

  const generator = new SvgGenerator(SIDE_PX, SIDE_PX, transform);
  const markerMask = generator.canvas.mask();
  markerMask.add(
    generator.canvas.rect(SIDE_PX, SIDE_PX).move(0, 0).fill("white")
  );

  const decodedPolyline = stage.polyline
    ? decodePolyline(stage.polyline)
    : [stage.startLocation?.latlng, stage.endLocation.latlng].filter(
        (latlng) => latlng !== undefined
      );

  const pathArray = pathFromPolyline(decodedPolyline, transform);
  if (pathArray.length > 0) {
    const path = generator.canvas
      .path(pathArray)
      .addClass("line")
      .addClass(stage.mode ?? "unknown")
      .maskWith(markerMask);
    if (stage.partialAttendance) {
      path.addClass("partialAttendance");
    }
    generator.addShape(shape("path", { d: pathArray.toString() }));
  }

  if (stage.startLocation) {
    const startPoint = toMercatorLatLng(
      decodedPolyline.at(0)!
    ).transform(transform);
    const startMarker = generator.canvas
      .circle()
      .radius(generator.markerRadius)
      .centerAt(startPoint);
    markerMask.add(startMarker.clone().fill("black"));
    startMarker.addClass("stage");
    if (stage.partialAttendance) {
      startMarker.addClass("partialAttendance");
    }
    generator.addShape(
      shape("circle", {
        cx: startPoint.x,
        cy: startPoint.y,
        r: generator.markerRadius,
      })
    );
    generator.addLabel(
      stage.startLocation.name,
      startPoint,
      stage.partialAttendance
    );
  }

  const endPoint = toMercatorLatLng(decodedPolyline.at(-1)!).transform(
    transform
  );
  const marker = generator.canvas
    .circle()
    .radius(generator.markerRadius)
    .centerAt(endPoint);
  markerMask.add(marker.clone().fill("black"));
  marker.addClass("stage");
  if (stage.partialAttendance) {
    marker.addClass("partialAttendance");
  }
  generator.addShape(
    shape("circle", {
      cx: endPoint.x,
      cy: endPoint.y,
      r: generator.markerRadius,
    })
  );
  generator.addLabel(
    stage.endLocation.name,
    endPoint,
    stage.partialAttendance
  );

  if (stage.stops && stage.stops.length > 0) {
    for (const stop of stage.stops) {
      if (stop.latlng) {
        const point = toMercatorLatLng(stop.latlng).transform(transform);
        const stopMarker = generator.canvas
          .circle()
          .radius(generator.markerRadius * 0.7)
          .centerAt(point);
        markerMask.add(stopMarker.clone().fill("black"));
        stopMarker.addClass("dayStop");
        generator.addShape(
          shape("circle", {
            cx: point.x,
            cy: point.y,
            r: generator.markerRadius * 0.7,
          })
        );
        if (stop.name) {
          generator.addLabel(stop.name, point);
        }
      }
    }
  }

  generator.placeLabels(32);

  return { svgCanvas: generator.canvas, boundingBox: expandedBoundingBox };
}

async function processStageMaps(
  tripFilename: string,
  tripJson: Trip,
  fetchStaticMap: boolean
): Promise<void> {
  if (!tripJson.stages || tripJson.stages.length === 0) {
    console.info(
      `Skipping stage maps for trip "${tripJson.name}" as it has no stages.`
    );
    return;
  }

  await fs.mkdir("output", { recursive: true });

  for (let i = 1; i < tripJson.stages.length; i++) {
    const stage = tripJson.stages[i];
    stage.startLocation = tripJson.stages[i - 1].endLocation;
    const stageFilename = `${tripFilename}-stage-${i + 1}`;

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
    console.info(
      `Skipping stage "${stage.endLocation.name}" as it has no coordinates.`
    );
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
      console.error(
        `Failed to fetch or process static map for ${filename}:`,
        error
      );
    }
  }

  stageSvgResult.svgCanvas
    .image(filename + ".png")
    .size(SIDE_PX, SIDE_PX)
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
  const maxDim = Math.max(boundingBox.width, boundingBox.height);
  const baseScale = maxDim === 0 ? 1 : SIDE_PX / maxDim;
  const scale = baseScale * (regionBounds.scale || 1);
  const widthPx = boundingBox.width * scale;
  const heightPx = boundingBox.height * scale;

  const transform = new SVG.Matrix()
    .translate(-boundingBox.cx, -boundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(scale))
    .lmultiply(new SVG.Matrix().translate(widthPx / 2, heightPx / 2));

  const generator = new SvgGenerator(widthPx, heightPx, transform);

  for (const [region, bounds] of Object.entries(REGIONS)) {
    if (region === regionName) {
      break;
    }
    const bbox = latlngToMercatorBbox(bounds).transform(transform);
    generator.addShape(
      shape("rect", {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      })
    );
  }

  const filteredTrips = trips.filter((trip) => !trip.hideOnOverview);

  for (const trip of filteredTrips) {
    if (!trip.stages || trip.stages.length === 0) continue;

    if (trip.stages.length === 1) {
      const stage = trip.stages[0];
      const point = toMercatorLatLng(stage.endLocation.latlng).transform(
        transform
      );
      if (trip.isHome) {
        generator.canvas
          .rect()
          .size(2 * generator.markerRadius, 2 * generator.markerRadius)
          .centerAt(point)
          .addClass("home");
        generator.addShape(
          shape("rect", {
            x: point.x - generator.markerRadius,
            y: point.y - generator.markerRadius,
            width: 2 * generator.markerRadius,
            height: 2 * generator.markerRadius,
          })
        );
      } else {
        const marker = generator.canvas
          .circle()
          .radius(generator.markerRadius)
          .centerAt(point)
          .addClass("stage");
        if (stage.dayStop) {
          marker.addClass("dayStop");
        }
        if (stage.partialAttendance) {
          marker.addClass("partialAttendance");
        }
        generator.addShape(
          shape("circle", {
            cx: point.x,
            cy: point.y,
            r: generator.markerRadius,
          })
        );
      }
    } else {
      const pathArray = new SVG.PathArray();
      for (const stage of trip.stages) {
        const point = toMercatorLatLng(stage.endLocation.latlng).transform(
          transform
        );
        if (stage.showWaypointOnOverview) {
          const marker = generator.canvas
            .circle()
            .radius(generator.markerRadius)
            .centerAt(point)
            .addClass("stage");
          generator.addShape(
            shape("circle", {
              cx: point.x,
              cy: point.y,
              r: generator.markerRadius,
            })
          );
          if (stage.dayStop) {
            marker.addClass("dayStop");
          }
          if (stage.partialAttendance) {
            marker.addClass("partialAttendance");
          }
        }
        if (
          !stage.polyline ||
          stage.hidePolyline ||
          stage.hidePolylineOnOverview
        ) {
          pathArray.push(["M", point.x, point.y]);
          continue;
        }
        const path = pathFromPolyline(
          decodePolyline(stage.polyline),
          transform
        );
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
        generator.canvas.path(pathArray).addClass("line");
        generator.addShape(shape("path", { d: pathArray.toString() }));
      }
    }
  }

  const tripLabels = filteredTrips
    .filter((trip) => !trip.hideLabel)
    .map((trip) => {
      const tripBounds = computeTripBounds(trip);
      const tripBoundingBox = latlngToMercatorBbox(tripBounds).transform(
        transform
      );
      const tripCenter = new SVG.Point(tripBoundingBox.cx, tripBoundingBox.cy);
      return {
        name: trip.name,
        point: tripCenter,
        partialAttendance: trip.stages.every(
          (stage: Stage) => stage.partialAttendance
        ),
      };
    });
  const stageLabels = filteredTrips.flatMap((trip) =>
    trip.stages
      .filter((stage: Stage) => !!stage.showWaypointOnOverview)
      .map((stage: Stage) => ({
        name: stage.endLocation.name,
        point: toMercatorLatLng(stage.endLocation.latlng).transform(transform),
        partialAttendance: stage.partialAttendance,
      }))
  );

  for (const label of [...tripLabels, ...stageLabels]) {
    generator.addLabel(label.name, label.point, label.partialAttendance);
  }

  generator.placeLabels(64);

  return generator.canvas;
}

// --- File and Network Functions ---

async function fetchRegionMap(
  region: string,
  bounds: RegionBounds
): Promise<void> {
  const regionMapFileName = "output/" + toSnakeCase(region) + ".png";
  const mapExists = await fileExists(regionMapFileName);
  if (!mapExists) {
    console.log(
      `Static map for region ${region} not found, attempting to fetch...`
    );
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
  const maxDim = Math.max(boundingBox.width, boundingBox.height);
  const scale = maxDim === 0 ? 1 : SIDE_PX / maxDim;
  const widthPx = Math.ceil(boundingBox.width * scale);
  const heightPx = Math.ceil(boundingBox.height * scale);

  const expandedHeightPx = heightPx + 20;
  const expandBottom = new SVG.Matrix().scale(
    1,
    heightPx === 0 ? 1 : expandedHeightPx / heightPx,
    boundingBox.x,
    boundingBox.y
  );
  const staticMapBoundingBox = boundingBox.transform(expandBottom);

  const tlLatLng = fromMercator({
    x: staticMapBoundingBox.x,
    y: staticMapBoundingBox.y,
  });
  const brLatLng = fromMercator({
    x: staticMapBoundingBox.x2,
    y: staticMapBoundingBox.y2,
  });

  const style = "amorris13/clyk5oa2u01dw01rba38pe12t";
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN!;

  const boundsString = `[${tlLatLng.lng},${brLatLng.lat},${brLatLng.lng},${tlLatLng.lat}]`;
  const url = `https://api.mapbox.com/styles/v1/${style}/static/${boundsString}/${widthPx}x${expandedHeightPx}@2x?access_token=${accessToken}`;

  console.log(
    `Fetching static map: ${url.replace(accessToken, "MAPBOX_TOKEN")}`
  );

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error fetching static map (${response.status} ${response.statusText}): ${errorBody}`
      );
      throw new Error(
        `Mapbox API request failed with status ${response.status}`
      );
    }
    const staticMapBlob = await response.blob();
    const staticMapBuffer = Buffer.from(await staticMapBlob.arrayBuffer());

    const staticMapCroppedBuffer = await sharp(staticMapBuffer)
      .extract({
        left: 0,
        top: 0,
        width: widthPx * 2,
        height: heightPx * 2,
      })
      .toBuffer();

    return staticMapCroppedBuffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed during static map fetch or processing:", message);
    throw error;
  }
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await fs.stat(path);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

async function writeFileAndLog(
  filename: string,
  data: string | Buffer
): Promise<void> {
  try {
    await fs.writeFile(filename, data);
    console.log(`Wrote ${filename}`);
  } catch (error: any) {
    console.error(`Error writing file ${filename}:`, error?.message || error);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error in main execution:", message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
