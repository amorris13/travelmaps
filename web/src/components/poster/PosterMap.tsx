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
import { EXPORT_PRECISION } from "@lib/constants";
import { calculateBestLabelPositions, type LabelPlacementResult } from "@lib/labels";
import { shape } from "svg-intersections";
import type { Shape } from "svg-intersections";
import React from "react";

interface PosterMapProps {
  stages: StageConfig[];
  additionalLocations?: { name: string; lat: number; lng: number }[];
  accentColor: string;
  mapStyle?: string;
  width: number;
  height: number;
  mapTileUrl?: string;
}

export function PosterMap(props: PosterMapProps) {
  const isServer = typeof window === "undefined";

  if (isServer) {
    return <PosterMapServer {...props} />;
  }

  return <PosterMapClient {...props} />;
}

function PosterMapClient(props: PosterMapProps) {
  const [mapImageUrlClient, setMapImageUrlClient] = React.useState<string | null>(null);
  const [labelPlacements, setLabelPlacements] = React.useState<LabelPlacementResult | null>(null);

  const baseMapData = React.useMemo(() => {
    return computeBaseMapData(props);
  }, [props.stages, props.additionalLocations, props.width, props.height]);

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
    if (!baseMapData || props.mapTileUrl) return;
    const { expandedBbox } = baseMapData;
    const params = new URLSearchParams({
      x: expandedBbox.x.toString(),
      y: expandedBbox.y.toString(),
      w: expandedBbox.width.toString(),
      h: expandedBbox.height.toString(),
      side: baseMapData.sidePx.toString(),
      ...(props.mapStyle ? { style: props.mapStyle } : {}),
    });
    setMapImageUrlClient(`/api/map-tile?${params}`);
  }, [baseMapData, props.mapStyle, props.mapTileUrl]);

  if (!baseMapData) return <div style={{ display: "flex", width: `${props.width}px`, height: `${props.height}px` }} />;

  return (
    <PosterMapRender
      {...props}
      baseMapData={baseMapData}
      mapImageUrl={props.mapTileUrl || mapImageUrlClient}
      labelPlacements={labelPlacements}
      isServer={false}
    />
  );
}

function PosterMapServer(props: PosterMapProps) {
  const baseMapData = computeBaseMapData(props);
  if (!baseMapData) return <div style={{ display: "flex", width: `${props.width}px`, height: `${props.height}px` }} />;

  const labelPlacements = calculateBestLabelPositions(
    baseMapData.labelPoints,
    32,
    14,
    baseMapData.shapesToAvoid,
    baseMapData.sidePx,
    baseMapData.sidePx
  );

  return (
    <PosterMapRender
      {...props}
      baseMapData={baseMapData}
      mapImageUrl={props.mapTileUrl}
      labelPlacements={labelPlacements}
      isServer={true}
    />
  );
}

function computeBaseMapData({ stages, additionalLocations = [], width, height }: PosterMapProps) {
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
}

function PosterMapRender({
  width,
  height,
  accentColor,
  mapImageUrl,
  labelPlacements,
  baseMapData,
  isServer
}: any) {
  const mapSidePx = baseMapData.sidePx;
  const scale = Math.min(width / mapSidePx, height / mapSidePx);
  const offsetX = (width - mapSidePx * scale) / 2;

  if (isServer) {
    const graphicsSvg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(${offsetX}, 0) scale(${scale})">
          ${baseMapData.paths.map((d: string) => `
            <path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" />
            <path d="${d}" fill="none" stroke="${accentColor}" stroke-width="3" stroke-linejoin="round" stroke-dasharray="6 6" stroke-linecap="round" />
          `).join('')}
          ${baseMapData.waypoints.map((wp: any) => `<circle cx="${wp.point.x}" cy="${wp.point.y}" r="5" fill="${accentColor}" />`).join('')}
        </g>
      </svg>
    `.trim();
    const graphicsDataUri = `data:image/svg+xml;base64,${Buffer.from(graphicsSvg).toString('base64')}`;

    return (
      <div style={{ display: "flex", width: `${width}px`, height: `${height}px`, position: "relative", overflow: "hidden" }}>
        {mapImageUrl && (
          <img src={mapImageUrl} style={{ display: "flex", position: "absolute", left: `${offsetX}px`, top: "0px", width: `${mapSidePx * scale}px`, height: `${mapSidePx * scale}px` }} />
        )}
        <img src={graphicsDataUri} style={{ display: "flex", position: "absolute", left: "0px", top: "0px", width: `${width}px`, height: `${height}px` }} />
        <div style={{ display: "flex", position: "absolute", left: `${offsetX}px`, top: "0px", width: `${mapSidePx * scale}px`, height: `${mapSidePx * scale}px` }}>
          {(labelPlacements?.result || []).map((lp: any, i: number) => {
            if (!lp?.label?.name) return null;
            return (
              <div key={i} style={{ display: "flex", position: "absolute", left: `${lp.offsetPoint.x * scale}px`, top: `${lp.offsetPoint.y * scale}px`, color: accentColor, fontFamily: "Helvetica", fontSize: "14px", fontWeight: 400, whiteSpace: "nowrap" }}>
                {lp.label.name}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", width: `${width}px`, height: `${height}px`, position: "relative", overflow: "hidden" }}>
      {mapImageUrl && (
        <img src={mapImageUrl} style={{ display: "flex", position: "absolute", left: `${offsetX}px`, top: "0px", width: `${mapSidePx * scale}px`, height: `${mapSidePx * scale}px`, objectFit: "contain" }} />
      )}
      <svg width={width} height={height} style={{ display: "flex", position: "absolute", left: 0, top: 0, pointerEvents: "none" }} viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${offsetX}, 0) scale(${scale})`}>
          {baseMapData.paths.map((d: any, i: number) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
              <path d={d} fill="none" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" strokeDasharray="6 6" strokeLinecap="round" />
            </g>
          ))}
          {baseMapData.waypoints.map((wp: any, i: number) => (
            <circle key={i} cx={wp.point.x} cy={wp.point.y} r={5} fill={accentColor} />
          ))}
        </g>
      </svg>
      <div style={{ display: "flex", position: "absolute", left: `${offsetX}px`, top: "0px", width: `${mapSidePx * scale}px`, height: `${mapSidePx * scale}px`, pointerEvents: "none" }}>
        {(labelPlacements?.result || []).map((lp: any, i: number) => {
          if (!lp?.label?.name) return null;
          return (
            <div key={i} style={{ display: "flex", position: "absolute", left: `${lp.offsetPoint.x * scale}px`, top: `${lp.offsetPoint.y * scale}px`, color: accentColor, fontFamily: "Helvetica", fontSize: "14px", fontWeight: 400, whiteSpace: "nowrap", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>
              {lp.label.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
