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
  const titleFontSize = Math.min(width * 0.07, 84);
  const dateFontSize = titleFontSize * 0.22;

  return (
    <g>
      <text
        x={width / 2}
        y={titleFontSize * 1.1}
        textAnchor="middle"
        fill="#1a1a1a"
        fontFamily="Montserrat, sans-serif"
        fontSize={titleFontSize}
        fontWeight={700}
        letterSpacing="0.18em"
      >
        {title.toUpperCase()}
      </text>
      {dateRange && (
        <text
          x={width / 2}
          y={titleFontSize * 1.1 + dateFontSize * 2.4}
          textAnchor="middle"
          fill={accentColor}
          fontFamily="Helvetica, sans-serif"
          fontSize={dateFontSize}
          fontWeight={400}
          letterSpacing="0.2em"
        >
          {dateRange.toUpperCase()}
        </text>
      )}
    </g>
  );
}
