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
  const profileData = useMemo(() => {
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
      if (stage.elevationStream.length === 0 || stage.distanceStream.length === 0) continue;

      correctStageMarkers.push({
        distance: currentCumulative,
        label: `${i + 1}`,
      });

      currentCumulative += stage.distanceStream[stage.distanceStream.length - 1];
      if (stages[i + 1] && !stages[i + 1].isContinuousWithPrev) {
        currentCumulative += gapSize;
      }
    }

    // Use contentWidth for plotting if provided, otherwise fall back to width
    const effectiveWidth = contentWidth !== undefined ? contentWidth : width;
    const padding = ELEVATION_PADDING;
    const plotWidth = effectiveWidth - padding * 2;
    const plotHeight = height - padding * 2 - 30; // Leave room for labels

    return computeElevationProfile(
      segments,
      plotWidth,
      plotHeight,
      {
        stageMarkers: correctStageMarkers.length > 0 ? correctStageMarkers : undefined,
        labelProminentElevations: { minProminence: 250 },
        showKeyElevations: true,
      },
      accentColor
    );
  }, [stages, accentColor, width, contentWidth, height]);

  if (!profileData) {
    return null;
  }

  const { segmentPaths, svgWidth, svgHeight, maxElevationTrianglePoints, prominentLabels, stageMarkerPositions, keyElevations, gradientStartColor, gradientEndColor, plotOffsetY, plotWidth, plotHeight } = profileData;

  const gradientId = "elevation-gradient";
  const padding = ELEVATION_PADDING;
  const effectiveX = contentX !== undefined ? contentX : 0;

  const stageBarY = plotOffsetY + plotHeight;
  const keyY = stageBarY + (stageMarkerPositions.length > 0 ? 15 : 0) + 20;

  return (
    <g transform={`translate(${effectiveX}, ${y})`}>
      <svg
        x={0}
        y={0}
        width={contentWidth !== undefined ? contentWidth : width}
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

        {/* Gridlines */}
        {profileData.gridlines.map((gy, i) => (
          <line
            key={`grid-${i}`}
            x1={padding}
            y1={gy}
            x2={plotWidth + padding}
            y2={gy}
            stroke="#e0e0e0"
            strokeWidth={1}
          />
        ))}

        {/* Fill and Profile lines for each segment */}
        {segmentPaths.map((segment, i) => {
          return (
            <g key={`segment-${i}`}>
              <path d={segment.fillD} fill={`url(#${gradientId})`} stroke="none" />
              <path
                d={segment.pathD}
                fill="none"
                stroke={accentColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Max elevation triangle */}
        <polygon
          points={maxElevationTrianglePoints}
          fill={accentColor}
          stroke="white"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Prominent elevation labels */}
        {prominentLabels.map((label, i) => {
          const displayElev =
            units === "imperial" ? label.elevation * 3.28084 : label.elevation;
          return (
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
              {Math.round(displayElev)}
              {units === "imperial" ? "ft" : "m"}
            </text>
          );
        })}

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
          {Math.round(
            units === "imperial"
              ? keyElevations.start * 3.28084
              : keyElevations.start
          )}
          {units === "imperial" ? "ft" : "m"}
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
          ⏶{" "}
          {Math.round(
            units === "imperial"
              ? keyElevations.peak * 3.28084
              : keyElevations.peak
          )}
          {units === "imperial" ? "ft" : "m"}
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
          {Math.round(
            units === "imperial"
              ? keyElevations.end * 3.28084
              : keyElevations.end
          )}
          {units === "imperial" ? "ft" : "m"}
        </text>
      </svg>
    </g>
  );
}
