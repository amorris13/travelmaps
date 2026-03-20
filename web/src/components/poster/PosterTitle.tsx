interface PosterTitleProps {
  title: string;
  dateRange: string;
  accentColor: string;
  width: number;
}

export function PosterTitle({
  title,
  dateRange,
  accentColor,
  width,
}: PosterTitleProps) {
  const titleFontSize = Math.min(width * 0.06, 72);
  const dateFontSize = titleFontSize * 0.35;

  return (
    <g>
      <text
        x={width / 2}
        y={titleFontSize * 1.2}
        textAnchor="middle"
        fill={accentColor}
        fontFamily="Helvetica Neue, Helvetica, sans-serif"
        fontSize={titleFontSize}
        fontWeight={300}
        letterSpacing="0.05em"
      >
        {title}
      </text>
      {dateRange && (
        <text
          x={width / 2}
          y={titleFontSize * 1.2 + dateFontSize * 1.8}
          textAnchor="middle"
          fill="#666666"
          fontFamily="Helvetica Neue, Helvetica, sans-serif"
          fontSize={dateFontSize}
          fontWeight={300}
          letterSpacing="0.1em"
        >
          {dateRange.toUpperCase()}
        </text>
      )}
    </g>
  );
}
