import type { PosterConfig } from "@lib/types";

interface PosterTitleHtmlProps {
  title: string;
  dateRange: string;
  accentColor: string;
}

export function PosterTitleHtml({
  title,
  dateRange,
  accentColor,
}: PosterTitleHtmlProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          fontFamily: "Montserrat",
          fontSize: "84px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "#1a1a1a",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>
      {dateRange && (
        <div
          style={{
            fontFamily: "Helvetica",
            fontSize: "18.5px", // 84 * 0.22
            fontWeight: 400,
            letterSpacing: "0.2em",
            color: accentColor,
            textTransform: "uppercase",
            marginTop: "12px",
          }}
        >
          {dateRange}
        </div>
      )}
    </div>
  );
}
