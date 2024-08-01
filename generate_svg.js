#!/usr/bin/env node

import parseArgs from "minimist";
import { createSVGWindow } from "svgdom";
import * as SVG from "@svgdotjs/svg.js";
import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";
import pixelWidth from "string-pixel-width";
import { ShapeInfo, Intersection } from "kld-intersections";
import seedrandom from "seedrandom";
import simplify from "simplify-js";
import sharp from "sharp";

const EXPORT_PRECISION = 3;
const SIDE_PX = 1200;
const REGIONS = {
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

const svgExportModifier = (node) => {
  node.round(EXPORT_PRECISION);
};

SVG.extend(SVG.Element, {
  at: function (point) {
    return this.x(point.x).y(point.y);
  },
  centerAt: function (point) {
    return this.cx(point.x).cy(point.y);
  },
});

SVG.extend(SVG.Point, {
  round: function (precision) {
    this.x = round(this.x, precision);
    this.y = round(this.y, precision);
    return this;
  },
});

async function main() {
  const argv = parseArgs(process.argv.slice(2), { boolean: ["staticmap"] });
  const year = argv.year;
  const filename = argv.filename;
  const tripname = argv.tripname;
  const fetchStaticMap = argv.staticmap;

  const data = await fs.readFile(filename, { encoding: "utf8" });
  var trips = JSON.parse(data);

  if (year) {
    trips = trips.filter((trip) => new Date(trip.startDate).getFullYear() === year);
  }

  if (tripname) {
    const tripJson = trips.find((trip) => trip.name === tripname);
    processTrip(tripJson, fetchStaticMap);
  } else {
    // Process each trip
    for (const trip of trips) {
      processTrip(trip, fetchStaticMap);
    }

    if (fetchStaticMap) {
      for (const [region, bounds] of Object.entries(REGIONS)) {
        fetchRegionMap(region, bounds);
      }
    }

    // Group trips by year
    const tripsByYear = Map.groupBy(trips, (trip) => new Date(trip.startDate).getFullYear());
    for (const [year, tripsForYear] of tripsByYear) {
      //  - Group trips by region
      const tripsByRegion = Map.groupBy(tripsForYear, (trip) => {
        const tripBounds = computeTripBounds(trip);
        return (
          Object.keys(REGIONS).find((region) => {
            const regionBounds = REGIONS[region];
            return (
              tripBounds.north <= regionBounds.north &&
              tripBounds.east <= regionBounds.east &&
              tripBounds.south >= regionBounds.south &&
              tripBounds.west >= regionBounds.west
            );
          }) || "World"
        );
      });
      for (const [region, tripsForRegion] of tripsByRegion) {
        processRegion(`${year}-overview-${region}`, region, REGIONS[region], tripsForRegion);
      }
    }
  }
}

async function processTrip(tripJson, fetchStaticMap) {
  if (tripJson.waypoints.length == 1) {
    return;
  }

  await fs.mkdir("output", { recursive: true });

  const year = new Date(tripJson.startDate).getFullYear();
  const tripSvg = generateTripSvg(tripJson);
  await writeFileAndLog(
    "output/" + year + "-" + toSnakeCase(tripJson.name) + ".svg",
    tripSvg.svgCanvas.svg(svgExportModifier)
  );

  const mapFileName = "output/" + year + "-" + toSnakeCase(tripJson.name) + ".png";
  const mapExists = await fileExists(mapFileName);
  if (fetchStaticMap && !mapExists) {
    const staticMap = await fetchStaticMapMapbox(tripSvg.boundingBox);
    await writeFileAndLog(mapFileName, staticMap);
  }

  tripSvg.svgCanvas
    .image(year + "-" + toSnakeCase(tripJson.name) + ".png")
    .size(SIDE_PX, SIDE_PX)
    .back();
  await writeFileAndLog(
    "output/" + year + "-" + toSnakeCase(tripJson.name) + "-withmap.svg",
    tripSvg.svgCanvas.svg(svgExportModifier)
  );
}

const fileExists = async (path) => !!(await fs.stat(path).catch((e) => false));

async function writeFileAndLog(filename, data) {
  await fs.writeFile(filename, data);
  console.log(`Wrote ${filename}`);
}

function generateTripSvg(trip) {
  console.log(`Generating Trip SVG for ${trip.name}`);
  const tripBounds = computeTripBounds(trip, true);

  // Convert trip bounds to mercator projection
  const boundingBox = latlngToMercatorBbox(tripBounds);
  const maxSize = Math.max(boundingBox.width, boundingBox.height);
  const squareBoundingBox = boundingBox.transform(
    new SVG.Matrix().scale(
      maxSize / boundingBox.width,
      maxSize / boundingBox.height,
      boundingBox.cx,
      boundingBox.cy
    )
  );
  const expandedBoundingBox = squareBoundingBox.transform(
    new SVG.Matrix().scale(1.3, squareBoundingBox.cx, squareBoundingBox.cy)
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

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);

  const markerMask = canvas.mask();
  markerMask.add(canvas.rect(SIDE_PX, SIDE_PX).move(0, 0).fill("white"));

  const shapes = [];

  // Add lines for each leg
  for (const waypoint of trip.waypoints) {
    if (!waypoint.polyline || waypoint.hidePolyline) {
      continue;
    }
    const pathArray = pathFromPolyline(waypoint.polyline, transform, waypoint.location.lngShift);
    const path = canvas
      .path(pathArray)
      .addClass("line")
      .addClass(waypoint.mode)
      .maskWith(markerMask);
    if (waypoint.partialAttendance) {
      path.addClass("partialAttendance");
    }
    shapes.push(ShapeInfo.path(pathArray.toString()));
  }

  // Add marker for each waypoint
  for (const waypoint of trip.waypoints) {
    if (waypoint.hideWaypoint) {
      continue;
    }
    const point = toMercator(
      waypoint.location.lng + (waypoint.location.lngShift || 0),
      waypoint.location.lat
    ).transform(transform);
    const marker = canvas.circle().radius(markerRadius).centerAt(point);
    markerMask.add(marker.clone().fill("black"));
    marker.addClass("waypoint");
    if (waypoint.dayStop) {
      marker.addClass("dayStop");
    }
    if (waypoint.partialAttendance) {
      marker.addClass("partialAttendance");
    }
    shapes.push(ShapeInfo.circle(point, markerRadius));
  }

  // Add label for each waypoint

  const labelPoints = trip.waypoints
    .filter((waypoint) => !waypoint.hideWaypoint && !waypoint.hideLabel)
    .map((waypoint) => ({
      name: waypoint.name,
      point: toMercator(
        waypoint.location.lng + (waypoint.location.lngShift || 0),
        waypoint.location.lat
      ).transform(transform),
      partialAttendance: waypoint.partialAttendance,
    }));
  const bestLabelPlacement = calculateBestLabelPositions(
    labelPoints,
    32,
    labelFontSizePx,
    shapes,
    SIDE_PX,
    SIDE_PX
  );

  for (const labelPlacement of bestLabelPlacement.result) {
    if (labelPlacement.intersects) {
      console.log(`Intersecting ${labelPlacement.label.name}`);
    }
    canvas
      .rect(labelPlacement.width, labelPlacement.height)
      .at(labelPlacement.point)
      .opacity(0.2)
      .fill(labelPlacement.intersects ? "red" : "green")
      .addClass("labelRect");
    shapes.push(labelPlacement.shape);
    const label = canvas.text(labelPlacement.label.name).at(labelPlacement.point).addClass("label");
    if (labelPlacement.label.partialAttendance) {
      label.addClass("partialAttendance");
    }
  }

  return { svgCanvas: canvas, boundingBox: expandedBoundingBox };
}

async function processRegion(name, regionName, regionBounds, trips) {
  await fs.mkdir("output", { recursive: true });

  const regionSvg = generateRegionSvg(name, regionName, regionBounds, trips);
  await writeFileAndLog("output/" + toSnakeCase(name) + ".svg", regionSvg.svg(svgExportModifier));

  const box = regionSvg.viewbox();
  regionSvg
    .image(toSnakeCase(regionName) + ".png")
    .size(box.width, box.height)
    .back();
  await writeFileAndLog(
    "output/" + toSnakeCase(name) + "-withmap.svg",
    regionSvg.svg(svgExportModifier)
  );
}

function generateRegionSvg(name, regionName, regionBounds, trips) {
  console.log(`Generating Overview SVG for ${name}`);

  // Convert trip bounds to mercator projection
  const boundingBox = latlngToMercatorBbox(regionBounds);
  const scale =
    (SIDE_PX / Math.max(boundingBox.width, boundingBox.height)) * (regionBounds.scale || 1);
  const widthPx = boundingBox.width * scale;
  const heightPx = boundingBox.height * scale;

  const transform = new SVG.Matrix()
    .translate(-boundingBox.cx, -boundingBox.cy)
    .lmultiply(new SVG.Matrix().scale(scale))
    .lmultiply(new SVG.Matrix().translate(widthPx / 2, heightPx / 2));

  // returns a window with a document and an svg root node
  const window = createSVGWindow();
  const document = window.document;

  // register window and document
  SVG.registerWindow(window, document);

  // create canvas
  const canvas = SVG.SVG(document.documentElement);
  canvas.viewbox(0, 0, widthPx, heightPx);

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);

  const shapes = [];

  for (const [region, bounds] of Object.entries(REGIONS)) {
    if (region === regionName) {
      break;
    }
    const bbox = latlngToMercatorBbox(bounds).transform(transform);
    shapes.push(ShapeInfo.rectangle(bbox.x, bbox.y, bbox.width, bbox.height));
  }

  const filteredTrips = trips.filter((trip) => !trip.hideOnOverview);

  // Add lines/markers for each trip
  for (const trip of filteredTrips) {
    if (trip.waypoints.length == 1) {
      const waypoint = trip.waypoints[0];
      const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
      const marker = canvas.circle().radius(markerRadius).centerAt(point).addClass("waypoint");
      if (waypoint.dayStop) {
        marker.addClass("dayStop");
      }
      if (waypoint.partialAttendance) {
        marker.addClass("partialAttendance");
      }
      shapes.push(ShapeInfo.circle(point, markerRadius));
    } else {
      const pathArray = [];
      for (const waypoint of trip.waypoints) {
        const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
        if (waypoint.showWaypointOnOverview) {
          const marker = canvas.circle().radius(markerRadius).centerAt(point).addClass("waypoint");
          shapes.push(ShapeInfo.circle(point, markerRadius));
          if (waypoint.dayStop) {
            marker.addClass("dayStop");
          }
          if (waypoint.partialAttendance) {
            marker.addClass("partialAttendance");
          }
        }
        if (!waypoint.polyline || waypoint.hidePolyline || waypoint.hidePolylineOnOverview) {
          pathArray.push(["M", point.x, point.y]);
          continue;
        }
        const path = pathFromPolyline(waypoint.polyline, transform);
        if (pathArray.length > 0) {
          // Remove first element as it's just a move command
          path.shift();
        }
        pathArray.push(...path);
      }
      canvas.path(pathArray).addClass("line");
      shapes.push(ShapeInfo.path(pathArray.toString()));
    }
  }

  // Add label for each trip and each waypoint explicitly requested.
  const tripLabels = filteredTrips
    .filter((trip) => !trip.hideLabel)
    .map((trip) => {
      const tripBounds = computeTripBounds(trip);
      const tripBoundingBox = latlngToMercatorBbox(tripBounds).transform(transform);
      const tripCenter = new SVG.Point(tripBoundingBox.cx, tripBoundingBox.cy);
      return {
        name: trip.name,
        point: tripCenter,
        partialAttendance: trip.waypoints.every((waypoint) => waypoint.partialAttendance),
      };
    });
  const waypointLabels = filteredTrips.flatMap((trip) =>
    trip.waypoints
      .filter((waypoint) => waypoint.showWaypointOnOverview)
      .map((waypoint) => ({
        name: waypoint.name,
        point: toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform),
        partialAttendance: waypoint.partialAttendance,
      }))
  );
  const labelPoints = [...tripLabels, ...waypointLabels];

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
      .rect(labelPlacement.width, labelPlacement.height)
      .at(labelPlacement.point)
      .opacity(0.2)
      .fill(labelPlacement.intersects ? "red" : "green")
      .addClass("labelRect");
    shapes.push(labelPlacement.shape);
    const label = canvas.text(labelPlacement.label.name).at(labelPlacement.point).addClass("label");
    if (labelPlacement.label.partialAttendance) {
      label.addClass("partialAttendance");
    }
  }

  return canvas;
}

