import simplify from "simplify-js";
import type { SimplePoint, StageConfig } from "./types.js";
import {
  ELEVATION_PADDING,
  KEY_ELEVATIONS_HEIGHT,
  STAGE_MARKERS_HEIGHT,
  PROMINENT_ELEVATION_LABELS_HEIGHT,
  ACCENT_COLOR,
} from "./constants.js";

export interface ElevationProfileOptions {
  stageMarkers?: { distance: number; label: string }[];
  horizontalGridlines?: boolean;
  labelProminentElevations?: {
    minProminence?: number;
  };
  showKeyElevations?: boolean;
  units?: "metric" | "imperial";
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
    label: string;
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
    startLabel: string;
    peakLabel: string;
    endLabel: string;
  };
  /** Gradient colors */
  gradientStartColor: string;
  gradientEndColor: string;
  /** Accent color */
  accentColor: string;
  /** Units used */
  units: "metric" | "imperial";
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
 * Parses a stream from Strava (either a comma-separated string or an array of numbers).
 */
export function parseStream(stream: string | number[] | undefined): number[] {
  if (!stream) return [];
  if (typeof stream === "string") {
    return stream.split(",").map(Number);
  }
  return stream;
}

/**
 * Higher-level helper to compute elevation profile data from StageConfig objects.
 * Handles segment preparation, continuity, and stage markers.
 */
export function computeElevationProfileFromStages(
  stages: StageConfig[],
  width: number,
  height: number,
  options: ElevationProfileOptions = {},
  accentColor: string = ACCENT_COLOR
): ElevationProfileData | null {
  // Prepare segments with continuity info
  const segments = stages.map((stage, i) => ({
    elevationStream: stage.elevationStream,
    distanceStream: stage.distanceStream,
    isContinuousWithNext: stages[i + 1]?.isContinuousWithPrev,
  }));

  // Find stage marker distances after gaps are added
  const rawTotalDistance = stages.reduce((acc, s) => {
    if (s.distanceStream.length > 0) {
      return acc + s.distanceStream[s.distanceStream.length - 1];
    }
    return acc;
  }, 0);
  const gapSize = rawTotalDistance * 0.01;

  // Recalculate markers correctly to match computeElevationProfile's internal cumulativeDistance
  const correctStageMarkers: { distance: number; label: string }[] = [];
  let currentCumulative = 0;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (stage.elevationStream.length === 0 || stage.distanceStream.length === 0)
      continue;

    correctStageMarkers.push({
      distance: currentCumulative,
      label: `${i + 1}`,
    });

    currentCumulative += stage.distanceStream[stage.distanceStream.length - 1];
    if (stages[i + 1] && !stages[i + 1].isContinuousWithPrev) {
      currentCumulative += gapSize;
    }
  }

  const padding = ELEVATION_PADDING;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2 - 30; // Leave room for labels

  return computeElevationProfile(
    segments,
    plotWidth,
    plotHeight,
    {
      ...options,
      stageMarkers:
        correctStageMarkers.length > 0 ? correctStageMarkers : undefined,
    },
    accentColor
  );
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
  const units = options?.units ?? "metric";
  const mToFt = 3.28084;
  const unitLabel = units === "imperial" ? "ft" : "m";

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
      keyElevations: {
        start: 0,
        peak: 0,
        end: 0,
        startLabel: "",
        peakLabel: "",
        endLabel: "",
      },
      gradientStartColor,
      gradientEndColor,
      accentColor,
      units,
    };
  }

  let plotOffsetY = padding;

  const clamped = combinedElevation.map((e) => Math.max(0, e));
  const maxElevation = Math.max(Math.max(...clamped), 200);
  const minElevation = 0;
  const elevationRange = maxElevation - minElevation;
  const maxDistance = combinedDistance[combinedDistance.length - 1];

  if (maxDistance <= 0) {
    const start = Math.round(clamped[0]);
    const peak = Math.round(maxElevation);
    const end = Math.round(clamped[clamped.length - 1]);
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
      keyElevations: {
        start,
        peak,
        end,
        startLabel: `${units === "imperial" ? Math.round(start * mToFt) : start}${unitLabel}`,
        peakLabel: `${units === "imperial" ? Math.round(peak * mToFt) : peak}${unitLabel}`,
        endLabel: `${units === "imperial" ? Math.round(end * mToFt) : end}${unitLabel}`,
      },
      gradientStartColor,
      gradientEndColor,
      accentColor,
      units,
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
        const val = Math.round(elevation);
        const displayVal = units === "imperial" ? Math.round(val * mToFt) : val;
        prominentLabels.push({
          elevation: val,
          label: `${displayVal}${unitLabel}`,
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

  const start = Math.round(clamped[0]);
  const peak = Math.round(Math.max(...clamped));
  const end = Math.round(clamped[clamped.length - 1]);

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
      start,
      peak,
      end,
      startLabel: `${units === "imperial" ? Math.round(start * mToFt) : start}${unitLabel}`,
      peakLabel: `${units === "imperial" ? Math.round(peak * mToFt) : peak}${unitLabel}`,
      endLabel: `${units === "imperial" ? Math.round(end * mToFt) : end}${unitLabel}`,
    },
    gradientStartColor,
    gradientEndColor,
    accentColor,
    units,
  };
}

