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
} from "@/lib/poster-config";

interface PosterStatsProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
  units?: "metric" | "imperial";
}

export function PosterStats({
  stages,
  accentColor,
  y,
  width,
  units = "metric",
}: PosterStatsProps) {
  const isPace =
    stages.length > 0 && stages.every((s) => usePace(s.activityType));
  const avgSpeed = averageSpeed(stages);

  const stats = [
    { label: "DISTANCE", value: formatDistance(totalDistance(stages), units) },
    { label: "SADDLE TIME", value: formatDuration(totalDuration(stages)) },
    {
      label: isPace ? "AVERAGE PACE" : "AVERAGE SPEED",
      value: isPace ? formatPace(avgSpeed, units) : formatSpeed(avgSpeed, units),
    },
    {
      label: "ELEVATION GAIN",
      value: formatElevation(totalElevation(stages), units),
    },
  ];

  const padding = width * 0.06;
  const availableWidth = width - padding * 2;
  const columnWidth = availableWidth / stats.length;
  const valueFontSize = width * 0.028;
  const labelFontSize = valueFontSize * 0.38;

  return (
    <g transform={`translate(0, ${y})`}>
      <line
        x1={padding}
        y1={0}
        x2={width - padding}
        y2={0}
        stroke="#d0d0d0"
        strokeWidth={0.5}
      />
      {stats.map((stat, i) => {
        const cx = padding + columnWidth * i + columnWidth / 2;
        return (
          <g key={stat.label}>
            <text
              x={cx}
              y={valueFontSize * 1.6}
              textAnchor="middle"
              fill="#1a1a1a"
              fontFamily="Montserrat, sans-serif"
              fontSize={valueFontSize}
              fontWeight={700}
            >
              {stat.value}
            </text>
            <text
              x={cx}
              y={valueFontSize * 1.6 + labelFontSize * 2.2}
              textAnchor="middle"
              fill="#999999"
              fontFamily="Montserrat, sans-serif"
              fontSize={labelFontSize}
              fontWeight={400}
              letterSpacing="0.18em"
            >
              {stat.label}
            </text>
          </g>
        );
      })}
      <line
        x1={padding}
        y1={valueFontSize * 1.6 + labelFontSize * 4.0}
        x2={width - padding}
        y2={valueFontSize * 1.6 + labelFontSize * 4.0}
        stroke="#d0d0d0"
        strokeWidth={0.5}
      />
    </g>
  );
}