function addCanvasStyles(canvas) {
  const color = "#C61016";
  canvas.style(".line", {
    fill: "none",
    "stroke-width": 4,
    stroke: color,
    "stroke-opacity": 0.8,
    "stroke-linejoin": "round",
    "stroke-dasharray": "6 6",
    "stroke-linecap": "round",
  });
  canvas.style(".flying", {
    "stroke-dasharray": "2 8",
  });
  const markerRadius = 5;
  canvas.style(".waypoint", {
    r: markerRadius,
    fill: color,
  });
  canvas.style(".partialAttendance", {
    opacity: 0.5,
  });
  const strokeRadius = 2.5;
  canvas.style(".dayStop", {
    r: markerRadius - strokeRadius / 2,
    fill: "none",
    stroke: color,
    "stroke-width": strokeRadius,
  });
  const labelFontSizePx = 18;
  canvas.style(".label", {
    fontFamily: "Helvetica",
    fontSize: labelFontSizePx + "px",
    fill: color,
  });
  canvas.style(".labelRect", {
    display: "none",
  });
  return { markerRadius, labelFontSizePx };
}

// Compute trip bounds
function computeTripBounds(trip, allowWrap) {
  var lngShift = 0;
  const lngs = [trip.waypoints[0].location.lng];
  for (var i = 1; i < trip.waypoints.length; i++) {
    if (allowWrap) {
      if (trip.waypoints[i].location.lng < trip.waypoints[i - 1].location.lng - 180) {
        lngShift += 360;
      } else if (trip.waypoints[i].location.lng > trip.waypoints[i - 1].location.lng + 180) {
        lngShift -= 360;
      }
      trip.waypoints[i].location.lngShift = lngShift;
    }
    lngs.push(trip.waypoints[i].location.lng + lngShift);
  }
  const lats = trip.waypoints.map((waypoint) => waypoint.location.lat);

  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

// Convert lat and lng to mercator
function toMercator(lng, lat) {
  const x = lng / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  const y2 = -y / 180;
  return new SVG.Point(x, y2);
}

function latlngToMercatorBbox(bounds) {
  const tlMercator = toMercator(bounds.west, bounds.north);
  const brMercator = toMercator(bounds.east, bounds.south);

  return new SVG.PointArray([
    [tlMercator.x, tlMercator.y],
    [brMercator.x, brMercator.y],
  ]).bbox();
}

// Convert from mercator to lat and lng
function fromMercator(p) {
  const lng = 180 * p.x;
  const lat = (360 * Math.atan(Math.exp(-p.y * Math.PI))) / Math.PI - 90;
  return { lng, lat };
}

function pathFromPolyline(encodedPolyline, transform, lngShift = 0) {
  const decodedPolyline = polyline.decode(encodedPolyline);

  if (decodedPolyline.length == 2) {
    if (Math.abs(decodedPolyline[0][1] - decodedPolyline[1][1]) > 180) {
      const dir = Math.sign(decodedPolyline[0][1] - decodedPolyline[1][1]);
      // Add a dummy move as it may be removed later on (the arc path will add its own move so this will never matter)
      const path = new SVG.PathArray(["M", "0", "0"]);

      decodedPolyline[1][1] += dir * 360;

      const transformedPolyline1 = decodedPolyline.map((latlng) =>
        toMercator(latlng[1] + lngShift, latlng[0])
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(...transformedPolyline1));

      decodedPolyline[1][1] -= dir * 360;
      decodedPolyline[0][1] -= dir * 360;

      const transformedPolyline2 = decodedPolyline.map((latlng) =>
        toMercator(latlng[1] + lngShift, latlng[0])
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(...transformedPolyline2));

      return path;
    } else {
      const transformedPolyline = decodedPolyline.map((latlng) =>
        toMercator(latlng[1] + lngShift, latlng[0])
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      return arcPathBetweenPoints(...transformedPolyline);
    }
  } else {
    const transformedPolyline = decodedPolyline.map((latlng) =>
      toMercator(latlng[1] + lngShift, latlng[0])
        .transform(transform)
        .round(EXPORT_PRECISION)
    );
    const simplifiedPolyline = simplify(transformedPolyline, 0.5, false);
    const polylinePathArray = simplifiedPolyline.map((point) => ["L", point.x, point.y]);
    polylinePathArray[0][0] = "M";
    return new SVG.PathArray(polylinePathArray);
  }
}

function arcPathBetweenPoints(p1, p2) {
  const r = round(distanceBetweenPoints(p1, p2) * 1.3, EXPORT_PRECISION);
  return new SVG.PathArray([
    ["M", p1.x, p1.y],
    ["A", r, r, 0, 0, 1, p2.x, p2.y],
  ]);
}

function calculateBestLabelPositions(
  labelPoints,
  maxOffset,
  labelFontSizePx,
  shapesToAvoid,
  maxWidth,
  maxHeight
) {
  const rng = seedrandom("travelmaps");
  const numAttempts = 50;
  var bestLabelPlacement;
  for (let attempt = 0; attempt < numAttempts; attempt++) {
    const labelPlacements = calculateLabelPositions(
      rng,
      labelPoints,
      maxOffset,
      labelFontSizePx,
      shapesToAvoid,
      maxWidth,
      maxHeight
    );
    if (!bestLabelPlacement || compareLabelPlacement(labelPlacements, bestLabelPlacement) > 0) {
      bestLabelPlacement = labelPlacements;
      console.log(
        `Chose better placement with ${
          bestLabelPlacement.numberOfIntersections
        } intersections and average offset of ${bestLabelPlacement.averageOffset.toFixed(
          2
        )} and min separation of ${
          bestLabelPlacement.minimumLabelSeparation
        } and min label prominence of ${bestLabelPlacement.minimumLabelProminence.toFixed(
          2
        )} on attempt ${attempt}`
      );
    }
  }

  return bestLabelPlacement;
}

function calculateLabelPositions(
  rng,
  labels,
  maxOffset,
  labelFontSizePx,
  existingShapes,
  maxWidth,
  maxHeight
) {
  const shapes = [...existingShapes];
  const shuffledLabels = [...labels];
  shuffleArray(shuffledLabels, rng);
  const result = [];
  for (const label of shuffledLabels) {
    const labelWidth = pixelWidth(label.name, {
      font: "helvetica",
      size: labelFontSizePx,
    });
    const labelHeight = labelFontSizePx * 1.2;

    let hasPlaced = false;
    for (var offset = 4; !hasPlaced && offset <= maxOffset; offset += 4) {
      const labelOffsetOptions = generateLabelOffsetOptions(
        label.point,
        offset,
        labelWidth,
        labelHeight,
        maxWidth,
        maxHeight
      );
      shuffleArray(labelOffsetOptions, rng);
      for (let i = 0; !hasPlaced && i < labelOffsetOptions.length; i++) {
        const offsetPoint = labelOffsetOptions[i];
        const buffer = 1;
        const shapeInfo = shapeForLabel(
          offsetPoint.x - buffer,
          offsetPoint.y - buffer,
          labelWidth + 2 * buffer,
          labelHeight + 2 * buffer
        );

        const intersects = hasIntersections(shapes, shapeInfo);
        if (!intersects || (i == labelOffsetOptions.length - 1 && offset > maxOffset - 4)) {
          shapes.push(shapeInfo);
          result.push({
            label,
            width: labelWidth,
            height: labelHeight,
            point: offsetPoint,
            offset: offset,
            shape: shapeInfo,
            intersects,
          });
          hasPlaced = true;
        }
      }
    }
  }
  return {
    result,
    numberOfIntersections: numberOfIntersections(result),
    averageOffset: Math.sqrt(calculateOffsetSum(result) / result.length),
    minimumLabelSeparation: calculateLabelSeparation(result),
    minimumLabelProminence: calculateMinimumLabelProminence(result),
  };
}

/** Returns positive if a is better than b */
function compareLabelPlacement(a, b) {
  if (a.numberOfIntersections > b.numberOfIntersections) {
    return -1;
  } else if (a.numberOfIntersections < b.numberOfIntersections) {
    return 1;
  }
  return scoreLabelPlacement(a) - scoreLabelPlacement(b);
}

function numberOfIntersections(labelPlacements) {
  return labelPlacements.filter((label) => label.intersects).length;
}

// Higher is better
function scoreLabelPlacement(labelPlacements) {
  return (
    -2 * labelPlacements.averageOffset +
    labelPlacements.minimumLabelSeparation +
    2 * labelPlacements.minimumLabelProminence
  );
}

function calculateOffsetSum(labelPlacements) {
  return labelPlacements.map((label) => label.offset * label.offset).reduce((a, b) => a + b, 0);
}

function calculateLabelSeparation(labelPlacements) {
  var buffer = 0;
  for (; buffer < 100; buffer++) {
    const shapes = [];
    for (const labelPlacement of labelPlacements) {
      const testShape = ShapeInfo.rectangle(
        labelPlacement.point.x - buffer,
        labelPlacement.point.y - buffer,
        labelPlacement.width + 2 * buffer,
        labelPlacement.height + 2 * buffer
      );

      if (hasIntersections(shapes, testShape)) {
        return buffer;
      } else {
        shapes.push(testShape);
      }
    }
  }
  return buffer;
}

function shapeForLabel(x, y, width, height) {
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

  return ShapeInfo.path(pathArray.toString());
}

function calculateMinimumLabelProminence(labelPlacements) {
  var minLabelProminence = Infinity;
  for (const labelPlacement of labelPlacements) {
    var minDistanceToOtherLabel = Infinity;
    const labelRectangle = {
      x: labelPlacement.point.x,
      y: labelPlacement.point.y,
      width: labelPlacement.width,
      height: labelPlacement.height,
    };
    for (const otherLabelPlacement of labelPlacements) {
      if (labelPlacement != otherLabelPlacement) {
        minDistanceToOtherLabel = Math.min(
          minDistanceToOtherLabel,
          distanceFromPointToRectangle(otherLabelPlacement.label.point, labelRectangle)
        );
      }
    }
    const labelProminence =
      minDistanceToOtherLabel -
      distanceFromPointToRectangle(labelPlacement.label.point, labelRectangle);
    minLabelProminence = Math.min(labelProminence, minLabelProminence);
  }
  return minLabelProminence;
}

function distanceFromPointToRectangle(point, rectangle) {
  if (pointInsideRectangle(point, rectangle)) {
    return 0;
  }
  // Finds the minimum distance from a point to any side of a rectangle
  const minHorizontalDistance =
    point.x < rectangle.x
      ? rectangle.x - point.x
      : point.x > rectangle.x + rectangle.width
      ? point.x - rectangle.x - rectangle.width
      : 0;
  const minVerticalDistance =
    point.y < rectangle.y
      ? rectangle.y - point.y
      : point.y > rectangle.y + rectangle.height
      ? point.y - rectangle.y - rectangle.height
      : 0;
  return Math.sqrt(
    minHorizontalDistance * minHorizontalDistance + minVerticalDistance * minVerticalDistance
  );
}

function pointInsideRectangle(point, rectangle) {
  return (
    point.x >= rectangle.x &&
    point.x <= rectangle.x + rectangle.width &&
    point.y >= rectangle.y &&
    point.y <= rectangle.y + rectangle.height
  );
}

function generateLabelOffsetOptions(point, offset, labelWidth, labelHeight, maxWidth, maxHeight) {
  const diagonalOffset = offset / Math.SQRT2;
  const buffer = 0.02;
  return [
    // bottom right
    new SVG.Matrix().translate(diagonalOffset, diagonalOffset),
    // top right
    new SVG.Matrix().translate(diagonalOffset, -diagonalOffset - labelHeight),
    // top left
    new SVG.Matrix().translate(-diagonalOffset - labelWidth, -diagonalOffset - labelHeight),
    // bottom left
    new SVG.Matrix().translate(-diagonalOffset - labelWidth, diagonalOffset),
    // bottom
    new SVG.Matrix().translate(-labelWidth / 2, offset),
    // top
    new SVG.Matrix().translate(-labelWidth / 2, -offset - labelHeight),
    // left
    new SVG.Matrix().translate(-offset - labelWidth, -labelHeight / 2),
    // right
    new SVG.Matrix().translate(offset, -labelHeight / 2),
  ]
    .map((matrix) => point.transform(matrix))
    .filter((point) => {
      return (
        point.x + labelWidth <= maxWidth * (1 - buffer) &&
        point.y + labelHeight <= maxHeight * (1 - buffer) &&
        point.x >= maxWidth * buffer &&
        point.y >= maxHeight * buffer
      );
    });
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

function shuffleArray(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function round(number, precision) {
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

async function fetchRegionMap(region, bounds) {
  const regionMapFileName = "output/" + toSnakeCase(region) + ".png";
  const mapExists = await fileExists(regionMapFileName);
  if (!mapExists) {
    const boundingBox = latlngToMercatorBbox(bounds);
    const staticMap = await fetchStaticMapMapbox(boundingBox);
    await writeFileAndLog(regionMapFileName, staticMap);
  }
}

async function fetchStaticMapMapbox(boundingBox) {
  const scale = SIDE_PX / Math.max(boundingBox.width, boundingBox.height);
  const widthPx = Math.ceil(boundingBox.width * scale);
  const heightPx = Math.ceil(boundingBox.height * scale);
  const expandedHeightPx = heightPx + 20;
  const expandBottom = new SVG.Matrix().scale(
    1,
    expandedHeightPx / heightPx,
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

  // Longitude needs to be between -360 and 360
  if (tlLatLng.lng < -360) {
    tlLatLng.lng += 360;
    brLatLng.lng += 360;
  } else if (brLatLng.lng > 360) {
    tlLatLng.lng -= 360;
    brLatLng.lng -= 360;
  }

  const style =
    // "amorris13/clybhht7e00m601r4dwk57m95"; // muted
    // "mapbox/light-v11"
    "amorris13/clyk5oa2u01dw01rba38pe12t"; // muted, no labels
  const url = `https://api.mapbox.com/styles/v1/${style}/static/[${tlLatLng.lng},${brLatLng.lat},${brLatLng.lng},${tlLatLng.lat}]/${widthPx}x${expandedHeightPx}@2x?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;

  console.log(url);
  const response = await fetch(url);
  const staticMapBlob = await response.blob();

  const staticMapBuffer = Buffer.from(await staticMapBlob.arrayBuffer());

  const staticMapCroppedBuffer = await sharp(staticMapBuffer)
    .extract({ left: 0, top: 0, width: widthPx * 2, height: heightPx * 2 })
    .toBuffer();

  return staticMapCroppedBuffer;
}

main();
