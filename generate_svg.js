#!/usr/bin/env node

import parseArgs from "minimist";
import { createSVGWindow } from "svgdom";
import * as SVG from "@svgdotjs/svg.js";
import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";
import pixelWidth from "string-pixel-width";
import { ShapeInfo, Intersection } from "kld-intersections";

const SIDE_PX = 1200;
const Y_EXPAND_FACTOR = 1.05;

SVG.extend(SVG.Element, {
  at: function (point) {
    return this.x(point.x).y(point.y);
  },
  centerAt: function (point) {
    return this.cx(point.x).cy(point.y);
  },
});

async function main() {
  const argv = parseArgs(process.argv.slice(2), { boolean: ["staticmap"] });
  const filename = argv.filename;
  const tripname = argv.tripname;
  const fetchStaticMap = argv.staticmap;

  const data = await fs.readFile(filename, { encoding: "utf8" });
  const json = JSON.parse(data);
  if (tripname) {
    const tripJson = json.find((trip) => trip.name === tripname);
    processTrip(tripJson, fetchStaticMap);
  } else {
    for (const trip of json) {
      processTrip(trip, fetchStaticMap);
    }
  }
}

async function processTrip(tripJson, fetchStaticMap) {
  await fs.mkdir("output", { recursive: true });

  const tripSvg = generateTripSvg(tripJson);
  await writeFileAndLog("output/" + toSnakeCase(tripJson.name) + ".svg", tripSvg.svgCanvas.svg());

  const mapFileName = "output/" + toSnakeCase(tripJson.name) + ".png";
  if (fetchStaticMap) {
    const staticMap = await fetchStaticMapMapbox(tripSvg.boundingBox);
    const staticMapBuffer = Buffer.from(await staticMap.arrayBuffer());
    await writeFileAndLog(mapFileName, staticMapBuffer);
  }

  tripSvg.svgCanvas
    .image(toSnakeCase(tripJson.name) + ".png")
    .size(SIDE_PX, SIDE_PX * Y_EXPAND_FACTOR)
    .back();
  await writeFileAndLog(
    "output/" + toSnakeCase(tripJson.name) + "-withmap.svg",
    tripSvg.svgCanvas.svg()
  );
}

async function writeFileAndLog(filename, data) {
  await fs.writeFile(filename, data);
  console.log(`Wrote ${filename}`);
}

function generateTripSvg(trip) {
  const tripBounds = computerTripBounds(trip);

  // Convert trip bounds to mercator projection
  const tlMercator = toMercator(tripBounds.minLng, tripBounds.maxLat);
  const brMercator = toMercator(tripBounds.maxLng, tripBounds.minLat);

  const boundingBox = new SVG.PointArray([
    [tlMercator.x, tlMercator.y],
    [brMercator.x, brMercator.y],
  ]).bbox();
  const expandedBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(1.2, 1.4, boundingBox.cx, boundingBox.cy)
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
    .lmultiply(
      new SVG.Matrix().scale(
        Math.min(SIDE_PX / expandedBoundingBox.width, SIDE_PX / expandedBoundingBox.height)
      )
    )
    .lmultiply(new SVG.Matrix().translate(SIDE_PX / 2, SIDE_PX / 2));

  // returns a window with a document and an svg root node
  const window = createSVGWindow();
  const document = window.document;

  // register window and document
  SVG.registerWindow(window, document);

  // create canvas
  const canvas = SVG.SVG(document.documentElement);
  canvas.viewbox(0, 0, SIDE_PX, SIDE_PX);

  const color = "#C61016";
  canvas.style(".line", {
    fill: "none",
    "stroke-width": 4,
    stroke: color,
    "stroke-opacity": 0.8,
    "stroke-linejoin": "round",
    "stroke-dasharray": "12 8",
    "stroke-linecap": "round",
  });
  const markerRadius = 8;
  canvas.style(".waypoint", {
    r: markerRadius,
    fill: color,
  });
  const labelFontSizePx = 24;
  canvas.style(".label", {
    fontFamily: "Helvetica",
    fontSize: labelFontSizePx + "px",
    fill: color,
  });
  canvas.style(".labelRect", {
    display: "none",
  });

  const shapes = [];

  // Add lines for each leg
  for (const waypoint of trip.waypoints) {
    if (!waypoint.polyline) {
      continue;
    }
    const decodedPolyline = polyline.decode(waypoint.polyline);
    const transformedPolyline = decodedPolyline.map((latlng) =>
      toMercator(latlng[1], latlng[0]).transform(transform).toArray()
    );

    if (transformedPolyline.length == 2) {
      const r =
        distanceBetweenPoints(
          new SVG.Point(transformedPolyline[0]),
          new SVG.Point(transformedPolyline[1])
        ) * 1.3;
      const pathArray = new SVG.PathArray([
        ["M", transformedPolyline[0][0], transformedPolyline[0][1]],
        ["A", r, r, 0, 0, 0, transformedPolyline[1][0], transformedPolyline[1][1]],
      ]);
      canvas.path(pathArray).addClass("line").addClass(waypoint.mode);
      shapes.push(ShapeInfo.path(pathArray.toString()));
    } else {
      canvas.polyline(transformedPolyline).addClass("line").addClass(waypoint.mode);
      shapes.push(ShapeInfo.polyline(transformedPolyline));
    }
  }

  // Add marker for each waypoint
  for (const waypoint of trip.waypoints) {
    const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
    canvas.circle().centerAt(point).addClass("waypoint");
    // shapes.push(ShapeInfo.circle(point, markerRadius));
  }

  // Add label for each waypoint
  for (const waypoint of trip.waypoints) {
    if (waypoint.hideLabel) {
      continue;
    }
    const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
    const displayName = waypoint.displayName || waypoint.name;
    const labelWidth = pixelWidth(displayName, {
      font: "helvetica",
      size: labelFontSizePx,
    });
    const labelHeight = (labelFontSizePx * 3) / 4;

    // bottom right
    const markerOffset = (markerRadius * 3) / 4;
    const labelOffsetOptions = generateLabelOffsetOptions(markerOffset, labelWidth, labelHeight);
    for (let i = 0; i < labelOffsetOptions.length; i++) {
      const labelOffset = labelOffsetOptions[i];
      const offsetPoint = point.transform(labelOffset);
      const buffer = 2;
      const shapeInfo = ShapeInfo.rectangle(
        offsetPoint.x - buffer,
        offsetPoint.y - buffer,
        labelWidth + 2 * buffer,
        labelHeight + 2 * buffer
      );
      const intersects = hasIntersections(shapes, shapeInfo);
      if (intersects && i < labelOffsetOptions.length - 1) {
        continue;
      } else {
        canvas
          .rect(labelWidth, labelHeight)
          .at(offsetPoint)
          .opacity(0.2)
          .fill(intersects ? "red" : "green")
          .addClass("labelRect");
        shapes.push(shapeInfo);
        canvas.text(displayName).at(offsetPoint).addClass("label");
        break;
      }
    }
  }

  // get your svg as string
  return { svgCanvas: canvas, boundingBox: expandedBoundingBox };
}

