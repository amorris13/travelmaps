"use client";

import type { StageConfig } from "@lib/types";
import {
  computeElevationProfileFromStages,
  renderElevationProfileAsSvg,
} from "@lib/elevation";
import React, { useMemo } from "react";

interface PosterElevationProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
  height: number;
  units?: "metric" | "imperial";
  contentX?: number;
  contentWidth?: number;
}

export function PosterElevation({
  stages,
  accentColor,
  y,
  width,
  height,
  units = "metric",
  contentX,
  contentWidth,
}: PosterElevationProps) {
  const isServer = typeof window === "undefined";

  if (isServer) {
    const effectiveWidth = contentWidth !== undefined ? contentWidth : width;
    const profileData = computeElevationProfileFromStages(
      stages,
      effectiveWidth,
      height,
      {
        labelProminentElevations: { minProminence: 250 },
        showKeyElevations: false,
        units,
      },
      accentColor
    );

    if (!profileData) return null;

    return (
      <PosterElevationServerRender
        width={width}
        height={height}
        effectiveWidth={effectiveWidth}
        contentX={contentX}
        profileData={profileData}
      />
    );
  }

  return (
    <PosterElevationClient
      stages={stages}
      accentColor={accentColor}
      y={y}
      width={width}
      height={height}
      units={units}
      contentX={contentX}
      contentWidth={contentWidth}
    />
  );
}

function PosterElevationServerRender({
  width,
  height,
  effectiveWidth,
  contentX,
  profileData,
}: any) {
  const {
    segmentPaths,
    gridlines,
    stageMarkerPositions,
    prominentLabels,
    maxElevationTrianglePoints,
    accentColor,
    gradientStartColor,
    gradientEndColor,
    plotWidth,
    plotHeight,
    plotOffsetY
  } = profileData;
  const effectiveX = contentX !== undefined ? contentX : 0;
  const padding = 5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "flex" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform={`translate(${effectiveX}, 0)`}>
        <defs>
          <linearGradient id="elevation-gradient-server" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientStartColor} />
            <stop offset="100%" stopColor={gradientEndColor} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridlines.map((gy: number, i: number) => (
          <line key={i} x1={padding} y1={gy} x2={plotWidth + padding} y2={gy} stroke="#e0e0e0" strokeWidth={1} />
        ))}

        {/* Segments */}
        {segmentPaths.map((seg: any, i: number) => (
          <React.Fragment key={i}>
            <path d={seg.fillD} fill="url(#elevation-gradient-server)" stroke="none" />
            <path d={seg.pathD} fill="none" stroke={accentColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </React.Fragment>
        ))}

        {/* Max elevation triangle */}
        <polygon points={maxElevationTrianglePoints} fill={accentColor} stroke="white" strokeWidth={2} strokeLinejoin="round" />

        {/* Prominent labels */}
        {prominentLabels.map((label: any, i: number) => (
          <text key={i} x={label.x} y={label.y} textAnchor={label.anchor} fontSize={16} fill="#1a1a1a" fontFamily="Montserrat">{label.label}</text>
        ))}

        {/* Stage markers */}
        {stageMarkerPositions.map((marker: any, i: number) => (
          <React.Fragment key={i}>
             <line x1={marker.x} y1={plotOffsetY + plotHeight} x2={marker.x} y2={plotOffsetY + plotHeight + 5} stroke="#808080" strokeWidth={1} />
             <text x={(marker.x + marker.xNext) / 2} y={plotOffsetY + plotHeight + 15} textAnchor="middle" fontSize={16} fill="#999" fontFamily="Montserrat">{marker.label}</text>
          </React.Fragment>
        ))}
      </g>
    </svg>
  );
}

function PosterElevationClient({
  stages,
  accentColor,
  y,
  width,
  height,
  units,
  contentX,
  contentWidth,
}: any) {
  const effectiveWidth = contentWidth !== undefined ? contentWidth : width;
  const profileData = useMemo(() => {
    return computeElevationProfileFromStages(
      stages,
      effectiveWidth,
      height,
      {
        labelProminentElevations: { minProminence: 250 },
        showKeyElevations: false,
        units,
      },
      accentColor
    );
  }, [stages, accentColor, effectiveWidth, height, units]);

  if (!profileData) return null;

  const effectiveX = contentX !== undefined ? contentX : 0;
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        justifyContent: "flex-start",
      }}
      dangerouslySetInnerHTML={{
        __html: renderElevationProfileAsSvg(profileData, {
          width: effectiveWidth,
          height,
          includeSvgTag: true,
          x: effectiveX,
          y: 0,
        }),
      }}
    />
  );
}
