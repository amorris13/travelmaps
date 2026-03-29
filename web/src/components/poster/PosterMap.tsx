import type { StageConfig, SimplePoint, LabelPoint } from "@lib/types";
import {
  computeBoundsFromPolylines,
  computeMapTransform,
  decodePolyline,
  pathFromPolyline,
  toMercator,
  applyTransform,
  roundPoint,
} from "@lib/geo";
import { EXPORT_PRECISION, SIDE_PX } from "@lib/constants";
import { calculateBestLabelPositions, type LabelPlacementResult } from "@lib/labels";
import { shape } from "svg-intersections";
import type { Shape } from "svg-intersections";
import React from "react";

interface PosterMapProps {
  stages: StageConfig[];
  additionalLocations?: { name: string; lat: number; lng: number }[];
  accentColor: string;
  mapStyle?: string;
  y: number;
  width: number;
  height: number;
}

export function PosterMap({
  stages,
  additionalLocations = [],
  accentColor,
  mapStyle,
  y,
  width,
  height,
}: PosterMapProps) {
  const isServer = typeof window === "undefined";

  if (isServer) {
    const polylines = stages.map((s: any) => s.polyline).filter(Boolean);
    if (polylines.length === 0) return null;

    let bounds = computeBoundsFromPolylines(polylines);
    if (additionalLocations.length > 0) {
      let { west, east, south, north } = bounds;
      for (const loc of additionalLocations) {
        west = Math.min(west, loc.lng);
        east = Math.max(east, loc.lng);
        south = Math.min(south, loc.lat);
        north = Math.max(north, loc.lat);
      }
      bounds = { west, east, south, north };
    }

    const sidePx = Math.min(width, height);
    const { transform, expandedBbox } = computeMapTransform(bounds, sidePx);

    const paths = stages
      .map((stage: any) => {
        const decoded = decodePolyline(stage.polyline);
        return pathFromPolyline(decoded, transform);
      })
      .filter(Boolean);

    const waypoints: { point: SimplePoint; label: string }[] = [];
    for (const stage of stages) {
      if (!stage.polyline) continue;
      const decoded = decodePolyline(stage.polyline);
      if (decoded.length === 0) continue;
      if ((stage === stages[0] || stage.isContinuousWithPrev === false) && stage.startLabel) {
        const startMerc = toMercator(decoded[0]);
        const startPt = roundPoint(applyTransform(startMerc, transform), EXPORT_PRECISION);
        waypoints.push({ point: startPt, label: stage.startLabel });
      }
      if (stage.endLabel) {
        const endMerc = toMercator(decoded[decoded.length - 1]);
        const endPt = roundPoint(applyTransform(endMerc, transform), EXPORT_PRECISION);
        waypoints.push({ point: endPt, label: stage.endLabel });
      }
    }

    for (const loc of additionalLocations) {
      const merc = toMercator({ lat: loc.lat, lng: loc.lng });
      const pt = roundPoint(applyTransform(merc, transform), EXPORT_PRECISION);
      waypoints.push({ point: pt, label: loc.name });
    }

    const shapesToAvoid: Shape[] = [];
    for (const d of paths) {
      if (d) shapesToAvoid.push(shape("path", { d }));
    }
    const markerR = 5;
    for (const wp of waypoints) {
      shapesToAvoid.push(shape("circle", { cx: wp.point.x, cy: wp.point.y, r: markerR }));
    }

    const labelPoints: LabelPoint[] = waypoints
      .filter((wp) => wp.label)
      .map((wp) => ({ name: wp.label, point: wp.point }));

    const labelPlacements = calculateBestLabelPositions(
      labelPoints,
      32,
      14,
      shapesToAvoid,
      sidePx,
      sidePx
    );

    const params = new URLSearchParams({
      x: expandedBbox.x.toString(),
      y: expandedBbox.y.toString(),
      w: expandedBbox.width.toString(),
      h: expandedBbox.height.toString(),
      side: sidePx.toString(),
      ...(mapStyle ? { style: mapStyle } : {}),
    });
    const mapImageUrl = `/api/map-tile?${params}`;

    return (
      <PosterMapRender
        width={width}
        height={height}
        y={y}
        mapImageUrl={mapImageUrl}
        labelPlacements={labelPlacements}
        paths={paths}
        waypoints={waypoints}
        sidePx={sidePx}
        accentColor={accentColor}
      />
    );
  }

  return (
    <PosterMapClient
      stages={stages}
      additionalLocations={additionalLocations}
      accentColor={accentColor}
      mapStyle={mapStyle}
      y={y}
      width={width}
      height={height}
    />
  );
}

