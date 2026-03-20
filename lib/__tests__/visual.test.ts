/**
 * Visual tests that generate example SVG and PNG files for manual review.
 *
 * These tests produce output in lib/__tests__/visual-output/ so that
 * visual changes to the rendering pipeline can be easily verified.
 *
 * Each test:
 *  1. Builds an SVG using svgdom + @svgdotjs/svg.js (same stack as generate_svg.ts)
 *  2. Writes the SVG to disk
 *  3. Converts to PNG via sharp
 *  4. Snapshot-tests the SVG content so regressions are caught automatically
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createSVGWindow } from "svgdom";
import * as SVG from "@svgdotjs/svg.js";
import "@svgdotjs/svg.filter.js";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import pretty from "pretty";
import polyline from "@mapbox/polyline";
import simplify from "simplify-js";
import type { Shape } from "svg-intersections";
import { shape } from "svg-intersections";

import { calculateBestLabelPositions } from "../labels";
import { computeElevationProfile } from "../elevation";
import { ACCENT_COLOR, SIDE_PX, LABEL_FONT_SIZE_PX, MARKER_RADIUS } from "../constants";

import {
  seAsiaTrip,
  ukTrip,
  europeTrip,
  hikingTrip,
  homeTrip,
  australiaTrip,
  allTrips,
  sampleElevationData,
} from "./visual-fixtures";

import type { Trip, Stage, LatLng, RegionBounds, TripBounds, SimplePoint, LabelPoint } from "../types";

// ─── Output directory ───────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(import.meta.dirname, "visual-output");

// ─── Local helpers (mirrors generate_svg.ts internal functions) ─────────────

const EXPORT_PRECISION = 3;

function round(n: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

// Extend SVG.Point with .round() as generate_svg.ts does
SVG.extend(SVG.Point, {
  round: function (this: SVG.Point, precision: number): SVG.Point {
    this.x = round(this.x, precision);
    this.y = round(this.y, precision);
    return this;
  },
});

// Extend SVG.Element with .at() and .centerAt()
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

function toMercator(latlng: LatLng): SVG.Point {
  const x = latlng.lng / 180;
  const rad = latlng.lat * (Math.PI / 180);
  const y = Math.log(Math.tan(rad / 2 + Math.PI / 4)) / Math.PI;
  return new SVG.Point(x, -y);
}

function shiftLatLng(latlng: LatLng, lngShift: number): LatLng {
  return { lat: latlng.lat, lng: latlng.lng + lngShift };
}

function decodePolyline(encoded: string): LatLng[] {
  return polyline.decode(encoded).map((p) => ({ lng: p[1], lat: p[0] }));
}

function latlngToMercatorBbox(bounds: RegionBounds | TripBounds): SVG.Box {
  const tl = toMercator({ lng: bounds.west, lat: bounds.north });
  const br = toMercator({ lng: bounds.east, lat: bounds.south });
  return new SVG.PointArray([
    [tl.x, tl.y],
    [br.x, br.y],
  ]).bbox();
}

function computeTripBounds(trip: Trip, allowWrap = false): TripBounds {
  if (!trip.stages || trip.stages.length === 0) {
    return { west: 0, east: 0, south: 0, north: 0 };
  }
  const geocoded = trip.stages.filter((s) => s.endLocation?.latlng);
  if (geocoded.length === 0) return { west: 0, east: 0, south: 0, north: 0 };

  let lngShift = 0;
  const lngs = [geocoded[0].endLocation.latlng!.lng];
  if (allowWrap) geocoded[0].lngShift = 0;

  for (let i = 1; i < geocoded.length; i++) {
    const curr = geocoded[i];
    const prev = geocoded[i - 1];
    if (allowWrap) {
      const diff = curr.endLocation.latlng!.lng - prev.endLocation.latlng!.lng;
      if (diff < -180) lngShift += 360;
      else if (diff > 180) lngShift -= 360;
      curr.lngShift = lngShift;
    }
    lngs.push(curr.endLocation.latlng!.lng + lngShift);
  }

  const lats = geocoded.map((s) => s.endLocation.latlng!.lat);
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function distanceBetweenPoints(p1: SVG.Point, p2: SVG.Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function arcPathBetweenPoints(p1: SVG.Point, p2: SVG.Point): SVG.PathArray {
  const dist = distanceBetweenPoints(p1, p2);
  const r = Math.max(round(dist * 1.3, EXPORT_PRECISION), 0.1);
  return new SVG.PathArray([
    ["M", p1.x, p1.y],
    ["A", r, r, 0, 0, 1, p2.x, p2.y],
  ]);
}

function pathFromPolyline(
  decoded: LatLng[],
  transform: SVG.Matrix,
  lngShift = 0
): SVG.PathArray {
  if (!decoded || decoded.length === 0) return new SVG.PathArray();

  if (decoded.length === 2) {
    if (Math.abs(decoded[0].lng - decoded[1].lng) > 180) {
      const dir = Math.sign(decoded[0].lng - decoded[1].lng);
      const path = new SVG.PathArray(["M", "0", "0"]);
      const copy = decoded.map((ll) => ({ ...ll }));
      copy[1].lng += dir * 360;

      const t1 = copy.map((ll) =>
        toMercator(shiftLatLng(ll, lngShift)).transform(transform).round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(t1[0], t1[1]));

      const t2 = copy.map((ll) =>
        toMercator(shiftLatLng(ll, lngShift - dir * 360))
          .transform(transform)
          .round(EXPORT_PRECISION)
      );
      path.push(...arcPathBetweenPoints(t2[0], t2[1]));
      return path;
    } else {
      const transformed = decoded.map((ll) =>
        toMercator(shiftLatLng(ll, lngShift)).transform(transform).round(EXPORT_PRECISION)
      );
      return arcPathBetweenPoints(transformed[0], transformed[1]);
    }
  } else {
    const unwrapped = decoded.map((ll) => ({ ...ll }));
    for (let i = 1; i < unwrapped.length; i++) {
      const diff = unwrapped[i].lng - unwrapped[i - 1].lng;
      if (diff > 180) unwrapped[i].lng -= 360;
      else if (diff < -180) unwrapped[i].lng += 360;
    }
    const transformed = unwrapped.map((ll) =>
      toMercator(shiftLatLng(ll, lngShift)).transform(transform).round(EXPORT_PRECISION)
    );
    const simplified = simplify(transformed, 0.5, false);
    const cmds: SVG.PathCommand[] = simplified.map((p) => ["L", p.x, p.y]);
    cmds[0][0] = "M";
    return new SVG.PathArray(cmds);
  }
}

/** Apply standard map styles to a canvas (mirrors addCanvasStyles in generate_svg.ts) */
function addCanvasStyles(canvas: SVG.Svg): { markerRadius: number; labelFontSizePx: number } {
  const color = ACCENT_COLOR;
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
  canvas.style().rule(".flying", { "stroke-dasharray": "2 8" });
  canvas.style().rule(".ferry", { "stroke-dasharray": "2 12" });
  canvas.style().rule(".boat", { "stroke-dasharray": "2 12" });
  const markerRadius = MARKER_RADIUS;
  canvas.style().rule(".stage", { r: markerRadius, fill: color });
  canvas.style().rule(".home", { fill: color });
  canvas.style().rule(".partialAttendance", { opacity: 0.5 });
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
  const labelFontSizePx = LABEL_FONT_SIZE_PX;
  canvas.style().rule(".label", {
    fontFamily: "Helvetica",
    fontSize: labelFontSizePx + "px",
    fill: color,
    filter: "url(#whiteOutlineEffect)",
  });
  canvas.style().rule(".labelRect", { display: "none" });
  canvas.style().rule(".elevationMarker", { fill: color });
  return { markerRadius, labelFontSizePx };
}

