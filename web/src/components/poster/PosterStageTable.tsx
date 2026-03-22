import type { StageConfig } from "@lib/types";
import {
  formatDistanceCompact,
  formatDurationCompact,
  formatSpeedCompact,
  formatElevationCompact,
} from "@/lib/poster-config";

interface PosterStageTableProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
}

export function PosterStageTable({
  stages,
  accentColor,
  y,
  width,
}: PosterStageTableProps) {
  const padding = width * 0.04;
  const tableWidth = width - padding * 2;
  const rowHeight = 18;
  const headerHeight = 20;
  const fontSize = 10;
  const headerFontSize = 8;

  // Split stages into 3 column groups
  const columnCount = 3;
  const rowsPerColumn = Math.ceil(stages.length / columnCount);
  const columnGroups: StageConfig[][] = [];
  for (let c = 0; c < columnCount; c++) {
    columnGroups.push(
      stages.slice(c * rowsPerColumn, (c + 1) * rowsPerColumn)
    );
  }

  const columnGroupWidth = tableWidth / columnCount;
  const gap = 12; // gap between column groups

  // Sub-columns within each group: #, STAGE, DIST, TIME, SPEED, GAIN
  const subColWidths = (groupW: number) => {
    const w = groupW - gap;
    return [
      { label: "", width: w * 0.06, align: "end" as const },
      { label: "STAGE", width: w * 0.42, align: "start" as const },
      { label: "DIST", width: w * 0.12, align: "end" as const },
      { label: "TIME", width: w * 0.13, align: "end" as const },
      { label: "SPEED", width: w * 0.13, align: "end" as const },
      { label: "GAIN", width: w * 0.14, align: "end" as const },
    ];
  };

  const cols = subColWidths(columnGroupWidth);

  return (
    <g transform={`translate(${padding}, ${y})`}>
      {columnGroups.map((group, groupIdx) => {
        const groupX = groupIdx * columnGroupWidth;
        return (
          <g key={groupIdx} transform={`translate(${groupX}, 0)`}>
            {/* Header row */}
            {cols.map((col, ci) => {
              let x = cols.slice(0, ci).reduce((sum, c) => sum + c.width, 0);
              if (col.align === "end") x += col.width;
              else if (col.align === "middle") x += col.width / 2;
              return (
                <text
                  key={`h-${ci}`}
                  x={x}
                  y={headerHeight * 0.7}
                  textAnchor={col.align}
                  fill="#999999"
                  fontFamily="Helvetica Neue, Helvetica, sans-serif"
                  fontSize={headerFontSize}
                  fontWeight={600}
                  letterSpacing="0.08em"
                >
                  {col.label}
                </text>
              );
            })}

            {/* Data rows */}
            {group.map((stage, i) => {
              const globalIdx =
                groupIdx * rowsPerColumn + i;
              const rowY = headerHeight + rowHeight * i;
              // Build "Start → End" label from adjacent stages
              const prevStage =
                globalIdx > 0 ? stages[globalIdx - 1] : null;
              const fromLabel =
                globalIdx === 0
                  ? stage.startLabel
                  : prevStage?.endLabel || "";
              const toLabel = stage.endLabel || "";
              const stageName =
                fromLabel && toLabel
                  ? `${fromLabel} \u2192 ${toLabel}`
                  : stage.name || stage.endLabel || `Stage ${globalIdx + 1}`;
              const values = [
                `${globalIdx + 1}`,
                stageName,
                formatDistanceCompact(stage.distance),
                formatDurationCompact(stage.movingTime),
                formatSpeedCompact(stage.averageSpeed),
                formatElevationCompact(stage.elevationGain),
              ];

              return (
                <g key={i}>
                  {values.map((val, j) => {
                    const col = cols[j];
                    let x = cols
                      .slice(0, j)
                      .reduce((sum, c) => sum + c.width, 0);
                    if (col.align === "end") x += col.width;
                    else if (col.align === "middle") x += col.width / 2;

                    return (
                      <text
                        key={j}
                        x={x}
                        y={rowY + rowHeight * 0.75}
                        textAnchor={col.align}
                        fill={j === 0 ? accentColor : "#333333"}
                        fontFamily="Helvetica Neue, Helvetica, sans-serif"
                        fontSize={fontSize}
                        fontWeight={j === 0 ? 700 : 300}
                      >
                        {val}
                      </text>
                    );
                  })}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
