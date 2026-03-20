"use client";

import { useMemo, useState, useEffect } from "react";
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
import { calculateBestLabelPositions } from "@lib/labels";
import { shape } from "svg-intersections";
import type { Shape } from "svg-intersections";

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
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);

  const mapData = useMemo(() => {
    const polylines = stages.map((s) => s.polyline).filter(Boolean);
    if (polylines.length === 0) return null;

    let bounds = computeBoundsFromPolylines(polylines);

    // Expand bounds to include additional locations
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

    // Compute route paths
    const paths = stages
      .map((stage) => {
        const decoded = decodePolyline(stage.polyline);
        return pathFromPolyline(decoded, transform);
      })
      .filter(Boolean);

    // Compute waypoint positions
    const waypoints: { point: SimplePoint; label: string }[] = [];
    for (const stage of stages) {
      if (!stage.polyline) continue;
      const decoded = decodePolyline(stage.polyline);
      if (decoded.length === 0) continue;

      // Start point (first stage only)
      if (stage === stages[0] && stage.startLabel) {
        const startMerc = toMercator(decoded[0]);
        const startPt = roundPoint(
          applyTransform(startMerc, transform),
          EXPORT_PRECISION
        );
        waypoints.push({ point: startPt, label: stage.startLabel });
      }

      // End point
      if (stage.endLabel) {
        const endMerc = toMercator(decoded[decoded.length - 1]);
        const endPt = roundPoint(
          applyTransform(endMerc, transform),
          EXPORT_PRECISION
        );
        waypoints.push({ point: endPt, label: stage.endLabel });
      }
    }

    // Additional locations
    for (const loc of additionalLocations) {
      const merc = toMercator({ lat: loc.lat, lng: loc.lng });
      const pt = roundPoint(applyTransform(merc, transform), EXPORT_PRECISION);
      waypoints.push({ point: pt, label: loc.name });
    }

    // Build shapes to avoid (route lines + waypoint markers)
    const shapesToAvoid: Shape[] = [];

    // Add route line shapes
    for (const d of paths) {
      if (d) {
        shapesToAvoid.push(shape("path", { d }));
      }
    }

    // Add waypoint marker shapes
    const markerR = 5;
    for (const wp of waypoints) {
      shapesToAvoid.push(
        shape("circle", { cx: wp.point.x, cy: wp.point.y, r: markerR })
      );
    }

    // Build label points for the placement algorithm
    const labelPoints: LabelPoint[] = waypoints
      .filter((wp) => wp.label)
      .map((wp) => ({
        name: wp.label,
        point: wp.point,
      }));

    // Run the full label placement algorithm
    const labelPlacements = calculateBestLabelPositions(
      labelPoints,
      32,
      14, // labelFontSizePx matching the render font size
      shapesToAvoid,
      sidePx,
      sidePx
    );

    return { paths, waypoints, expandedBbox, sidePx, labelPlacements };
  }, [stages, additionalLocations, width, height]);

  // Fetch map tile
  useEffect(() => {
    if (!mapData) return;
    const { expandedBbox } = mapData;
    const params = new URLSearchParams({
      x: expandedBbox.x.toString(),
      y: expandedBbox.y.toString(),
      w: expandedBbox.width.toString(),
      h: expandedBbox.height.toString(),
      side: mapData.sidePx.toString(),
      ...(mapStyle ? { style: mapStyle } : {}),
    });
    setMapImageUrl(`/api/map-tile?${params}`);
  }, [mapData, mapStyle]);

  if (!mapData) {
    return (
      <g transform={`translate(0, ${y})`}>
        <rect width={width} height={height} fill="#f0f0f0" />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill="#999"
          fontSize={14}
        >
          No route data
        </text>
      </g>
    );
  }

  const { paths, waypoints, sidePx, labelPlacements } = mapData;
  const markerRadius = 5;
  const labelFontSize = 14;

  // Scale factor to fit map into the allocated width/height
  const scale = Math.min(width / sidePx, height / sidePx);
  const offsetX = (width - sidePx * scale) / 2;
  const offsetY = 0;

  return (
    <g transform={`translate(0, ${y})`}>
      {/* Map background image */}
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

      {/* Route lines */}
      <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
        {/* White background stroke */}
        {paths.map((d, i) => (
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

        {/* Colored dashed route line */}
        {paths.map((d, i) => (
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

        {/* Waypoint markers (dots only) */}
        {waypoints.map((wp, i) => (
          <circle
            key={`wp-${i}`}
            cx={wp.point.x}
            cy={wp.point.y}
            r={markerRadius}
            fill={accentColor}
          />
        ))}

        {/* Labels placed by the collision-avoidance algorithm */}
        {labelPlacements.result.map((lp, i) => (
          <text
            key={`label-${i}`}
            x={lp.offsetPoint.x}
            y={lp.offsetPoint.y + labelFontSize}
            fill={accentColor}
            fontFamily="Helvetica, sans-serif"
            fontSize={labelFontSize}
          >
            {lp.label.name}
          </text>
        ))}
      </g>
    </g>
  );
}