/** Generate a trip SVG, returning SVG string */
function generateTripSvg(trip: Trip): string {
  const tripBounds = computeTripBounds(trip, true);
  const bbox = latlngToMercatorBbox(tripBounds);
  const maxSize = Math.max(bbox.width, bbox.height);
  const scaleX = bbox.width === 0 ? 1 : maxSize / bbox.width;
  const scaleY = bbox.height === 0 ? 1 : maxSize / bbox.height;

  const squareBbox = bbox.transform(
    new SVG.Matrix().scale(scaleX, scaleY, bbox.cx, bbox.cy)
  );
  const expandedBbox = squareBbox.transform(
    new SVG.Matrix().scale(1.3, squareBbox.cx, squareBbox.cy)
  );

  const sidePx = SIDE_PX;
  const transformScale = Math.min(
    expandedBbox.width === 0 ? 1 : sidePx / expandedBbox.width,
    expandedBbox.height === 0 ? 1 : sidePx / expandedBbox.height
  );

  const transform = new SVG.Matrix()
    .translate(-expandedBbox.cx, -expandedBbox.cy)
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

  const shapes: Shape[] = [];
  const labelPoints: LabelPoint[] = [];

  // Draw polylines
  for (const stage of trip.stages) {
    if (!stage.polyline || stage.hidePolyline) continue;
    const decoded = decodePolyline(stage.polyline);
    const pathArray = pathFromPolyline(decoded, transform, stage.lngShift);
    if (pathArray.length > 0) {
      canvas.path(pathArray).addClass("lineBackground");
      canvas
        .path(pathArray)
        .addClass("line")
        .addClass(stage.mode ?? "unknown")
        .maskWith(markerMask);
      shapes.push(shape("path", { d: pathArray.toString() }));
    }
  }

  // Draw markers
  for (const stage of trip.stages) {
    if (!stage.endLocation?.latlng) continue;
    const point = toMercator(
      shiftLatLng(stage.endLocation.latlng, stage.lngShift || 0)
    ).transform(transform);
    const marker = canvas.circle().radius(markerRadius).cx(point.x).cy(point.y);
    markerMask.add(marker.clone().fill("black"));
    marker.addClass("stage");
    shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius }));

    if (!stage.hideLabel) {
      labelPoints.push({
        name: stage.endLocation.name,
        point: { x: point.x, y: point.y },
      });
    }
  }

  // Place labels
  const bestPlacement = calculateBestLabelPositions(
    labelPoints,
    32,
    labelFontSizePx,
    shapes,
    sidePx,
    sidePx
  );

  for (const lp of bestPlacement.result) {
    canvas
      .rect(lp.labelRect.width, lp.labelRect.height)
      .x(lp.labelRect.x)
      .y(lp.labelRect.y)
      .opacity(0.2)
      .fill(lp.intersects ? "red" : "green")
      .addClass("labelRect");
    canvas
      .text(lp.label.name)
      .x(lp.offsetPoint.x)
      .y(lp.offsetPoint.y)
      .addClass("label");
  }

  return pretty(canvas.svg());
}

