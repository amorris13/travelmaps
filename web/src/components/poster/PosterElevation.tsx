"use client";

import { useMemo } from "react";
import type { StageConfig } from "@lib/types";
import { computeElevationProfile } from "@lib/elevation";
import { ELEVATION_PADDING } from "@lib/constants";

interface PosterElevationProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
  height: number;
}

export function PosterElevation({
  stages,
  accentColor,
  y,
  width,
  height,
}: PosterElevationProps) {
  const profileData = useMemo(() => {
    // Combine all stage elevation/distance data
    let combinedElevation: number[] = [];
    let combinedDistance: number[] = [];
    const stageMarkers: { distance: number; label: string }[] = [];
    let cumulativeDistance = 0;

    for (const [i, stage] of stages.entries()) {
      if (stage.elevationStream.length === 0 || stage.distanceStream.length === 0) {
        continue;
      }

      combinedElevation = combinedElevation.concat(stage.elevationStream);
      combinedDistance = combinedDistance.concat(
        stage.distanceStream.map((d) => d + cumulativeDistance)
      );

      if (stages.length > 1) {
        stageMarkers.push({
          distance: cumulativeDistance,
          label: `${i + 1}`,
        });
      }

      const lastDist =
        stage.distanceStream.length > 0
          ? stage.distanceStream[stage.distanceStream.length - 1]
          : 0;
      cumulativeDistance += lastDist;
    }

    if (combinedElevation.length === 0) return null;

    const padding = ELEVATION_PADDING;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2 - 30; // Leave room for labels

    return computeElevationProfile(
      combinedElevation,
      combinedDistance,
      plotWidth,
      plotHeight,
      {
        stageMarkers: stageMarkers.length > 0 ? stageMarkers : undefined,
        labelProminentElevations: { minProminence: 250 },
        showKeyElevations: true,
      },
      accentColor
    );
  }, [stages, accentColor, width, height]);

  if (!profileData) {
    return null;
  }

  const { profilePoints, svgWidth, svgHeight, maxElevationPoint, prominentLabels, stageMarkerPositions, keyElevations, gradientStartColor, gradientEndColor, plotOffsetY, plotWidth, plotHeight } = profileData;

  const gradientId = "elevation-gradient";
  const padding = ELEVATION_PADDING;

  // Build profile path
  const pathD = profilePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Fill path (close to bottom)
  const firstPt = profilePoints[0];
  const lastPt = profilePoints[profilePoints.length - 1];
  const fillD = `${pathD} L ${lastPt.x} ${plotOffsetY + plotHeight} L ${firstPt.x} ${plotOffsetY + plotHeight} Z`;

  // Triangle marker for max elevation
  const triSize = 10;
  const cx = maxElevationPoint.x;
  const cy = maxElevationPoint.y;
  const triPoints = `${cx},${cy - triSize * (Math.sqrt(3) / 3)} ${cx - triSize / 2},${cy + triSize * (Math.sqrt(3) / 6)} ${cx + triSize / 2},${cy + triSize * (Math.sqrt(3) / 6)}`;

  const stageBarY = plotOffsetY + plotHeight;
  const keyY = stageBarY + (stageMarkerPositions.length > 0 ? 15 : 0) + 20;

  return (
    <g transform={`translate(0, ${y})`}>
      <svg
        x={0}
        y={0}
        width={width}
        height={height}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientStartColor} />
            <stop offset="100%" stopColor={gradientEndColor} />
          </linearGradient>
        </defs>

        {/* Fill */}
        <path d={fillD} fill={`url(#${gradientId})`} stroke="none" />

        {/* Profile line */}
        <path
          d={pathD}
          fill="none"
          stroke={accentColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Max elevation triangle */}
        <polygon
          points={triPoints}
          fill={accentColor}
          stroke="white"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Prominent elevation labels */}
        {prominentLabels.map((label, i) => (
          <text
            key={`prom-${i}`}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fontFamily="Helvetica Neue, sans-serif"
            fontSize={16}
            fontWeight={300}
            letterSpacing="0.05em"
            dominantBaseline="alphabetic"
          >
            {label.elevation}m
          </text>
        ))}

        {/* Stage markers */}
        {stageMarkerPositions.map((marker, i) => (
          <g key={`stage-${i}`}>
            <line
              x1={marker.x}
              y1={stageBarY}
              x2={marker.x}
              y2={stageBarY + 5}
              stroke="#808080"
              strokeWidth={1}
            />
            <line
              x1={marker.x}
              y1={stageBarY}
              x2={marker.x}
              y2={marker.elevationY}
              stroke="#808080"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={(marker.x + marker.xNext) / 2}
              y={stageBarY + 15}
              textAnchor="middle"
              fontFamily="Helvetica Neue, sans-serif"
              fontSize={16}
              fontWeight={300}
              letterSpacing="0.05em"
              dominantBaseline="alphabetic"
            >
              {marker.label}
            </text>
          </g>
        ))}
        {stageMarkerPositions.length > 0 && (
          <line
            x1={plotWidth + padding}
            y1={stageBarY}
            x2={plotWidth + padding}
            y2={stageBarY + 5}
            stroke="#808080"
            strokeWidth={1}
          />
        )}

        {/* Key elevations */}
        <text
          x={padding}
          y={keyY}
          textAnchor="start"
          fontFamily="Helvetica Neue, sans-serif"
          fontSize={16}
          fontWeight={300}
          letterSpacing="0.05em"
          dominantBaseline="alphabetic"
        >
          {keyElevations.start}m
        </text>
        <text
          x={plotWidth / 2}
          y={keyY}
          textAnchor="middle"
          fontFamily="Helvetica Neue, sans-serif"
          fontSize={16}
          fontWeight={300}
          letterSpacing="0.05em"
          dominantBaseline="alphabetic"
        >
          ⏶ {keyElevations.peak}m
        </text>
        <text
          x={plotWidth - padding}
          y={keyY}
          textAnchor="end"
          fontFamily="Helvetica Neue, sans-serif"
          fontSize={16}
          fontWeight={300}
          letterSpacing="0.05em"
          dominantBaseline="alphabetic"
        >
          {keyElevations.end}m
        </text>
      </svg>
    </g>
  );
}
