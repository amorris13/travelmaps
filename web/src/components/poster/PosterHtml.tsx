import React, { useMemo } from "react";
import type { PosterConfig } from "@lib/types";
import { POSTER_WIDTH, POSTER_HEIGHT } from "@lib/constants";
import { computeBoundsFromPolylines, computeMapTransform } from "@lib/geo";
import { PosterTitleHtml } from "./PosterTitleHtml";
import { PosterStatsHtml } from "./PosterStatsHtml";
import { PosterMap } from "./PosterMap";
import { PosterElevation } from "./PosterElevation";
import { PosterStageTableHtml } from "./PosterStageTableHtml";

interface PosterHtmlProps {
  config: PosterConfig;
  className?: string;
}

export function PosterHtml({ config, className }: PosterHtmlProps) {
  const width = POSTER_WIDTH;
  const height = POSTER_HEIGHT;

  const padding = width * 0.05;

  const showElevation =
    config.showElevation &&
    config.stages.some((s) => s.elevationStream.length > 0);
  const showStageTable = config.showStageTable && config.stages.length > 1;

  // Side-by-side logic
  const useSideBySide =
    showElevation && showStageTable && config.stages.length < 9;

  // Compute map content alignment for other sections
  const { contentX, contentWidth } = (() => {
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

    const mapY = height * 0.1 + height * 0.055 + padding;
    const mapHeight =
      height -
      (height * 0.1) -
      (height * 0.055) -
      (showElevation ? height * 0.1 : 0) -
      (useSideBySide ? 0 : (showStageTable ? 20 + Math.ceil(config.stages.length / 3) * 18 + 16 : 0)) -
      padding * 4;

    const sidePx = Math.min(width, mapHeight);
    const { expandedBbox } = computeMapTransform(bounds, sidePx);

    const scale = Math.min(width / sidePx, mapHeight / sidePx);
    const offsetX = (width - sidePx * scale) / 2;

    const contentScale = 1 / 1.3;
    const actualContentWidth = sidePx * contentScale * scale;
    const actualContentX = offsetX + (sidePx * scale - actualContentWidth) / 2;

    return {
      contentX: actualContentX,
      contentWidth: actualContentWidth,
    };
  })();

  const elevationWidth = useSideBySide ? width * 0.5 - padding / 2 : width;
  const stageTableWidth = useSideBySide ? width * 0.5 - padding / 2 : width;

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
    <div
      className={className}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: "white",
        display: "flex",
        flexDirection: "column",
        padding: `${padding}px 0`,
        boxSizing: "border-box",
      }}
    >
      <PosterTitleHtml
        title={config.title}
        dateRange={config.dateRange}
        accentColor={config.accentColor}
      />

      <div style={{ marginTop: `${padding}px` }}>
        <PosterStatsHtml
          stages={config.stages}
          accentColor={config.accentColor}
          units={config.units}
          showSeconds={config.showSeconds}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          padding: `0 ${padding}px`,
          marginTop: `${padding}px`,
          boxSizing: "border-box",
        }}
      >
        <PosterMap
          stages={config.stages}
          additionalLocations={config.additionalLocations}
          accentColor={config.accentColor}
          mapStyle={config.mapStyle}
          y={0}
          width={width - padding * 2}
          height={1000} // This will be calculated by the flex container in the real preview
          // But for Satori we should probably give it a more fixed height or flex-grow.
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: useSideBySide ? "row" : "column",
          gap: `${padding}px`,
          padding: `0 ${useSideBySide ? padding : 0}px`,
          marginTop: `${padding}px`,
          alignItems: useSideBySide ? "flex-start" : "center",
        }}
      >
        {showElevation && (
          <div
            style={{
              width: useSideBySide ? `${elevationWidth}px` : "100%",
              display: "flex",
              justifyContent: useSideBySide ? "flex-start" : "center",
            }}
          >
             <PosterElevation
                stages={config.stages}
                accentColor={config.accentColor}
                y={0}
                width={useSideBySide ? elevationWidth : width}
                height={height * 0.1}
                units={config.units}
                contentX={elevationContentX}
                contentWidth={elevationContentWidth}
              />
          </div>
        )}

        {showStageTable && (
          <div
            style={{
              width: useSideBySide ? `${stageTableWidth}px` : "100%",
              padding: useSideBySide ? 0 : `0 ${contentX}px`,
              boxSizing: "border-box",
              display: "flex",
            }}
          >
            <PosterStageTableHtml
              stages={config.stages}
              accentColor={config.accentColor}
              columnCount={useSideBySide ? 1 : 3}
              units={config.units}
              showSeconds={config.showSeconds}
            />
          </div>
        )}
      </div>
    </div>
  );
}
