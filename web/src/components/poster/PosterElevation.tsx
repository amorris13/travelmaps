"use client";

import { useMemo } from "react";
import type { StageConfig } from "@lib/types";
import {
  computeElevationProfileFromStages,
  renderElevationProfileAsSvg,
} from "@lib/elevation";

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
    // Use contentWidth for plotting if provided, otherwise fall back to width
    const effectiveWidth = contentWidth !== undefined ? contentWidth : width;

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
  }, [stages, accentColor, width, contentWidth, height, units]);

  if (!profileData) {
    return null;
  }

  const { svgWidth, svgHeight } = profileData;
  const effectiveX = contentX !== undefined ? contentX : 0;
  const effectiveWidth = contentWidth !== undefined ? contentWidth : width;

  return (
    <g
      transform={`translate(${effectiveX}, ${y})`}
      dangerouslySetInnerHTML={{
        __html: renderElevationProfileAsSvg(profileData, {
          width: effectiveWidth,
          height,
          includeSvgTag: true,
          x: 0,
          y: 0,
        }),
      }}
    />
  );
}
