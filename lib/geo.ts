import polyline from "@mapbox/polyline";
import simplify from "simplify-js";
import type {
  LatLng,
  RegionBounds,
  TripBounds,
  Trip,
  Stage,
  SimplePoint,
} from "./types";
import { EXPORT_PRECISION } from "./constants";

// --- Mercator Projection ---

export function toMercator(latlng: LatLng): SimplePoint {
  const x = latlng.lng / 180;
  const rad = latlng.lat * (Math.PI / 180);
  const y = Math.log(Math.tan(rad / 2 + Math.PI / 4)) / Math.PI;
  const y2 = -y; // Invert Y for typical screen coordinates
  return { x, y: y2 };
}

export function fromMercator(p: SimplePoint): LatLng {
  const lng = 180 * p.x;
  const latRad = Math.atan(Math.exp(-p.y * Math.PI)) * 2 - Math.PI / 2;
  const lat = latRad * (180 / Math.PI);
  return { lng, lat };
}

// --- Bounding Box ---

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
}

export function latlngToMercatorBbox(bounds: RegionBounds | TripBounds): BBox {
  const tl = toMercator({ lng: bounds.west, lat: bounds.north });
  const br = toMercator({ lng: bounds.east, lat: bounds.south });

  const x = Math.min(tl.x, br.x);
  const y = Math.min(tl.y, br.y);
  const x2 = Math.max(tl.x, br.x);
  const y2 = Math.max(tl.y, br.y);
  const width = x2 - x;
  const height = y2 - y;

  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
    x2,
    y2,
  };
}

// --- Polyline ---

export function decodePolyline(encodedPolyline: string): LatLng[] {
  return polyline
    .decode(encodedPolyline)
    .map((point) => ({ lng: point[1], lat: point[0] }));
}

export function shiftLatLng(latlng: LatLng, lngShift: number): LatLng {
  return { lat: latlng.lat, lng: latlng.lng + lngShift };
}

// --- Transform ---

/** Simple 2D affine transform: translate then scale */
export interface Transform {
  translateX: number;
  translateY: number;
  scale: number;
}

export function applyTransform(p: SimplePoint, t: Transform): SimplePoint {
  return {
    x: (p.x + t.translateX) * t.scale,
    y: (p.y + t.translateY) * t.scale,
  };
}

export function roundPoint(p: SimplePoint, precision: number): SimplePoint {
  const factor = 10 ** precision;
  return {
    x: Math.round(p.x * factor) / factor,
    y: Math.round(p.y * factor) / factor,
  };
}

/**
 * Compute the transform needed to render trip bounds into a square canvas.
 * Returns the transform and the expanded bounding box (in Mercator coords).
 */
export function computeMapTransform(
  tripBounds: RegionBounds | TripBounds,
  sidePx: number,
  padding = 1.3
): { transform: Transform; expandedBbox: BBox } {
  const bbox = latlngToMercatorBbox(tripBounds);
  const maxSize = Math.max(bbox.width, bbox.height);
  const scaleX = bbox.width === 0 ? 1 : maxSize / bbox.width;
  const scaleY = bbox.height === 0 ? 1 : maxSize / bbox.height;

  // Make square
  const squareWidth = bbox.width * scaleX;
  const squareHeight = bbox.height * scaleY;
  const squareCx = bbox.cx;
  const squareCy = bbox.cy;

  // Expand
  const expandedWidth = squareWidth * padding;
  const expandedHeight = squareHeight * padding;
  const expandedBbox: BBox = {
    x: squareCx - expandedWidth / 2,
    y: squareCy - expandedHeight / 2,
    width: expandedWidth,
    height: expandedHeight,
    cx: squareCx,
    cy: squareCy,
    x2: squareCx + expandedWidth / 2,
    y2: squareCy + expandedHeight / 2,
  };

  const transformScale = Math.min(
    expandedWidth === 0 ? 1 : sidePx / expandedWidth,
    expandedHeight === 0 ? 1 : sidePx / expandedHeight
  );

  const transform: Transform = {
    translateX: -expandedBbox.cx + sidePx / 2 / transformScale,
    translateY: -expandedBbox.cy + sidePx / 2 / transformScale,
    scale: transformScale,
  };

  return { transform, expandedBbox: expandedBbox };
}

/**
 * Convert a decoded polyline into an SVG path `d` string.
 * Simplifies the polyline using simplify-js.
 */