// Compute trip bounds
function computerTripBounds(trip) {
  const lngs = trip.waypoints.map((waypoint) => waypoint.location.lng);
  const lats = trip.waypoints.map((waypoint) => waypoint.location.lat);

  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

// Convert lat and lng to mercator
function toMercator(lng, lat) {
  const x = lng / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  const y2 = -y / 180;
  return new SVG.Point(x, y2);
}

// Convert from mercator to lat and lng
function fromMercator(p) {
  const lng = 180 * p.x;
  const lat = (360 * Math.atan(Math.exp(-p.y * Math.PI))) / Math.PI - 90;
  return { lng, lat };
}

function generateLabelOffsetOptions(markerOffset, labelWidth, labelHeight) {
  return [
    // bottom right
    new SVG.Matrix().translate(markerOffset, markerOffset),
    // top right
    new SVG.Matrix().translate(markerOffset, -markerOffset - labelHeight),
    // top left
    new SVG.Matrix().translate(-markerOffset - labelWidth, -markerOffset - labelHeight),
    // bottom left
    new SVG.Matrix().translate(-markerOffset - labelWidth, markerOffset),
  ];
}

function hasIntersections(shapes, testShape) {
  for (const shape of shapes) {
    const intersect = Intersection.intersect(shape, testShape);
    if (intersect.points.length > 0) {
      return true;
    }
  }
  return false;
}

// Convert string to snake case
function toSnakeCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function distanceBetweenPoints(point1, point2) {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

async function fetchStaticMapMapbox(boundingBox) {
  const expandBottom = new SVG.Matrix().scale(1, Y_EXPAND_FACTOR, boundingBox.x, boundingBox.y);
  const ySide = SIDE_PX * Y_EXPAND_FACTOR;

  const staticMapBoundingBox = boundingBox.transform(expandBottom);

  const tlLatLng = fromMercator({
    x: staticMapBoundingBox.x,
    y: staticMapBoundingBox.y,
  });
  const brLatLng = fromMercator({
    x: staticMapBoundingBox.x2,
    y: staticMapBoundingBox.y2,
  });

  const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/[${tlLatLng.lng},${brLatLng.lat},${brLatLng.lng},${tlLatLng.lat}]/${SIDE_PX}x${ySide}@2x?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;

  const response = await fetch(url);
  const staticMapPng = await response.blob();

  return staticMapPng;
}

main();
