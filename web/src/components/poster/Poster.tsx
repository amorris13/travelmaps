"use client";

import { useCallback, forwardRef } from "react";
import type { PosterConfig } from "@lib/types";
import { POSTER_WIDTH, POSTER_HEIGHT } from "@lib/constants";
import { PosterTitle } from "./PosterTitle";
import { PosterStats } from "./PosterStats";
import { PosterMap } from "./PosterMap";
import { PosterElevation } from "./PosterElevation";
import { PosterStageTable } from "./PosterStageTable";

interface PosterProps {
  config: PosterConfig;
  className?: string;
}

export const Poster = forwardRef<SVGSVGElement, PosterProps>(
  function Poster({ config, className }, forwardedRef) {
    // Merge forwarded ref with internal callback
    const svgRefCallback = useCallback(
      (node: SVGSVGElement | null) => {
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const width = POSTER_WIDTH;
    const height = POSTER_HEIGHT;

    // Layout computation
    const titleHeight = height * 0.08;
    const statsHeight = height * 0.055;
    const padding = width * 0.02;

    // Map gets the largest area
    const elevationHeight = config.showElevation ? height * 0.1 : 0;

    // Multi-column table: rows = ceil(stages/3), each row 18px + 20px header
    const stageTableRowCount =
      config.showStageTable && config.stages.length > 1
        ? Math.ceil(config.stages.length / 3)
        : 0;
    const stageTableHeight =
      stageTableRowCount > 0
        ? 20 + stageTableRowCount * 18 + 16
        : 0;

    const mapY = titleHeight + statsHeight + padding;
    const mapHeight =
      height -
      titleHeight -
      statsHeight -
      elevationHeight -
      stageTableHeight -
      padding * 4;

    const elevationY = mapY + mapHeight + padding;
    const stageTableY = elevationY + elevationHeight + padding;

    return (
      <svg
        ref={svgRefCallback}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        style={{ background: "white" }}
      >
        {/* Background */}
        <rect width={width} height={height} fill="white" />

        {/* Title + Date */}
        <PosterTitle
          title={config.title}
          dateRange={config.dateRange}
          accentColor={config.accentColor}
          width={width}
        />

        {/* Stats row */}
        <PosterStats
          stages={config.stages}
          accentColor={config.accentColor}
          y={titleHeight}
          width={width}
        />

        {/* Map */}
        <PosterMap
          stages={config.stages}
          additionalLocations={config.additionalLocations}
          accentColor={config.accentColor}
          mapStyle={config.mapStyle}
          y={mapY}
          width={width}
          height={mapHeight}
        />

        {/* Elevation Profile */}
        {config.showElevation && (
          <PosterElevation
            stages={config.stages}
            accentColor={config.accentColor}
            y={elevationY}
            width={width}
            height={elevationHeight}
          />
        )}

        {/* Stage Table */}
        {config.showStageTable && config.stages.length > 1 && (
          <PosterStageTable
            stages={config.stages}
            accentColor={config.accentColor}
            y={stageTableY}
            width={width}
          />
        )}
      </svg>
    );
  }
);

export { type PosterProps };