export function pathFromPolyline(
  decodedPolyline: LatLng[],
  transform: Transform,
  lngShift = 0
): string {
  if (!decodedPolyline || decodedPolyline.length === 0) return "";

  if (decodedPolyline.length === 2) {
    if (Math.abs(decodedPolyline[0].lng - decodedPolyline[1].lng) > 180) {
      const dir = Math.sign(decodedPolyline[0].lng - decodedPolyline[1].lng);
      const copy = decodedPolyline.map((ll) => ({ ...ll }));
      copy[1].lng += dir * 360;

      const t1 = copy.map((ll) =>
        roundPoint(
          applyTransform(toMercator(shiftLatLng(ll, lngShift)), transform),
          EXPORT_PRECISION
        )
      );
      const arc1 = arcPathBetweenPoints(t1[0], t1[1]);

      const t2 = copy.map((ll) =>
        roundPoint(
          applyTransform(
            toMercator(shiftLatLng(ll, lngShift - dir * 360)),
            transform
          ),
          EXPORT_PRECISION
        )
      );
      const arc2 = arcPathBetweenPoints(t2[0], t2[1]);

      return `M 0 0 ${arc1} ${arc2}`;
    } else {
      const transformed = decodedPolyline.map((ll) =>
        roundPoint(
          applyTransform(toMercator(shiftLatLng(ll, lngShift)), transform),
          EXPORT_PRECISION
        )
      );
      return arcPathBetweenPoints(transformed[0], transformed[1]);
    }
  } else {
    // Unwrap longitudes across the antimeridian
    const unwrapped = decodedPolyline.map((ll) => ({ ...ll }));
    for (let i = 1; i < unwrapped.length; i++) {
      const diff = unwrapped[i].lng - unwrapped[i - 1].lng;
      if (diff > 180) {
        unwrapped[i].lng -= 360;
      } else if (diff < -180) {
        unwrapped[i].lng += 360;
      }
    }

    const transformed = unwrapped.map((ll) =>
      roundPoint(
        applyTransform(toMercator(shiftLatLng(ll, lngShift)), transform),
        EXPORT_PRECISION
      )
    );
    const simplified = simplify(transformed, 0.5, false);
    return simplified
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }
}

function arcPathBetweenPoints(p1: SimplePoint, p2: SimplePoint): string {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const factor = 10 ** EXPORT_PRECISION;
  const r = Math.max(Math.round(dist * 1.3 * factor) / factor, 0.1);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
}

// --- Bounds Computation ---

export function computeTripBounds(
  trip: Trip,
  allowWrap = false
): TripBounds {
  if (!trip.stages || trip.stages.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  // Pre-filter to stages that have geocoded locations
  const geocodedStages = trip.stages.filter((s) => s.endLocation?.latlng);
  if (geocodedStages.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }

  let lngShift = 0;
  const lngs = [geocodedStages[0].endLocation.latlng!.lng];
  if (allowWrap) geocodedStages[0].lngShift = 0;

  for (let i = 1; i < geocodedStages.length; i++) {
    const currentStage = geocodedStages[i];
    const prevStage = geocodedStages[i - 1];

    if (allowWrap) {
      const lngDiff =
        currentStage.endLocation.latlng!.lng -
        prevStage.endLocation.latlng!.lng;
      if (lngDiff < -180) {
        lngShift += 360;
      } else if (lngDiff > 180) {
        lngShift -= 360;
      }
      currentStage.lngShift = lngShift;
    }
    lngs.push(currentStage.endLocation.latlng!.lng + lngShift);
  }

  const lats = geocodedStages.map((s) => s.endLocation.latlng!.lat);

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

/** Compute bounds from an array of encoded polylines */
export function computeBoundsFromPolylines(polylines: string[]): RegionBounds {
  const allPoints: LatLng[] = [];
  for (const encoded of polylines) {
    allPoints.push(...decodePolyline(encoded));
  }
  if (allPoints.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }
  return {
    west: Math.min(...allPoints.map((p) => p.lng)),
    east: Math.max(...allPoints.map((p) => p.lng)),
    south: Math.min(...allPoints.map((p) => p.lat)),
    north: Math.max(...allPoints.map((p) => p.lat)),
  };
}

// --- Distance ---

export function latLngDistance(latlng1: LatLng, latlng2: LatLng): number {
  const R = 6371e3;
  const phi1 = (latlng1.lat * Math.PI) / 180;
  const phi2 = (latlng2.lat * Math.PI) / 180;
  const deltaPhi = ((latlng2.lat - latlng1.lat) * Math.PI) / 180;
  const deltaLambda = ((latlng2.lng - latlng1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function findPointAtFraction(
  polylinePoints: LatLng[],
  fraction: number
): LatLng | null {
  if (polylinePoints.length === 0) return null;
  if (fraction <= 0) return polylinePoints[0];
  if (fraction >= 1) return polylinePoints[polylinePoints.length - 1];

  const totalDistance = polylinePoints.reduce((acc, point, i) => {
    if (i === 0) return 0;
    return acc + latLngDistance(polylinePoints[i - 1], point);
  }, 0);

  const targetDistance = totalDistance * fraction;
  let distanceTraveled = 0;

  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const start = polylinePoints[i];
    const end = polylinePoints[i + 1];
    const segmentDistance = latLngDistance(start, end);
    if (distanceTraveled + segmentDistance >= targetDistance) {
      const distanceIntoSegment = targetDistance - distanceTraveled;
      const segmentFraction =
        segmentDistance === 0 ? 0 : distanceIntoSegment / segmentDistance;
      return {
        lat: start.lat + (end.lat - start.lat) * segmentFraction,
        lng: start.lng + (end.lng - start.lng) * segmentFraction,
      };
    }
    distanceTraveled += segmentDistance;
  }
  return polylinePoints[polylinePoints.length - 1];
}

// --- Utilities ---

export function distanceBetweenPoints(
  p1: SimplePoint,
  p2: SimplePoint
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function round(n: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

export function isContinuous(latlng1: LatLng, latlng2: LatLng): boolean {
  const toleranceMeters = 2000;
  return latLngDistance(latlng1, latlng2) < toleranceMeters;
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}
