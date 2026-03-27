import simplify from "simplify-js";
import type { SimplePoint } from "./types";
import {
  ELEVATION_PADDING,
  KEY_ELEVATIONS_HEIGHT,
  STAGE_MARKERS_HEIGHT,
  PROMINENT_ELEVATION_LABELS_HEIGHT,
  ACCENT_COLOR,
} from "./constants";

export interface ElevationProfileOptions {
  stageMarkers?: { distance: number; label: string }[];
  horizontalGridlines?: boolean;
  labelProminentElevations?: {
    minProminence?: number;
  };
  showKeyElevations?: boolean;
}

export interface ElevationProfileSegment {
  elevationStream: number[];
  distanceStream: number[];
  isContinuousWithNext?: boolean;
}

export interface ElevationProfileData {
  /** Simplified elevation profile points, split into segments (x, y in SVG coordinates) */
  profileSegments: SimplePoint[][];
  /** Pre-computed SVG path strings for each segment */
  segmentPaths: {
    pathD: string;
    fillD: string;
  }[];
  /** Full computed points (before simplification) */
  allPoints: SimplePoint[];
  /** SVG dimensions */
  svgWidth: number;
  svgHeight: number;
  /** Plot area offset */
  plotOffsetY: number;
  plotWidth: number;
  plotHeight: number;
  /** Elevation stats */
  maxElevation: number;
  minElevation: number;
  maxElevationIndex: number;
  maxElevationPoint: SimplePoint;
  /** Points for the max elevation triangle marker */
  maxElevationTrianglePoints: string;
  /** Horizontal gridline Y positions */
  gridlines: number[];
  /** Prominent elevation labels */
  prominentLabels: {
    elevation: number;
    x: number;
    y: number;
    anchor: "start" | "middle" | "end";
  }[];
  /** Stage marker positions */
  stageMarkerPositions: {
    x: number;
    xNext: number;
    elevationY: number;
    label: string;
  }[];
  /** Key elevations (start, peak, end) */
  keyElevations: {
    start: number;
    peak: number;
    end: number;
  };
  /** Gradient colors */
  gradientStartColor: string;
  gradientEndColor: string;
  /** Accent color */
  accentColor: string;
}

