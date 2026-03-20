import type { StageConfig } from "@lib/types";
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  formatElevation,
  totalDistance,
  totalDuration,
  totalElevation,
  averageSpeed,
} from "@/lib/poster-config";

interface PosterStatsProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
}

export function PosterStats({ stages, accentColor, y, width }: PosterStatsProps) {
  const stats = [
    { label: "DISTANCE", value: formatDistance(totalDistance(stages)) },
    { label: "DURATION", value: formatDuration(totalDuration(stages)) },
    { label: "AVG SPEED", value: formatSpeed(averageSpeed(stages)) },
    { label: "ELEVATION", value: formatElevation(totalElevation(stages)) },
  ];

  const padding = width * 0.06;
  const availableWidth = width - padding * 2;
  const columnWidth = availableWidth / stats.length;
  const valueFontSize = width * 0.025;
  const labelFontSize = valueFontSize * 0.55;

  return (
    <g transform={`translate(0, ${y})`}>
      <line
        x1={padding}
        y1={0}
        x2={width - padding}
        y2={0}
        stroke="#e0e0e0"
        strokeWidth={0.5}
      />
      {stats.map((stat, i) => {
        const cx = padding + columnWidth * i + columnWidth / 2;
        return (
          <g key={stat.label}>
            <text
              x={cx}
              y={valueFontSize * 1.5}
              textAnchor="middle"
              fill="#1a1a1a"
              fontFamily="Helvetica Neue, Helvetica, sans-serif"
              fontSize={valueFontSize}
              fontWeight={300}
            >
              {stat.value}
            </text>
            <text
              x={cx}
              y={valueFontSize * 1.5 + labelFontSize * 1.8}
              textAnchor="middle"
              fill="#999999"
              fontFamily="Helvetica Neue, Helvetica, sans-serif"
              fontSize={labelFontSize}
              fontWeight={300}
              letterSpacing="0.15em"
            >
              {stat.label}
            </text>
          </g>
        );
      })}
      <line
        x1={padding}
        y1={valueFontSize * 1.5 + labelFontSize * 3.2}
        x2={width - padding}
        y2={valueFontSize * 1.5 + labelFontSize * 3.2}
        stroke="#e0e0e0"
        strokeWidth={0.5}
      />
    </g>
  );
}
