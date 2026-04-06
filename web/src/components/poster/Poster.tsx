"use client";

import { useCallback, forwardRef, useMemo } from "react";
import type { PosterConfig } from "@lib/types";
import { POSTER_WIDTH, POSTER_HEIGHT } from "@lib/constants";
import { computeBoundsFromPolylines, computeMapTransform } from "@lib/geo";
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

    // Compute map content alignment for other sections
    const { contentX, contentWidth } = useMemo(() => {
      const polylines = config.stages.map((s) => s.polyline).filter(Boolean);
      if (polylines.length === 0)
        return { contentX: padding, contentWidth: width - padding * 2 };

      let bounds = computeBoundsFromPolylines(polylines);
      if (config.additionalLocations.length > 0) {
        let { west, east, south, north } = bounds;
        for (const loc of config.additionalLocations) {
          west = Math.min(west, loc.lng);
          east = Math.max(east, loc.lng);
          south = Math.min(south, loc.lat);
          north = Math.max(north, loc.lat);
        }
        bounds = { west, east, south, north };
      }

      const sidePx = Math.min(width, mapHeight);
      const { expandedBbox } = computeMapTransform(bounds, sidePx);

      // Calculate scale and offset exactly as PosterMap does
      const scale = Math.min(width / sidePx, mapHeight / sidePx);
      const offsetX = (width - sidePx * scale) / 2;

      // The map content is actually bounded by the expandedBbox * scale
      // But PosterMap renders the image across sidePx * scale.
      // However, PosterMap also has an internal padding when calculating transform.
      // In computeMapTransform(bounds, sidePx, padding = 1.3),
      // the expandedBbox is 1.3x larger than the actual content.
      // The actual content width is sidePx / 1.3 * scale.
      const contentScale = 1 / 1.3;
      const actualContentWidth = sidePx * contentScale * scale;
      const actualContentX =
        offsetX + (sidePx * scale - actualContentWidth) / 2;

      return {
        contentX: actualContentX,
        contentWidth: actualContentWidth,
      };
    }, [
      // Only recalculate map alignment when geometric data or map size changes.
      // Changes to labels or other metadata should not trigger this.
      config.stages.length,
      config.stages.map((s) => s.polyline).join("|"),
      config.additionalLocations.map((l) => `${l.lat},${l.lng}`).join("|"),
      width,
      mapHeight,
      padding,
    ]);

    const elevationY = mapY + mapHeight + padding;
    const stageTableY = useSideBySide ? elevationY : elevationY + elevationHeight + padding;
    const stageTableX = useSideBySide ? width * 0.5 + padding / 2 : 0;

    const elevationContentX = useSideBySide
      ? contentX < elevationWidth - 100
        ? contentX
        : 0
      : contentX;
    const elevationContentWidth = useSideBySide
      ? contentX < elevationWidth - 100
        ? Math.min(contentWidth, elevationWidth - elevationContentX)
        : elevationWidth
      : contentWidth;

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
          mapTint={config.mapTint}
          y={mapY}
          width={width}
          height={mapHeight}
        />

        {/* Elevation Profile */}
        {showElevation && (
          <PosterElevation
            stages={config.stages}
            accentColor={config.accentColor}
            y={elevationY}
            width={useSideBySide ? elevationWidth : width}
            height={elevationHeight}
            units={config.units}
            contentX={elevationContentX}
            contentWidth={elevationContentWidth}
          />
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
              {...(!useSideBySide ? { contentX, contentWidth } : {})}
            />
          </g>
        )}
      </svg>
    );
  }
);

export { type PosterProps };