function PosterMapClient({
  stages,
  additionalLocations,
  accentColor,
  mapStyle,
  y,
  width,
  height,
}: any) {
  const [mapImageUrl, setMapImageUrl] = React.useState<string | null>(null);
  const [labelPlacements, setLabelPlacements] = React.useState<LabelPlacementResult | null>(null);

  const baseMapData = React.useMemo(() => {
    const polylines = stages.map((s: any) => s.polyline).filter(Boolean);
    if (polylines.length === 0) return null;

    let bounds = computeBoundsFromPolylines(polylines);
    if (additionalLocations.length > 0) {
      let { west, east, south, north } = bounds;
      for (const loc of additionalLocations) {
        west = Math.min(west, loc.lng);
        east = Math.max(east, loc.lng);
        south = Math.min(south, loc.lat);
        north = Math.max(north, loc.lat);
      }
      bounds = { west, east, south, north };
    }

    const sidePx = Math.min(width, height);
    const { transform, expandedBbox } = computeMapTransform(bounds, sidePx);

    const paths = stages
      .map((stage: any) => {
        const decoded = decodePolyline(stage.polyline);
        return pathFromPolyline(decoded, transform);
      })
      .filter(Boolean);

    const waypoints: { point: SimplePoint; label: string }[] = [];
    for (const stage of stages) {
      if (!stage.polyline) continue;
      const decoded = decodePolyline(stage.polyline);
      if (decoded.length === 0) continue;
      if ((stage === stages[0] || stage.isContinuousWithPrev === false) && stage.startLabel) {
        const startMerc = toMercator(decoded[0]);
        const startPt = roundPoint(applyTransform(startMerc, transform), EXPORT_PRECISION);
        waypoints.push({ point: startPt, label: stage.startLabel });
      }
      if (stage.endLabel) {
        const endMerc = toMercator(decoded[decoded.length - 1]);
        const endPt = roundPoint(applyTransform(endMerc, transform), EXPORT_PRECISION);
        waypoints.push({ point: endPt, label: stage.endLabel });
      }
    }

    for (const loc of additionalLocations) {
      const merc = toMercator({ lat: loc.lat, lng: loc.lng });
      const pt = roundPoint(applyTransform(merc, transform), EXPORT_PRECISION);
      waypoints.push({ point: pt, label: loc.name });
    }

    const shapesToAvoid: Shape[] = [];
    for (const d of paths) {
      if (d) shapesToAvoid.push(shape("path", { d }));
    }
    const markerR = 5;
    for (const wp of waypoints) {
      shapesToAvoid.push(shape("circle", { cx: wp.point.x, cy: wp.point.y, r: markerR }));
    }

    const labelPoints: LabelPoint[] = waypoints
      .filter((wp) => wp.label)
      .map((wp) => ({ name: wp.label, point: wp.point }));

    return { paths, waypoints, expandedBbox, sidePx, shapesToAvoid, labelPoints };
  }, [stages, additionalLocations, width, height]);

  React.useEffect(() => {
    if (!baseMapData) return;
    const placements = calculateBestLabelPositions(
      baseMapData.labelPoints,
      32,
      14,
      baseMapData.shapesToAvoid,
      baseMapData.sidePx,
      baseMapData.sidePx
    );
    setLabelPlacements(placements);
  }, [baseMapData]);

  React.useEffect(() => {
    if (!baseMapData) return;
    const { expandedBbox } = baseMapData;
    const params = new URLSearchParams({
      x: expandedBbox.x.toString(),
      y: expandedBbox.y.toString(),
      w: expandedBbox.width.toString(),
      h: expandedBbox.height.toString(),
      side: baseMapData.sidePx.toString(),
      ...(mapStyle ? { style: mapStyle } : {}),
    });
    setMapImageUrl(`/api/map-tile?${params}`);
  }, [baseMapData, mapStyle]);

  if (!baseMapData) return null;

  return (
    <PosterMapRender
      width={width}
      height={height}
      y={y}
      mapImageUrl={mapImageUrl}
      labelPlacements={labelPlacements}
      paths={baseMapData.paths}
      waypoints={baseMapData.waypoints}
      sidePx={baseMapData.sidePx}
      accentColor={accentColor}
    />
  );
}

function PosterMapRender({
  width,
  height,
  y,
  mapImageUrl,
  labelPlacements,
  paths,
  waypoints,
  sidePx,
  accentColor,
}: any) {
  const markerRadius = 5;
  const labelFontSize = 14;
  const scale = Math.min(width / sidePx, height / sidePx);
  const offsetX = (width - sidePx * scale) / 2;
  const offsetY = 0;
  const filterId = "mapTextWhiteOutline";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      <g transform={`translate(0, ${y})`}>
        <defs>
          <filter
            id={filterId}
            width="200%"
            height="200%"
            x="-50%"
            y="-50%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius="1"
              result="dilated"
            />
            <feColorMatrix
              in="dilated"
              type="matrix"
              values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"
              result="whiteOutline"
            />
            <feMerge>
              <feMergeNode in="whiteOutline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {mapImageUrl && (
          <image
            href={mapImageUrl}
            x={offsetX}
            y={offsetY}
            width={sidePx * scale}
            height={sidePx * scale}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
          {paths.map((d: any, i: number) => (
            <path
              key={`bg-${i}`}
              d={d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {paths.map((d: any, i: number) => (
            <path
              key={`route-${i}`}
              d={d}
              fill="none"
              stroke={accentColor}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          ))}

          {waypoints.map((wp: any, i: number) => (
            <circle
              key={`wp-${i}`}
              cx={wp.point.x}
              cy={wp.point.y}
              r={markerRadius}
              fill={accentColor}
            />
          ))}

          {labelPlacements?.result.map((lp: any, i: number) => (
            <text
              key={`label-${i}`}
              x={lp.offsetPoint.x}
              y={lp.offsetPoint.y + labelFontSize}
              fill={accentColor}
              fontFamily="Helvetica Neue, sans-serif"
              fontSize={labelFontSize}
              filter={`url(#${filterId})`}
              className="label"
            >
              {lp.label.name}
            </text>
          ))}
        </g>
      </g>
    </svg>
  );
}
