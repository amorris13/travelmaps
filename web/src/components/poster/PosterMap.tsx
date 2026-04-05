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
import { calculateBestLabelPositions, type LabelPlacementResult } from "@lib/labels";
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
  const [labelPlacements, setLabelPlacements] = useState<LabelPlacementResult | null>(null);

  const mapTransformData = useMemo(() => {
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

    return { paths, expandedBbox, sidePx, transform };
  }, [
    // Use stable identifiers for polylines and coordinates to avoid unnecessary re-computes
    // when labels change.
    stages.length,
    stages.map((s) => s.polyline).join("|"),
    additionalLocations.map((l) => `${l.lat},${l.lng}`).join("|"),
    width,
    height,
  ]);

  const mapMetadata = useMemo(() => {
    if (!mapTransformData) return null;
    const { transform, paths, sidePx } = mapTransformData;

    // Compute waypoint positions
    const waypoints: { point: SimplePoint; label: string }[] = [];
    for (const stage of stages) {
      if (!stage.polyline) continue;
      const decoded = decodePolyline(stage.polyline);
      if (decoded.length === 0) continue;

      // Start point (first stage or if discontinuous with previous)
      if ((stage === stages[0] || stage.isContinuousWithPrev === false) && stage.startLabel) {
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

    return { waypoints, shapesToAvoid, labelPoints, sidePx };
  }, [mapTransformData, stages, additionalLocations]);

  // Debounce label placement algorithm
  useEffect(() => {
    if (!mapMetadata) {
      setLabelPlacements(null);
      return;
    }

    const runAlgorithm = () => {
      const placements = calculateBestLabelPositions(
        mapMetadata.labelPoints,
        32,
        14, // labelFontSizePx matching the render font size
        mapMetadata.shapesToAvoid,
        mapMetadata.sidePx,
        mapMetadata.sidePx
      );
      setLabelPlacements(placements);
    };

    // If we don't have placements yet, run immediately to avoid a flash of missing labels
    // and to speed up tests. Otherwise, debounce to avoid excessive calculations during config changes.
    if (!labelPlacements) {
      runAlgorithm();
      return;
    }

    const timeoutId = setTimeout(runAlgorithm, 500);
    return () => clearTimeout(timeoutId);
  }, [mapMetadata]);

  // Fetch map tile
  useEffect(() => {
    if (!mapTransformData) return;
    const { expandedBbox, sidePx } = mapTransformData;
    const params = new URLSearchParams({
      x: expandedBbox.x.toString(),
      y: expandedBbox.y.toString(),
      w: expandedBbox.width.toString(),
      h: expandedBbox.height.toString(),
      side: sidePx.toString(),
      ...(mapStyle ? { style: mapStyle } : {}),
    });
    setMapImageUrl(`/api/map-tile?${params}`);
  }, [mapTransformData, mapStyle]);

  if (!mapTransformData || !mapMetadata) {
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

  const { paths, sidePx } = mapTransformData;
  const { waypoints } = mapMetadata;
  const markerRadius = 5;
  const labelFontSize = 14;

  // Scale factor to fit map into the allocated width/height
  const scale = Math.min(width / sidePx, height / sidePx);
  const offsetX = (width - sidePx * scale) / 2;
  const offsetY = 0;

  const filterId = "mapTextWhiteOutline";

  return (
    <g transform={`translate(0, ${y})`}>
      {/* SVG filter for white outline behind text labels */}
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
        {labelPlacements?.result.map((lp, i) => (
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
  );
}
