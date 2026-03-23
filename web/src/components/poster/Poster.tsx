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
    const titleHeight = height * 0.1;
    const statsHeight = height * 0.055;
    const padding = width * 0.05;

    const showElevation =
      config.showElevation &&
      config.stages.some((s) => s.elevationStream.length > 0);
    const showStageTable = config.showStageTable && config.stages.length > 1;

    // Side-by-side logic: if fewer than 9 stages and both are shown
    const useSideBySide = showElevation && showStageTable && config.stages.length < 9;

    let elevationHeight = showElevation ? height * 0.1 : 0;
    let elevationWidth = width;

    let stageTableHeight = 0;
    let stageTableWidth = width;
    let stageTableColumnCount = 3;

    if (useSideBySide) {
      elevationWidth = width * 0.5 - padding / 2;
      stageTableWidth = width * 0.5 - padding / 2;
      stageTableColumnCount = 1;

      const rows = config.stages.length;
      stageTableHeight = 20 + rows * 18 + 16;
      // Balance heights if side-by-side
      elevationHeight = Math.max(elevationHeight, stageTableHeight);
      stageTableHeight = elevationHeight;
    } else {
      if (showStageTable) {
        const stageTableRowCount = Math.ceil(config.stages.length / 3);
        stageTableHeight = 20 + stageTableRowCount * 18 + 16;
      }
    }

    const mapY = titleHeight + statsHeight + padding;
    const mapHeight =
      height -
      titleHeight -
      statsHeight -
      elevationHeight -
      (useSideBySide ? 0 : stageTableHeight) -
      padding * 4;

    const elevationY = mapY + mapHeight + padding;
    const stageTableY = useSideBySide ? elevationY : elevationY + elevationHeight + padding;
    const stageTableX = useSideBySide ? width * 0.5 + padding / 2 : 0;

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
          units={config.units}
          showSeconds={config.showSeconds}
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
        {showElevation && (
          <g transform={`translate(${useSideBySide ? 0 : 0}, 0)`}>
            <PosterElevation
              stages={config.stages}
              accentColor={config.accentColor}
              y={elevationY}
              width={elevationWidth}
              height={elevationHeight}
              units={config.units}
            />
          </g>
        )}

        {/* Stage Table */}
        {showStageTable && (
          <g transform={`translate(${stageTableX}, 0)`}>
            <PosterStageTable
              stages={config.stages}
              accentColor={config.accentColor}
              y={stageTableY}
              width={stageTableWidth}
              columnCount={stageTableColumnCount}
              units={config.units}
              showSeconds={config.showSeconds}
            />
          </g>
        )}
      </svg>
    );
  }
);

export { type PosterProps };
