import type { StageConfig } from "@lib/types";
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  formatPace,
  formatElevation,
  totalDistance,
  totalDuration,
  totalElevation,
  averageSpeed,
  usePace,
  isCycling,
} from "@/lib/poster-config";
import React from "react";

interface PosterStatsHtmlProps {
  stages: StageConfig[];
  accentColor: string;
  units?: "metric" | "imperial";
  showSeconds?: boolean;
}

export function PosterStatsHtml({
  stages,
  accentColor,
  units = "metric",
  showSeconds = false,
}: PosterStatsHtmlProps) {
  const isPace =
    stages.length > 0 && stages.every((s) => usePace(s.activityType));
  const allCycling =
    stages.length > 0 && stages.every((s) => isCycling(s.activityType));
  const avgSpeed = averageSpeed(stages);

  const stats = [
    { label: "DISTANCE", value: formatDistance(totalDistance(stages), units) },
    {
      label: allCycling ? "SADDLE TIME" : "TIME",
      value: formatDuration(totalDuration(stages), showSeconds),
    },
    {
      label: isPace ? "AVERAGE PACE" : "AVERAGE SPEED",
      value: isPace ? formatPace(avgSpeed, units) : formatSpeed(avgSpeed, units),
    },
    {
      label: "ELEVATION GAIN",
      value: formatElevation(totalElevation(stages), units),
    },
  ];

  const valueFontSize = 33.6;
  const labelFontSize = 12.8;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "88%",
          height: "0.5px",
          backgroundColor: "#d0d0d0",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          width: "88%",
          padding: "24px 0",
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Montserrat",
                fontSize: `${valueFontSize}px`,
                fontWeight: 700,
                color: "#1a1a1a",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Montserrat",
                fontSize: `${labelFontSize}px`,
                fontWeight: 400,
                color: "#999999",
                letterSpacing: "0.18em",
                marginTop: "8px",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          width: "88%",
          height: "0.5px",
          backgroundColor: "#d0d0d0",
        }}
      />
    </div>
  );
}