/**
 * Renders the elevation profile data as an SVG string.
 * This can be used in both the web app (via dangerouslySetInnerHTML) and CLI.
 */
export function renderElevationProfileAsSvg(
  data: ElevationProfileData,
  options: {
    width: number;
    height: number;
    gradientId?: string;
    includeSvgTag?: boolean;
    viewBox?: string;
    x?: number;
    y?: number;
  }
): string {
  const {
    segmentPaths,
    maxElevationTrianglePoints,
    gridlines,
    prominentLabels,
    stageMarkerPositions,
    keyElevations,
    gradientStartColor,
    gradientEndColor,
    plotWidth,
    plotHeight,
    plotOffsetY,
    accentColor,
    svgWidth,
    svgHeight,
  } = data;

  const gradientId = options.gradientId || "elevation-gradient";
  const padding = ELEVATION_PADDING;

  let svg = "";

  if (options.includeSvgTag) {
    const viewBox = options.viewBox || `0 0 ${svgWidth} ${svgHeight}`;
    const x = options.x !== undefined ? ` x="${options.x}"` : "";
    const y = options.y !== undefined ? ` y="${options.y}"` : "";
    svg += `<svg width="${options.width}" height="${options.height}"${x}${y} viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
  }

  svg += `
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${gradientStartColor}" />
        <stop offset="100%" stop-color="${gradientEndColor}" />
      </linearGradient>
    </defs>

    <!-- Gridlines -->
    ${gridlines
      .map(
        (gy) => `
      <line x1="${padding}" y1="${gy}" x2="${plotWidth + padding}" y2="${gy}" stroke="#e0e0e0" stroke-width="1" />
    `
      )
      .join("")}

    <!-- Fill and Profile lines for each segment -->
    ${segmentPaths
      .map(
        (segment) => `
      <path d="${segment.fillD}" fill="url(#${gradientId})" stroke="none" />
      <path d="${segment.pathD}" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    `
      )
      .join("")}

    <!-- Max elevation triangle -->
    <polygon points="${maxElevationTrianglePoints}" fill="${accentColor}" stroke="white" stroke-width="2" stroke-linejoin="round" />

    <!-- Prominent elevation labels -->
    ${prominentLabels
      .map(
        (label) => `
      <text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" font-family="Helvetica Neue, sans-serif" font-size="16" font-weight="300" letter-spacing="0.05em" dominant-baseline="alphabetic">${label.label}</text>
    `
      )
      .join("")}

    <!-- Stage markers -->
    ${stageMarkerPositions
      .map(
        (marker) => `
      <line x1="${marker.x}" y1="${plotOffsetY + plotHeight}" x2="${marker.x}" y2="${plotOffsetY + plotHeight + 5}" stroke="#808080" stroke-width="1" />
      <line x1="${marker.x}" y1="${plotOffsetY + plotHeight}" x2="${marker.x}" y2="${marker.elevationY}" stroke="#808080" stroke-width="1" stroke-dasharray="2 4" />
      <text x="${(marker.x + marker.xNext) / 2}" y="${plotOffsetY + plotHeight + 15}" text-anchor="middle" font-family="Helvetica Neue, sans-serif" font-size="16" font-weight="300" letter-spacing="0.05em" dominant-baseline="alphabetic">${marker.label}</text>
    `
      )
      .join("")}
    ${
      stageMarkerPositions.length > 0
        ? `<line x1="${plotWidth + padding}" y1="${plotOffsetY + plotHeight}" x2="${plotWidth + padding}" y2="${plotOffsetY + plotHeight + 5}" stroke="#808080" stroke-width="1" />`
        : ""
    }

    <!-- Key elevations -->
    <text x="${padding}" y="${plotOffsetY + plotHeight + (stageMarkerPositions.length > 0 ? 15 : 0) + 20}" text-anchor="start" font-family="Helvetica Neue, sans-serif" font-size="16" font-weight="300" letter-spacing="0.05em" dominant-baseline="alphabetic">${keyElevations.startLabel}</text>
    <text x="${plotWidth / 2}" y="${plotOffsetY + plotHeight + (stageMarkerPositions.length > 0 ? 15 : 0) + 20}" text-anchor="middle" font-family="Helvetica Neue, sans-serif" font-size="16" font-weight="300" letter-spacing="0.05em" dominant-baseline="alphabetic">⏶ ${keyElevations.peakLabel}</text>
    <text x="${plotWidth - padding}" y="${plotOffsetY + plotHeight + (stageMarkerPositions.length > 0 ? 15 : 0) + 20}" text-anchor="end" font-family="Helvetica Neue, sans-serif" font-size="16" font-weight="300" letter-spacing="0.05em" dominant-baseline="alphabetic">${keyElevations.endLabel}</text>
  `;

  if (options.includeSvgTag) {
    svg += "</svg>";
  }

  return svg;
}
