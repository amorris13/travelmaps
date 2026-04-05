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
  mapTileUrl?: string; // Optional pre-computed URL
}

export function PosterMap(props: PosterMapProps) {
  const isServer = typeof window === "undefined";
  if (isServer) {
    return <PosterMapInternal {...props} isServer={true} />;
  }
  return <PosterMapClient {...props} />;
}

function PosterMapClient(props: PosterMapProps) {
  const [mapImageUrlClient, setMapImageUrlClient] = React.useState<string | null>(null);
  const [labelPlacements, setLabelPlacements] = React.useState<LabelPlacementResult | null>(null);

  return <PosterMapInternal
    {...props}
    mapImageUrlClient={mapImageUrlClient}
    setMapImageUrlClient={setMapImageUrlClient}
    labelPlacements={labelPlacements}
    setLabelPlacements={setLabelPlacements}
    isServer={false}
  />;
}

function PosterMapInternal({
  stages,
  additionalLocations = [],
  accentColor,
  mapStyle,
  width,
  height,
  mapTileUrl: passedMapTileUrl,
  mapImageUrlClient,
  setMapImageUrlClient,
  labelPlacements,
  setLabelPlacements,
  isServer
}: any) {

  const baseMapData = (isServer ? (f: any) => f() : React.useMemo)(() => {
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

  const runLabelAlgorithm = () => {
    if (!baseMapData) return null;
    return calculateBestLabelPositions(
      baseMapData.labelPoints,
      32,
      14,
      baseMapData.shapesToAvoid,
      baseMapData.sidePx,
      baseMapData.sidePx
    );
  };

  if (!isServer) {
    React.useEffect(() => {
      if (!baseMapData) return;
      const placements = runLabelAlgorithm();
      setLabelPlacements(placements);
    }, [baseMapData]);

    React.useEffect(() => {
      if (!baseMapData || passedMapTileUrl) return;
      const { expandedBbox } = baseMapData;
      const params = new URLSearchParams({
        x: expandedBbox.x.toString(),
        y: expandedBbox.y.toString(),
        w: expandedBbox.width.toString(),
        h: expandedBbox.height.toString(),
        side: baseMapData.sidePx.toString(),
        ...(mapStyle ? { style: mapStyle } : {}),
      });
      setMapImageUrlClient(`/api/map-tile?${params}`);
    }, [baseMapData, mapStyle, passedMapTileUrl]);
  }

  if (!baseMapData) return null;

  const mapImageUrl = passedMapTileUrl || mapImageUrlClient;
  const finalLabelPlacements = isServer ? runLabelAlgorithm() : labelPlacements;

  return (
    <div
      style={{
        display: "flex",
        width: `${width}px`,
        height: `${height}px`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {mapImageUrl && (
        <img
          src={mapImageUrl}
          style={{
            display: "flex",
            position: "absolute",
            left: `${(width - baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)) / 2}px`,
            top: "0px",
            width: `${baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)}px`,
            height: `${baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)}px`,
            objectFit: "contain",
          }}
        />
      )}

      {/* SVG Overlay for Route Lines - Works on server too if we avoid React.Fragment */}
      <svg
        width={width}
        height={height}
        style={{ display: "flex", position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <g transform={`translate(${(width - baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)) / 2}, 0) scale(${Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)})`}>
          {baseMapData.paths.map((d: any, i: number) => (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={d}
                fill="none"
                stroke={accentColor}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeDasharray="6 6"
                strokeLinecap="round"
              />
            </g>
          ))}
          {baseMapData.waypoints.map((wp: any, i: number) => (
            <circle
              key={i}
              cx={wp.point.x}
              cy={wp.point.y}
              r={5}
              fill={accentColor}
            />
          ))}
        </g>
      </svg>

      <div
        style={{
          display: "flex",
          position: "absolute",
          left: `${(width - baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)) / 2}px`,
          top: "0px",
          width: `${baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)}px`,
          height: `${baseMapData.sidePx * Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx)}px`,
          pointerEvents: "none",
        }}
      >
        {(finalLabelPlacements?.result || []).map((lp: any, i: number) => {
          const scale = Math.min(width / baseMapData.sidePx, height / baseMapData.sidePx);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                position: "absolute",
                left: `${lp.offsetPoint.x * scale}px`,
                top: `${lp.offsetPoint.y * scale}px`,
                color: accentColor,
                fontFamily: "Helvetica",
                fontSize: "14px",
                fontWeight: 400,
                whiteSpace: "nowrap",
                textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
              }}
            >
              {lp.label.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
