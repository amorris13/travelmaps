import * as SVG from "@svgdotjs/svg.js";
import polyline from "@mapbox/polyline";
import pixelWidth from "string-pixel-width";
import type { Shape } from "svg-intersections";
import { intersect, shape } from "svg-intersections";
import seedrandom from "seedrandom";
import simplify from "simplify-js";

import type {
  Trip as RawTrip,
  Stage as RawStage,
  Location as RawLocation,
  LatLng,
} from "./trips.ts";

// --- Type Definitions ---

export interface RegionBounds {
  north: number;
  east: number;
  south: number;
  west: number;
  scale?: number;
}

export interface TripBounds extends RegionBounds {
  lngShift?: number;
}

export interface Location extends RawLocation {
  latlng: LatLng;
}

export interface Stage extends RawStage {
  startLocation?: Location;
  endLocation: Location;
  lngShift?: number;
}

export interface Trip extends RawTrip {
  stages: Stage[];
}

export interface LabelPoint {
  name: string;
  point: SVG.Point;
  partialAttendance?: boolean;
}

export interface LabelPlacement {
  label: LabelPoint;
  width: number;
  height: number;
  point: SVG.Point;
  offset: number;
  shape: Shape;
  intersects: boolean;
}

export interface LabelPlacementResult {
  result: LabelPlacement[];
  numberOfIntersections: number;
  averageOffset: number;
  labelSeparationScore: number;
  labelProminenceScore: number;
}

// --- Constants ---
export const EXPORT_PRECISION = 3;
export const SIDE_PX = 1200;

// --- SVG.js Extensions ---

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
    if ("cx" in this && typeof this.cx === "function") {
      (this as SVG.Circle).cx(point.x).cy(point.y);
    } else {
      const box = this.bbox();
      this.x(point.x - box.width / 2).y(point.y - box.height / 2);
    }
    return this;
  },
});

export const svgExportModifier = (node: SVG.Dom): void => {
  node.round(EXPORT_PRECISION);
};

// --- Style Functions ---