/** Generate a region overview SVG */
function generateRegionSvg(
  regionName: string,
  regionBounds: RegionBounds,
  trips: Trip[]
): string {
  const bbox = latlngToMercatorBbox(regionBounds);
  const maxDim = Math.max(bbox.width, bbox.height);
  const baseScale = maxDim === 0 ? 1 : SIDE_PX / maxDim;
  const scale = baseScale * (regionBounds.scale || 1);
  const widthPx = bbox.width * scale;
  const heightPx = bbox.height * scale;

  const transform = new SVG.Matrix()
    .translate(-bbox.cx, -bbox.cy)
    .lmultiply(new SVG.Matrix().scale(scale))
    .lmultiply(new SVG.Matrix().translate(widthPx / 2, heightPx / 2));

  const window = createSVGWindow();
  const document = window.document;
  SVG.registerWindow(window, document);
  const canvas = SVG.SVG(document.documentElement) as SVG.Svg;
  canvas.viewbox(0, 0, widthPx, heightPx);

  const { markerRadius, labelFontSizePx } = addCanvasStyles(canvas);
  const shapes: Shape[] = [];
  const filteredTrips = trips.filter((t) => !t.hideOnOverview);

  for (const trip of filteredTrips) {
    if (!trip.stages || trip.stages.length === 0) continue;

    if (trip.stages.length === 1) {
      const stage = trip.stages[0];
      if (!stage.endLocation?.latlng) continue;
      const point = toMercator(stage.endLocation.latlng).transform(transform);
      if (trip.isHome) {
        canvas
          .rect()
          .size(2 * markerRadius, 2 * markerRadius)
          .cx(point.x)
          .cy(point.y)
          .addClass("home");
      } else {
        canvas.circle().radius(markerRadius).cx(point.x).cy(point.y).addClass("stage");
      }
      shapes.push(shape("circle", { cx: point.x, cy: point.y, r: markerRadius }));
    } else {
      const pathArray = new SVG.PathArray();
      for (const stage of trip.stages) {
        if (!stage.endLocation?.latlng) continue;
        const point = toMercator(stage.endLocation.latlng).transform(transform);
        if (!stage.polyline || stage.hidePolyline) {
          pathArray.push(["M", point.x, point.y]);
          continue;
        }
        const decoded = decodePolyline(stage.polyline);
        const p = pathFromPolyline(decoded, transform);
        if (pathArray.length > 0 && p.length > 0 && p[0][0] === "M") {
          p.shift();
        }
        if (p.length > 0) {
          if (pathArray.length === 0 && p[0][0] !== "M") p[0][0] = "M";
          pathArray.push(...p);
        }
      }
      if (pathArray.length > 0) {
        canvas.path(pathArray).addClass("lineBackground");
        canvas.path(pathArray).addClass("line");
        shapes.push(shape("path", { d: pathArray.toString() }));
      }
    }
  }

  // Labels
  const labelPoints: LabelPoint[] = filteredTrips
    .filter((t) => !t.hideLabel)
    .map((trip) => {
      const tb = computeTripBounds(trip);
      const tbBox = latlngToMercatorBbox(tb).transform(transform);
      return { name: trip.name, point: { x: tbBox.cx, y: tbBox.cy } };
    });

  const bestPlacement = calculateBestLabelPositions(
    labelPoints,
    64,
    labelFontSizePx,
    shapes,
    widthPx,
    heightPx
  );

  for (const lp of bestPlacement.result) {
    canvas
      .rect(lp.labelRect.width, lp.labelRect.height)
      .x(lp.labelRect.x)
      .y(lp.labelRect.y)
      .opacity(0.2)
      .fill(lp.intersects ? "red" : "green")
      .addClass("labelRect");
    canvas
      .text(lp.label.name)
      .x(lp.offsetPoint.x)
      .y(lp.offsetPoint.y)
      .addClass("label");
  }

  return pretty(canvas.svg());
}

