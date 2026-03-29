import type { StageConfig } from "@lib/types";
import {
  formatDistanceCompact,
  formatDurationCompact,
  formatSpeedCompact,
  formatPaceCompact,
  formatElevationCompact,
  usePace,
} from "@/lib/poster-config";

interface PosterStageTableHtmlProps {
  stages: StageConfig[];
  accentColor: string;
  columnCount?: number;
  units?: "metric" | "imperial";
  showSeconds?: boolean;
}

export function PosterStageTableHtml({
  stages,
  accentColor,
  columnCount = 3,
  units = "metric",
  showSeconds = false,
}: PosterStageTableHtmlProps) {
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

  let speedLabel = "SPEED";
  if (allPace) speedLabel = "PACE";
  else if (hasMixed) speedLabel = "SPD/PACE";

  const columns = [
    { label: "", width: "5%", align: "right" as const },
    { label: "STAGE", width: "43%", align: "left" as const, marginLeft: "8px" },
    { label: "DIST", width: "12%", align: "right" as const },
    { label: "TIME", width: "13%", align: "right" as const },
    { label: speedLabel, width: "13%", align: "right" as const },
    { label: "GAIN", width: "14%", align: "right" as const },
  ];

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      {columnGroups.map((group, groupIdx) => (
        <div
          key={groupIdx}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: "flex",
              height: `${headerHeight}px`,
              borderBottom: `1.5px solid ${accentColor}`,
              alignItems: "flex-end",
              paddingBottom: "4px",
            }}
          >
            {columns.map((col, ci) => (
              <div
                key={ci}
                style={{
                  width: col.width,
                  textAlign: col.align,
                  marginLeft: col.marginLeft || 0,
                  fontSize: `${headerFontSize}px`,
                  fontFamily: "Montserrat",
                  fontWeight: 600,
                  color: accentColor,
                  letterSpacing: "0.08em",
                }}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {group.map((stage, i) => {
            const globalIdx = groupIdx * rowsPerColumn + i;
            const fromLabel = stage.startLabel || "";
            const toLabel = stage.endLabel || "";
            const stageName =
              stage.name ||
              (fromLabel && toLabel
                ? `${fromLabel} \u2192 ${toLabel}`
                : stage.endLabel || `Stage ${globalIdx + 1}`);

            const isStagePace = usePace(stage.activityType);
            const values = [
              { val: `${globalIdx + 1}`, bold: true, color: "black" },
              { val: stageName, bold: false, color: "#333333" },
              {
                val: formatDistanceCompact(stage.distance, units),
                bold: stage.distance === maxDist && stages.length > 1,
                color: "#333333",
              },
              {
                val: formatDurationCompact(stage.movingTime, showSeconds),
                bold: stage.movingTime === maxTime && stages.length > 1,
                color: "#333333",
              },
              {
                val: isStagePace
                  ? formatPaceCompact(stage.averageSpeed, units)
                  : formatSpeedCompact(stage.averageSpeed, units),
                bold: stage.averageSpeed === maxSpeed && stages.length > 1,
                color: "#333333",
              },
              {
                val: formatElevationCompact(stage.elevationGain, units),
                bold: stage.elevationGain === maxGain && stages.length > 1,
                color: "#333333",
              },
            ];

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  height: `${rowHeight}px`,
                  borderBottom: "1px solid #eeeeee",
                  alignItems: "center",
                }}
              >
                {values.map((item, j) => (
                  <div
                    key={j}
                    style={{
                      width: columns[j].width,
                      textAlign: columns[j].align,
                      marginLeft: columns[j].marginLeft || 0,
                      fontSize: `${fontSize}px`,
                      fontFamily: "Helvetica",
                      fontWeight: item.bold ? 700 : 300,
                      color: item.color,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {item.val}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