export function addCanvasStyles(
  canvas: SVG.Svg
): { markerRadius: number; labelFontSizePx: number } {
  const color = "#C61016";
  canvas.style().rule(".line", {
    fill: "none",
    "stroke-width": 4,
    stroke: color,
    "stroke-opacity": 0.8,
    "stroke-linejoin": "round",
    "stroke-dasharray": "6 6",
    "stroke-linecap": "round",
  });
  canvas.style().rule(".flying", {
    "stroke-dasharray": "2 8",
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
  const labelFontSizePx = 18;
  canvas.style().rule(".label", {
    fontFamily: "Helvetica",
    fontSize: labelFontSizePx + "px",
    fill: color,
  });
  canvas.style().rule(".labelRect", {
    display: "none",
  });
  return { markerRadius, labelFontSizePx };
}

// --- Geometry and Calculation Functions ---

export function computeTripBounds(trip: Trip, allowWrap = false): TripBounds {
  if (!trip.stages || trip.stages.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  let lngShift = 0;
  const firstStage = trip.stages[0];
  const lngs = [firstStage.endLocation.latlng.lng];
  if (allowWrap) firstStage.lngShift = 0;

  for (let i = 1; i < trip.stages.length; i++) {
    const currentStage = trip.stages[i];
    const prevStage = trip.stages[i - 1];

    if (allowWrap) {
      const lngDiff =
        currentStage.endLocation.latlng.lng - prevStage.endLocation.latlng.lng;
      if (lngDiff < -180) {
        lngShift += 360;
      } else if (lngDiff > 180) {
        lngShift -= 360;
      }
      currentStage.lngShift = lngShift;
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

export function computeStageBounds(stage: Stage): RegionBounds {
  const locations: LatLng[] = [];
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

export function decodePolyline(encodedPolyline: string): LatLng[] {
  return polyline
    .decode(encodedPolyline)
    .map((point) => ({ lng: point[1], lat: point[0] }));
}

export function toMercatorLatLng(latlng: LatLng): SVG.Point {
  return toMercator(latlng.lng, latlng.lat);
}

export function toMercator(lng: number, lat: number): SVG.Point {
  const x = lng / 180;
  const rad = lat * (Math.PI / 180);
  const y = Math.log(Math.tan(rad / 2 + Math.PI / 4)) / Math.PI;
  const y2 = -y;
  return new SVG.Point(x, y2);
}

export function latlngToMercatorBbox(
  bounds: RegionBounds | TripBounds
): SVG.Box {
  const tlMercator = toMercator(bounds.west, bounds.north);
  const brMercator = toMercator(bounds.east, bounds.south);
  return new SVG.PointArray([
    [tlMercator.x, tlMercator.y],
    [brMercator.x, brMercator.y],
  ]).bbox();
}

export function fromMercator(p: { x: number; y: number }): LatLng {
  const lng = 180 * p.x;
  const latRad = Math.atan(Math.exp(-p.y * Math.PI)) * 2 - Math.PI / 2;
  const lat = latRad * (180 / Math.PI);
  return { lng, lat };
}

export function pathFromPolyline(
  decodedPolyline: LatLng[],
  transform: SVG.Matrix,
  lngShift = 0
): SVG.PathArray {
  if (!decodedPolyline) return new SVG.PathArray();

  if (decodedPolyline.length == 2) {
    if (Math.abs(decodedPolyline[0].lng - decodedPolyline[1].lng) > 180) {
      const dir = Math.sign(decodedPolyline[0].lng - decodedPolyline[1].lng);
      const path = new SVG.PathArray(["M", "0", "0"]);
      decodedPolyline[1].lng += dir * 360;
      const transformedPolyline1 = decodedPolyline.map((latlng) =>
        toMercator(latlng.lng + lngShift, latlng.lat)
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(
        ...arcPathBetweenPoints(transformedPolyline1[0], transformedPolyline1[1])
      );
      decodedPolyline[1].lng -= dir * 360;
      decodedPolyline[0].lng -= dir * 360;
      const transformedPolyline2 = decodedPolyline.map((latlng) =>
        toMercator(latlng.lng + lngShift, latlng.lat)
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(
        ...arcPathBetweenPoints(transformedPolyline2[0], transformedPolyline2[1])
      );
      return path;
    } else {
      const transformedPolyline = decodedPolyline.map((latlng) =>
        toMercator(latlng.lng + lngShift, latlng.lat)
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      return arcPathBetweenPoints(
        transformedPolyline[0],
        transformedPolyline[1]
      );
    }
  } else {
    const transformedPolyline = decodedPolyline.map((latlng) =>
      toMercator(latlng.lng + lngShift, latlng.lat)
        .transform(transform)
        .round(EXPORT_PRECISION)
    );
    const simplifiedPolyline = simplify(transformedPolyline, 0.5, false);
    const polylinePathArray: SVG.PathCommand[] = simplifiedPolyline.map(
      (point) => ["L", point.x, point.y]
    );
    polylinePathArray[0][0] = "M";
    return new SVG.PathArray(polylinePathArray);
  }
}

function arcPathBetweenPoints(p1: SVG.Point, p2: SVG.Point): SVG.PathArray {
  const dist = distanceBetweenPoints(p1, p2);
  const r = round(dist * 1.3, EXPORT_PRECISION);
  const radius = Math.max(r, 0.1);
  return new SVG.PathArray([
    ["M", p1.x, p1.y],
    ["A", radius, radius, 0, 0, 1, p2.x, p2.y],
  ]);
}

// --- Label Placement Functions ---

export function calculateBestLabelPositions(
  labelPoints: LabelPoint[],
  maxOffset: number,
  labelFontSizePx: number,
  shapesToAvoid: Shape[],
  maxWidth: number,
  maxHeight: number
): LabelPlacementResult {
  const rng = seedrandom("travelmaps");
  const numAttempts = 50;
  let bestLabelPlacement: LabelPlacementResult | null = null;

  for (let attempt = 0; attempt < numAttempts; attempt++) {
    const currentPlacement = calculateLabelPositions(
      rng,
      labelPoints,
      maxOffset,
      labelFontSizePx,
      shapesToAvoid,
      maxWidth,
      maxHeight
    );
    if (
      !bestLabelPlacement ||
      compareLabelPlacement(currentPlacement, bestLabelPlacement) > 0
    ) {
      bestLabelPlacement = currentPlacement;
    }
  }

  if (!bestLabelPlacement) {
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
  maxOffset: number,
  labelFontSizePx: number,
  existingShapes: Shape[],
  maxWidth: number,
  maxHeight: number
): LabelPlacementResult {
  const shapes = [...existingShapes];
  const shuffledLabels = [...labels];
  shuffleArray(shuffledLabels, rng);
  const result: LabelPlacement[] = [];

  for (const label of shuffledLabels) {
    if (!label.name) continue;

    const labelWidth = pixelWidth(label.name, {
      font: "helvetica",
      size: labelFontSizePx,
    });
    const labelHeight = labelFontSizePx * 1.2;

    let hasPlaced = false;
    for (let offset = 4; !hasPlaced && offset <= maxOffset; offset += 4) {
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
        if (
          !intersects ||
          (i === labelOffsetOptions.length - 1 && offset >= maxOffset - 4)
        ) {
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
    averageOffset: calculateOffsetScore(result),
    labelSeparationScore: calculateLabelSeparation(result),
    labelProminenceScore: calculateLabelProminenceScore(result),
  };
}

function compareLabelPlacement(
  a: LabelPlacementResult,
  b: LabelPlacementResult
): number {
  return scoreLabelPlacement(a) - scoreLabelPlacement(b);
}

function scoreLabelPlacement(labelPlacements: LabelPlacementResult): number {
  return (
    -10000 * labelPlacements.numberOfIntersections +
    -2 * labelPlacements.averageOffset +
    labelPlacements.labelSeparationScore +
    2 * labelPlacements.labelProminenceScore
  );
}

function numberOfIntersections(labelPlacements: LabelPlacement[]): number {
  return labelPlacements.filter((label) => label.intersects).length;
}

function calculateOffsetScore(labelPlacements: LabelPlacement[]): number {
  if (labelPlacements.length === 0) return 0;
  return generalizedMean(
    labelPlacements.map((label) => label.offset),
    2
  );
}

function calculateLabelSeparation(labelPlacements: LabelPlacement[]): number {
  if (labelPlacements.length < 2) return 0;
  const labelSeparations: number[] = [];
  for (let i = 0; i < labelPlacements.length; i++) {
    let minDistanceToOtherLabel = Infinity;
    const labelRect1 = rectangleForLabelPlacement(labelPlacements[i]);
    for (let j = 0; j < labelPlacements.length; j++) {
      if (i !== j) {
        const labelRect2 = rectangleForLabelPlacement(labelPlacements[j]);
        minDistanceToOtherLabel = Math.min(
          minDistanceToOtherLabel,
          distanceBetweenRectangles(labelRect1, labelRect2)
        );
      }
    }
    labelSeparations.push(minDistanceToOtherLabel);
  }
  return generalizedMean(labelSeparations, -1);
}

function shapeForLabel(
  x: number,
  y: number,
  width: number,
  height: number
): Shape {
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

interface SimpleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectangleForLabelPlacement(labelPlacement: LabelPlacement): SimpleRect {
  return {
    x: labelPlacement.point.x,
    y: labelPlacement.point.y,
    width: labelPlacement.width,
    height: labelPlacement.height,
  };
}

function calculateLabelProminenceScore(
  labelPlacements: LabelPlacement[]
): number {
  if (labelPlacements.length === 0) return 0;
  const labelProminences: number[] = [];
  for (let i = 0; i < labelPlacements.length; i++) {
    let minDistanceToOtherLabelPoint = Infinity;
    const labelRect = rectangleForLabelPlacement(labelPlacements[i]);
    for (let j = 0; j < labelPlacements.length; j++) {
      if (i !== j) {
        minDistanceToOtherLabelPoint = Math.min(
          minDistanceToOtherLabelPoint,
          distanceFromPointToRectangle(labelPlacements[j].label.point, labelRect)
        );
      }
    }
    const ownDistance = distanceFromPointToRectangle(
      labelPlacements[i].label.point,
      labelRect
    );
    labelProminences.push(minDistanceToOtherLabelPoint - ownDistance);
  }
  return generalizedMean(labelProminences, -Infinity);
}

function distanceFromPointToRectangle(
  point: SVG.Point,
  rectangle: SimpleRect
): number {
  const dx = Math.max(
    rectangle.x - point.x,
    0,
    point.x - (rectangle.x + rectangle.width)
  );
  const dy = Math.max(
    rectangle.y - point.y,
    0,
    point.y - (rectangle.y + rectangle.height)
  );
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceBetweenRectangles(r1: SimpleRect, r2: SimpleRect): number {
  const dx = Math.max(r1.x - (r2.x + r2.width), 0, r2.x - (r1.x + r1.width));
  const dy = Math.max(r1.y - (r2.y + r2.height), 0, r2.y - (r1.y + r1.height));
  return Math.sqrt(dx * dx + dy * dy);
}

function generalizedMean(array: number[], exponent: number): number {
  if (array.length === 0) return 0;
  if (exponent === 0) {
    const product = array.reduce((a, b) => a * (b > 0 ? b : 1e-9), 1);
    return Math.pow(product, 1 / array.length);
  }
  if (exponent === Infinity) return Math.max(...array);
  if (exponent === -Infinity) return Math.min(...array);

  let sumOfPowers = 0;
  for (const value of array) {
    if (value < 0 && !Number.isInteger(exponent)) {
      return NaN;
    } else {
      sumOfPowers += Math.pow(value, exponent);
    }
  }
  const meanOfPowers = sumOfPowers / array.length;
  if (meanOfPowers < 0 && !Number.isInteger(1 / exponent)) {
    return NaN;
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
  const buffer = 0.02;
  const matrices = [
    new SVG.Matrix().translate(diagonalOffset, diagonalOffset),
    new SVG.Matrix().translate(diagonalOffset, -diagonalOffset - labelHeight),
    new SVG.Matrix().translate(
      -diagonalOffset - labelWidth,
      -diagonalOffset - labelHeight
    ),
    new SVG.Matrix().translate(-diagonalOffset - labelWidth, diagonalOffset),
    new SVG.Matrix().translate(-labelWidth / 2, offset),
    new SVG.Matrix().translate(-labelWidth / 2, -offset - labelHeight),
    new SVG.Matrix().translate(-offset - labelWidth, -labelHeight / 2),
    new SVG.Matrix().translate(offset, -labelHeight / 2),
  ];
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

function hasIntersections(shapes: Shape[], testShape: Shape): boolean {
  for (const existingShape of shapes) {
    try {
      const intersection = intersect(existingShape, testShape);
      if (intersection.points.length > 0) {
        return true;
      }
    } catch (error: unknown) {
      return true;
    }
  }
  return false;
}

// --- Utility Functions ---

export function toSnakeCase(str: string): string {
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

export function shuffleArray<T>(array: T[], rng: seedrandom.PRNG): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export function round(number: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}