/** Generate an elevation profile SVG using the shared lib function */
function generateElevationSvg(
  elevationData: number[],
  distanceData: number[],
  plotWidth: number,
  plotHeight: number,
  options?: Parameters<typeof computeElevationProfile>[4]
): string {
  const data = computeElevationProfile(
    elevationData,
    distanceData,
    plotWidth,
    plotHeight,
    options
  );

  const window = createSVGWindow();
  const document = window.document;
  SVG.registerWindow(window, document);
  const canvas = SVG.SVG(document.documentElement) as SVG.Svg;
  canvas.size(data.svgWidth, data.svgHeight);

  if (data.profilePoints.length === 0) return canvas.svg();

  // Gradient fill
  const gradient = canvas.gradient("linear", (add) => {
    add.stop({ offset: 0, color: data.gradientStartColor, opacity: 1 });
    add.stop({ offset: 1, color: data.gradientEndColor, opacity: 1 });
  });
  gradient.from(0, 0).to(0, 1);

  // Profile path
  const pathString = data.profilePoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
    .join(" ");

  // Fill area
  const last = data.profilePoints[data.profilePoints.length - 1];
  const first = data.profilePoints[0];
  const fillPath = `${pathString} L ${last.x} ${data.plotOffsetY + data.plotHeight} L ${first.x} ${data.plotOffsetY + data.plotHeight} Z`;
  canvas.path(fillPath).fill(gradient).stroke("none");

  // Stroke
  canvas.path(pathString).fill("none").stroke({
    color: data.accentColor,
    width: 2,
    linecap: "round",
    linejoin: "round",
  });

  // Max elevation triangle
  const mp = data.maxElevationPoint;
  const sz = 10;
  const triPoints = [
    [mp.x, mp.y - sz * (Math.sqrt(3) / 3)],
    [mp.x - sz / 2, mp.y + sz * (Math.sqrt(3) / 6)],
    [mp.x + sz / 2, mp.y + sz * (Math.sqrt(3) / 6)],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  canvas
    .polygon(triPoints)
    .fill(data.accentColor)
    .stroke({ color: "white", width: 2, linejoin: "round" });

  // Label style
  canvas.style().rule(".label", {
    fontFamily: "Helvetica Neue, sans-serif",
    fontSize: "16px",
    fontWeight: 300,
    "letter-spacing": "0.05em",
    "dominant-baseline": "alphabetical",
  });

  // Prominent elevation labels
  for (const label of data.prominentLabels) {
    canvas
      .text(`${label.elevation}m`)
      .amove(label.x, label.y)
      .addClass("label")
      .font({ anchor: label.anchor });
  }

  // Stage markers
  const color = "#808080";
  for (const marker of data.stageMarkerPositions) {
    const svgY = data.plotOffsetY + data.plotHeight;
    canvas.line(marker.x, svgY, marker.x, svgY + 5).stroke({ color, width: 1 });
    canvas
      .line(marker.x, svgY, marker.x, marker.elevationY)
      .stroke({ color, width: 1, dasharray: "2 4" });
    canvas
      .text(marker.label)
      .amove((marker.x + marker.xNext) / 2, svgY + 15)
      .addClass("label")
      .font({ anchor: "middle" });
  }

  // Key elevations
  if (options?.showKeyElevations) {
    const keyY = data.plotOffsetY + data.plotHeight + 20;
    canvas
      .text(`${data.keyElevations.start}m`)
      .amove(5, keyY)
      .addClass("label")
      .font({ anchor: "start" });
    canvas
      .text(`⏶ ${data.keyElevations.peak}m`)
      .amove(plotWidth / 2, keyY)
      .addClass("label")
      .font({ anchor: "middle" });
    canvas
      .text(`${data.keyElevations.end}m`)
      .amove(plotWidth - 5, keyY)
      .addClass("label")
      .font({ anchor: "end" });
  }

  return pretty(canvas.svg());
}

// ─── Write helpers ──────────────────────────────────────────────────────────

async function writeSvg(name: string, svgContent: string): Promise<string> {
  const svgPath = path.join(OUTPUT_DIR, `${name}.svg`);
  await fs.writeFile(svgPath, svgContent);
  return svgPath;
}

async function svgToPng(svgContent: string, name: string): Promise<string> {
  const pngPath = path.join(OUTPUT_DIR, `${name}.png`);
  const pngBuffer = await sharp(Buffer.from(svgContent)).png().toBuffer();
  await fs.writeFile(pngPath, pngBuffer);
  return pngPath;
}

/**
 * Normalize SVG for snapshot comparison by replacing auto-incrementing IDs
 * (e.g. SvgjsLinearGradient1035) with stable placeholders.
 */
function normalizeSvgForSnapshot(svg: string): string {
  const idMap = new Map<string, string>();
  let counter = 0;
  return svg.replace(/Svgjs[A-Za-z]+\d+/g, (match) => {
    if (!idMap.has(match)) {
      const prefix = match.replace(/\d+$/, "");
      idMap.set(match, `${prefix}STABLE_${counter++}`);
    }
    return idMap.get(match)!;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
});

describe("visual: trip SVGs", () => {
  it("generates SE Asia trip SVG and PNG", async () => {
    const svg = generateTripSvg(seAsiaTrip);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Bangkok");
    expect(svg).toContain("Chiang Mai");
    expect(svg).toContain("Luang Prabang");

    await writeSvg("trip-se-asia", svg);
    await svgToPng(svg, "trip-se-asia");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates UK Road Trip SVG and PNG", async () => {
    const svg = generateTripSvg(ukTrip);
    expect(svg).toContain("<svg");
    expect(svg).toContain("London");
    expect(svg).toContain("Oxford");
    expect(svg).toContain("Bath");
    expect(svg).toContain("Bristol");

    await writeSvg("trip-uk", svg);
    await svgToPng(svg, "trip-uk");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates Europe trip SVG and PNG", async () => {
    const svg = generateTripSvg(europeTrip);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Paris");
    expect(svg).toContain("Amsterdam");
    expect(svg).toContain("Berlin");
    expect(svg).toContain("Prague");

    await writeSvg("trip-europe", svg);
    await svgToPng(svg, "trip-europe");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates hiking trip with strava data SVG and PNG", async () => {
    const svg = generateTripSvg(hikingTrip);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Keswick");
    expect(svg).toContain("Catbells Summit");
    expect(svg).toContain("Buttermere");

    await writeSvg("trip-hiking", svg);
    await svgToPng(svg, "trip-hiking");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });
});

describe("visual: region overview SVGs", () => {
  it("generates Europe overview SVG and PNG", async () => {
    const europeBounds: RegionBounds = {
      north: 63.33,
      east: 39.02,
      south: 27.35,
      west: -15.02,
    };
    const europeRegionTrips = [homeTrip, ukTrip, europeTrip];
    const svg = generateRegionSvg("Europe", europeBounds, europeRegionTrips);
    expect(svg).toContain("<svg");

    await writeSvg("region-europe", svg);
    await svgToPng(svg, "region-europe");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates UK overview SVG and PNG", async () => {
    const ukBounds: RegionBounds = {
      north: 61,
      east: 2.4,
      south: 49.4,
      west: -12,
      scale: 0.625,
    };
    const svg = generateRegionSvg("UK", ukBounds, [homeTrip, ukTrip, hikingTrip]);
    expect(svg).toContain("<svg");

    await writeSvg("region-uk", svg);
    await svgToPng(svg, "region-uk");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates World overview SVG and PNG", async () => {
    const worldBounds: RegionBounds = {
      north: 75,
      east: 180,
      south: -60,
      west: -180,
    };
    const svg = generateRegionSvg("World", worldBounds, allTrips);
    expect(svg).toContain("<svg");

    await writeSvg("region-world", svg);
    await svgToPng(svg, "region-world");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });
});

describe("visual: elevation profile SVGs", () => {
  it("generates single-stage elevation SVG and PNG", async () => {
    const { elevation, distance } = sampleElevationData;
    const stageElevation = elevation.slice(0, 22);
    const stageDistance = distance.slice(0, 22);

    const svg = generateElevationSvg(stageElevation, stageDistance, 600, 180, {
      horizontalGridlines: true,
      labelProminentElevations: { minProminence: 100 },
    });

    expect(svg).toContain("<svg");

    await writeSvg("elevation-single-stage", svg);
    await svgToPng(svg, "elevation-single-stage");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates multi-stage elevation SVG with stage markers and PNG", async () => {
    const { elevation, distance, stageMarkers } = sampleElevationData;

    const svg = generateElevationSvg(elevation, distance, 1200, 200, {
      stageMarkers,
      labelProminentElevations: { minProminence: 100 },
    });

    expect(svg).toContain("<svg");

    await writeSvg("elevation-multi-stage", svg);
    await svgToPng(svg, "elevation-multi-stage");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });

  it("generates elevation SVG with key elevations and PNG", async () => {
    const { elevation, distance } = sampleElevationData;

    const svg = generateElevationSvg(elevation, distance, 800, 200, {
      showKeyElevations: true,
      labelProminentElevations: { minProminence: 50 },
    });

    expect(svg).toContain("<svg");

    await writeSvg("elevation-key-elevations", svg);
    await svgToPng(svg, "elevation-key-elevations");

    expect(normalizeSvgForSnapshot(svg)).toMatchSnapshot();
  });
});