export function parseToRgb(hexColor: string): {
  r: number;
  g: number;
  b: number;
} {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbToHex({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function mixColors(
  hexColor1: string,
  hexColor2: string,
  ratio: number
): string {
  const rgb1 = parseToRgb(hexColor1);
  const rgb2 = parseToRgb(hexColor2);
  const mix = (c1: number, c2: number) =>
    Math.round(c1 * ratio + c2 * (1 - ratio));
  return rgbToHex({
    r: mix(rgb1.r, rgb2.r),
    g: mix(rgb1.g, rgb2.g),
    b: mix(rgb1.b, rgb2.b),
  });
}

/**
 * Compute elevation profile geometry data.
 * Returns all data needed to render the profile as SVG (either server-side or React).
 */
export function computeElevationProfile(
  segments: ElevationProfileSegment[],
  plotWidth: number,
  plotHeight: number,
  options?: ElevationProfileOptions,
  accentColor: string = ACCENT_COLOR
): ElevationProfileData {
  const padding = ELEVATION_PADDING;
  const svgWidth = padding + plotWidth + padding;
  const svgHeight =
    padding +
    (options?.labelProminentElevations ? PROMINENT_ELEVATION_LABELS_HEIGHT : 0) +
    plotHeight +
    (options?.stageMarkers ? STAGE_MARKERS_HEIGHT : 0) +
    (options?.showKeyElevations ? KEY_ELEVATIONS_HEIGHT : 0) +
    padding;

  // Combine and handle gaps
  const combinedElevation: number[] = [];
  const combinedDistance: number[] = [];
  let cumulativeDistance = 0;

  // First calculate raw total distance to compute gap size
  let rawTotalDistance = 0;
  for (const s of segments) {
    if (s.distanceStream.length > 0) {
      rawTotalDistance += s.distanceStream[s.distanceStream.length - 1];
    }
  }
  const gapSize = rawTotalDistance * 0.01; // 1% gap

  for (const s of segments) {
    const len = Math.min(s.elevationStream.length, s.distanceStream.length);
    if (len === 0) continue;

    for (let i = 0; i < len; i++) {
      combinedElevation.push(s.elevationStream[i]);
      combinedDistance.push(s.distanceStream[i] + cumulativeDistance);
    }

    const lastDist = s.distanceStream[len - 1];
    cumulativeDistance += lastDist;
    if (s.isContinuousWithNext === false) {
      cumulativeDistance += gapSize;
    }
  }

  const gradientStartColor = mixColors(accentColor, "#ffffff", 0.5);
  const gradientEndColor = mixColors(accentColor, "#ffffff", 0.05);

  // Guard against empty or misaligned data
  if (combinedElevation.length === 0 || combinedDistance.length === 0) {
    return {
      profileSegments: [],
      segmentPaths: [],
      allPoints: [],
      svgWidth,
      svgHeight,
      plotOffsetY: padding,
      plotWidth,
      plotHeight,
      maxElevation: 0,
      minElevation: 0,
      maxElevationIndex: 0,
      maxElevationPoint: { x: 0, y: 0 },
      maxElevationTrianglePoints: "",
      gridlines: [],
      prominentLabels: [],
      stageMarkerPositions: [],
      keyElevations: { start: 0, peak: 0, end: 0 },
      gradientStartColor,
      gradientEndColor,
      accentColor,
    };
  }

  let plotOffsetY = padding;

  const clamped = combinedElevation.map((e) => Math.max(0, e));
  const maxElevation = Math.max(Math.max(...clamped), 200);
  const minElevation = 0;
  const elevationRange = maxElevation - minElevation;
  const maxDistance = combinedDistance[combinedDistance.length - 1];

  if (maxDistance <= 0) {
    return {
      profileSegments: [],
      segmentPaths: [],
      allPoints: [],
      svgWidth,
      svgHeight,
      plotOffsetY,
      plotWidth,
      plotHeight,
      maxElevation,
      minElevation,
      maxElevationIndex: 0,
      maxElevationPoint: { x: 0, y: 0 },
      maxElevationTrianglePoints: "",
      gridlines: [],
      prominentLabels: [],
      stageMarkerPositions: [],
      keyElevations: { start: Math.round(clamped[0]), peak: Math.round(maxElevation), end: Math.round(clamped[clamped.length - 1]) },
      gradientStartColor,
      gradientEndColor,
      accentColor,
    };
  }

  if (options?.labelProminentElevations) {
    plotOffsetY += PROMINENT_ELEVATION_LABELS_HEIGHT;
  }

  const allPoints = clamped.map((elevation, index) => ({
    x: (combinedDistance[index] / maxDistance) * plotWidth + padding,
    y: ((1 - (elevation - minElevation) / elevationRange) * plotHeight) + plotOffsetY,
  }));

  // Re-split into segments for path rendering
  const profileSegments: SimplePoint[][] = [];
  let currentOffset = 0;
  for (const s of segments) {
    const len = Math.min(s.elevationStream.length, s.distanceStream.length);
    if (len === 0) continue;
    const segmentPoints = allPoints.slice(currentOffset, currentOffset + len);
    if (segmentPoints.length > 0) {
      profileSegments.push(simplify(segmentPoints, 0.1, true));
    }
    currentOffset += len;
  }

  const segmentPaths = profileSegments.map((points) => {
    if (points.length === 0) return { pathD: "", fillD: "" };
    const pathD = points
      .map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    const firstPt = points[0];
    const lastPt = points[points.length - 1];
    const fillD = `${pathD} L ${lastPt.x} ${plotOffsetY + plotHeight} L ${firstPt.x} ${plotOffsetY + plotHeight} Z`;
    return { pathD, fillD };
  });

  const maxElevationIndex = clamped.indexOf(Math.max(...clamped));
  const maxElevationPoint = allPoints[maxElevationIndex];

  // Triangle marker for max elevation
  const triSize = 10;
  const cx = maxElevationPoint.x;
  const cy = maxElevationPoint.y;
  const maxElevationTrianglePoints = `${cx},${cy - triSize * (Math.sqrt(3) / 3)} ${cx - triSize / 2},${cy + triSize * (Math.sqrt(3) / 6)} ${cx + triSize / 2},${cy + triSize * (Math.sqrt(3) / 6)}`;

  // Gridlines
  const gridlines: number[] = [];
  if (options?.horizontalGridlines) {
    const numHorizontalGridlines = 4;
    for (let i = 0; i < numHorizontalGridlines; i++) {
      gridlines.push(plotOffsetY + (i / (numHorizontalGridlines - 1)) * plotHeight);
    }
  }

  // Compute prominent elevation labels
  const prominentLabels: ElevationProfileData["prominentLabels"] = [];
  if (options?.labelProminentElevations) {
    const minProminence = options.labelProminentElevations.minProminence ?? 30;

    for (let i = 0; i < clamped.length; i++) {
      const elevation = clamped[i];

      let minLeft = elevation;
      let hasHigherLeft = false;
      for (let j = i - 1; j >= 0; j--) {
        if (clamped[j] >= elevation) {
          hasHigherLeft = true;
          break;
        }
        if (clamped[j] < minLeft) minLeft = clamped[j];
      }

      let minRight = elevation;
      let hasHigherRight = false;
      for (let j = i + 1; j < clamped.length; j++) {
        if (clamped[j] > elevation) {
          hasHigherRight = true;
          break;
        }
        if (clamped[j] < minRight) minRight = clamped[j];
      }

      let prominence = 0;
      if (hasHigherLeft && hasHigherRight) {
        prominence = elevation - Math.max(minLeft, minRight);
      } else if (hasHigherLeft) {
        prominence = elevation - minLeft;
      } else if (hasHigherRight) {
        prominence = elevation - minRight;
      } else {
        prominence = Infinity;
      }

      if (prominence >= minProminence) {
        let x = allPoints[i].x;
        let anchor: "start" | "middle" | "end" = "middle";
        if (x < 25) {
          x = 0;
          anchor = "start";
        } else if (x > svgWidth - 25) {
          x = svgWidth;
          anchor = "end";
        }
        prominentLabels.push({
          elevation: Math.round(elevation),
          x,
          y: allPoints[i].y - 5,
          anchor,
        });
      }
    }
  }

  // Compute stage marker positions
  const stageMarkerPositions: ElevationProfileData["stageMarkerPositions"] = [];
  if (options?.stageMarkers) {
    for (const [i, marker] of options.stageMarkers.entries()) {
      const x = (marker.distance / maxDistance) * plotWidth + padding;
      const xNext =
        ((options.stageMarkers[i + 1]?.distance || maxDistance) / maxDistance) *
          plotWidth +
        padding;
      const elevIdx = combinedDistance.findIndex((v) => v >= marker.distance);
      const elevationY = allPoints[elevIdx >= 0 ? elevIdx : 0].y;
      stageMarkerPositions.push({
        x,
        xNext,
        elevationY,
        label: marker.label,
      });
    }
  }

  return {
    profileSegments,
    segmentPaths,
    allPoints,
    svgWidth,
    svgHeight,
    plotOffsetY,
    plotWidth,
    plotHeight,
    maxElevation,
    minElevation,
    maxElevationIndex,
    maxElevationPoint,
    maxElevationTrianglePoints,
    gridlines,
    prominentLabels,
    stageMarkerPositions,
    keyElevations: {
      start: Math.round(clamped[0]),
      peak: Math.round(Math.max(...clamped)),
      end: Math.round(clamped[clamped.length - 1]),
    },
    gradientStartColor,
    gradientEndColor,
    accentColor,
  };
}
