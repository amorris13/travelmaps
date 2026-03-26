import type { StageConfig } from "@lib/types";
import {
  formatDistanceCompact,
  formatDurationCompact,
  formatSpeedCompact,
  formatPaceCompact,
  formatElevationCompact,
  usePace,
} from "@/lib/poster-config";

interface PosterStageTableProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
  columnCount?: number;
  units?: "metric" | "imperial";
  showSeconds?: boolean;
  contentX?: number;
  contentWidth?: number;
}

export function PosterStageTable({
  stages,
  accentColor,
  y,
  width,
  columnCount = 3,
  units = "metric",
  showSeconds = false,
  contentX,
  contentWidth,
}: PosterStageTableProps) {
  // If contentX/contentWidth are provided, we use them for the effective table area
  // and we do NOT add extra internal padding, so it aligns perfectly with the map edges.
  const tablePadding = contentWidth !== undefined ? 0 : width * 0.04;
  const effectiveX = contentX !== undefined ? contentX : tablePadding;
  const effectiveWidth = contentWidth !== undefined ? contentWidth : (width - tablePadding * 2);

  const rowHeight = 18;
  const headerHeight = 20;
  const fontSize = 10;
  const headerFontSize = 8;

  // Split stages into column groups
  const rowsPerColumn = Math.ceil(stages.length / columnCount);
  const columnGroups: StageConfig[][] = [];
  for (let c = 0; c < columnCount; c++) {
    columnGroups.push(
      stages.slice(c * rowsPerColumn, (c + 1) * rowsPerColumn)
    );
  }

  const gap = 12; // gap between column groups
  const totalGapWidth = (columnCount - 1) * gap;
  const groupW = (effectiveWidth - totalGapWidth) / columnCount;

  const allPace =
    stages.length > 0 && stages.every((s) => usePace(s.activityType));
  const hasMixed =
    stages.length > 0 &&
    !allPace &&
    stages.some((s) => usePace(s.activityType));

  // Find "best efforts" for bolding
  const maxDist = Math.max(...stages.map((s) => s.distance));
  const maxTime = Math.max(...stages.map((s) => s.movingTime));
  const maxSpeed = Math.max(...stages.map((s) => s.averageSpeed));
  const maxGain = Math.max(...stages.map((s) => s.elevationGain));

  // Sub-columns within each group: #, STAGE, DIST, TIME, SPD/PACE, GAIN
  // We use fixed width percentages but ensure the 8px offset is integrated.
  const subColOffset = 8;
  const subColWidths = (w: number) => {
    let speedLabel = "SPEED";
    if (allPace) speedLabel = "PACE";
    else if (hasMixed) speedLabel = "SPD/PACE";

    // Adjust STAGE width to account for the offset
    const wReduced = w - subColOffset;

    return [
      { label: "", width: wReduced * 0.05, align: "end" as const },
      {
        label: "STAGE",
        width: wReduced * 0.43,
        align: "start" as const,
        offset: subColOffset, // Margin after the stage number
      },
      {
        label: "DIST",
        width: wReduced * 0.12,
        align: "end" as const,
      },
      {
        label: "TIME",
        width: wReduced * 0.13,
        align: "end" as const,
      },
      {
        label: speedLabel,
        width: wReduced * 0.13,
        align: "end" as const,
      },
      {
        label: "GAIN",
        width: wReduced * 0.14,
        align: "end" as const,
      },
    ];
  };

  const cols = subColWidths(groupW);

  // Helper to get cumulative X for a column
  const getColX = (index: number) => {
    let x = 0;
    for (let i = 0; i < index; i++) {
      x += cols[i].width;
      if ("offset" in cols[i] && cols[i].offset) x += cols[i].offset!;
    }
    const col = cols[index];
    if (col.align === "end") x += col.width;
    if ("offset" in col && col.offset) x += col.offset;
    return x;
  };

  return (
    <g transform={`translate(${effectiveX}, ${y})`}>
      {columnGroups.map((group, groupIdx) => {
        const groupX = groupIdx * (groupW + gap);
        return (
          <g key={groupIdx} transform={`translate(${groupX}, 0)`}>
            {/* Header row */}
            {cols.map((col, ci) => {
              const x = getColX(ci);
              return (
                <text
                  key={`h-${ci}`}
                  x={x}
                  y={headerHeight * 0.7}
                  textAnchor={col.align}
                  fill={accentColor}
                  fontFamily="Montserrat, sans-serif"
                  fontSize={headerFontSize}
                  fontWeight={600}
                  letterSpacing="0.08em"
                >
                  {col.label}
                </text>
              );
            })}

            {/* Header grid line */}
            <line
              x1={0}
              y1={headerHeight}
              x2={groupW}
              y2={headerHeight}
              stroke={accentColor}
              strokeWidth={1.5}
            />

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

              const stageName = stage.name || (fromLabel && toLabel ? `${fromLabel} \u2192 ${toLabel}` : stage.endLabel || `Stage ${globalIdx + 1}`);

              const isStagePace = usePace(stage.activityType);
              const values = [
                { val: `${globalIdx + 1}`, bold: false },
                { val: stageName, bold: false },
                { val: formatDistanceCompact(stage.distance, units), bold: stage.distance === maxDist && stages.length > 1 },
                { val: formatDurationCompact(stage.movingTime, showSeconds), bold: stage.movingTime === maxTime && stages.length > 1 },
                {
                  val: isStagePace
                    ? formatPaceCompact(stage.averageSpeed, units)
                    : formatSpeedCompact(stage.averageSpeed, units),
                  bold: stage.averageSpeed === maxSpeed && stages.length > 1
                },
                { val: formatElevationCompact(stage.elevationGain, units), bold: stage.elevationGain === maxGain && stages.length > 1 },
              ];

              return (
                <g key={i}>
                  {values.map((item, j) => {
                    const x = getColX(j);
                    const col = cols[j];

                    return (
                      <text
                        key={j}
                        x={x}
                        y={rowY + rowHeight * 0.75}
                        textAnchor={col.align}
                        fill={j === 0 ? "black" : "#333333"}
                        fontFamily="Helvetica, sans-serif"
                        fontSize={fontSize}
                        fontWeight={j === 0 || item.bold ? 700 : 300}
                      >
                        {item.val}
                      </text>
                    );
                  })}
                  {/* Row grid line */}
                  <line
                    x1={0}
                    y1={rowY + rowHeight}
                    x2={groupW}
                    y2={rowY + rowHeight}
                    stroke="#eee"
                    strokeWidth={1}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
