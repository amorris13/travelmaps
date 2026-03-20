import type { StageConfig } from "@lib/types";
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  formatElevation,
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
  const padding = width * 0.06;
  const tableWidth = width - padding * 2;
  const rowHeight = 22;
  const headerHeight = 24;
  const fontSize = 12;
  const headerFontSize = 10;

  const columns = [
    { label: "", width: tableWidth * 0.05, align: "middle" as const },
    { label: "STAGE", width: tableWidth * 0.35, align: "start" as const },
    { label: "DISTANCE", width: tableWidth * 0.18, align: "end" as const },
    { label: "TIME", width: tableWidth * 0.16, align: "end" as const },
    { label: "SPEED", width: tableWidth * 0.13, align: "end" as const },
    { label: "ELEV.", width: tableWidth * 0.13, align: "end" as const },
  ];

  return (
    <g transform={`translate(${padding}, ${y})`}>
      {/* Header */}
      <line x1={0} y1={0} x2={tableWidth} y2={0} stroke="#e0e0e0" strokeWidth={0.5} />
      {(() => {
        let xOffset = 0;
        return columns.map((col) => {
          const x =
            col.align === "end"
              ? xOffset + col.width
              : col.align === "middle"
                ? xOffset + col.width / 2
                : xOffset;
          xOffset += col.width;
          return (
            <text
              key={col.label}
              x={x}
              y={headerHeight * 0.7}
              textAnchor={col.align}
              fill="#999999"
              fontFamily="Helvetica Neue, Helvetica, sans-serif"
              fontSize={headerFontSize}
              fontWeight={300}
              letterSpacing="0.12em"
            >
              {col.label}
            </text>
          );
        });
      })()}
      <line
        x1={0}
        y1={headerHeight}
        x2={tableWidth}
        y2={headerHeight}
        stroke="#e0e0e0"
        strokeWidth={0.5}
      />

      {/* Rows */}
      {stages.map((stage, i) => {
        const rowY = headerHeight + rowHeight * i;
        const values = [
          `${i + 1}`,
          stage.name || stage.endLabel,
          formatDistance(stage.distance),
          formatDuration(stage.movingTime),
          formatSpeed(stage.averageSpeed),
          formatElevation(stage.elevationGain),
        ];

        let xOffset = 0;
        return (
          <g key={i}>
            {values.map((val, j) => {
              const col = columns[j];
              const x =
                col.align === "end"
                  ? xOffset + col.width
                  : col.align === "middle"
                    ? xOffset + col.width / 2
                    : xOffset;
              xOffset += col.width;
              return (
                <text
                  key={j}
                  x={x}
                  y={rowY + rowHeight * 0.72}
                  textAnchor={col.align}
                  fill={j === 0 ? accentColor : "#333333"}
                  fontFamily="Helvetica Neue, Helvetica, sans-serif"
                  fontSize={fontSize}
                  fontWeight={j === 0 ? 500 : 300}
                >
                  {val}
                </text>
              );
            })}
            <line
              x1={0}
              y1={rowY + rowHeight}
              x2={tableWidth}
              y2={rowY + rowHeight}
              stroke="#f0f0f0"
              strokeWidth={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}
