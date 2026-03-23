/**
 * Visual regression tests for the export pipeline.
 *
 * Golden PNGs live in ./goldens/. To regenerate them:
 *   UPDATE_GOLDENS=true npm test
 */
import { describe, it, expect } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import path from "path";
import fs from "fs";

const fontsDir = path.join(process.cwd(), "fonts");
const goldensDir = path.join(__dirname, "goldens");

function renderSvgToPng(svgString: string, width: number): Buffer {
  const fontFiles = fs
    .readdirSync(fontsDir)
    .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
    .map((f) => path.join(fontsDir, f));

  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles,
      loadSystemFonts: false,
      sansSerifFamily: "Liberation Sans",
      serifFamily: "Liberation Serif",
      defaultFontFamily: "Liberation Sans",
    },
  });
  return Buffer.from(resvg.render().asPng());
}

function assertMatchesGolden(name: string, actual: Buffer): void {
  const goldenPath = path.join(goldensDir, `${name}.png`);

  if (process.env.UPDATE_GOLDENS === "true") {
    fs.writeFileSync(goldenPath, actual);
    return;
  }

  if (!fs.existsSync(goldenPath)) {
    throw new Error(
      `Golden file not found: ${goldenPath}\n` +
        `Run with UPDATE_GOLDENS=true to generate it.`
    );
  }

  const expected = fs.readFileSync(goldenPath);
  expect(actual.equals(expected)).toBe(true);
}

// SVG fixtures

const SIMPLE_SHAPES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f0f4f8"/>
  <rect x="20" y="20" width="120" height="80" fill="#e53e3e" rx="8"/>
  <circle cx="220" cy="60" r="50" fill="#3182ce"/>
  <polygon points="320,20 380,100 260,100" fill="#38a169"/>
  <ellipse cx="80" cy="200" rx="60" ry="40" fill="#d69e2e"/>
  <line x1="180" y1="160" x2="360" y2="260" stroke="#805ad5" stroke-width="4"/>
  <rect x="180" y="180" width="80" height="80" fill="none" stroke="#e53e3e" stroke-width="3" rx="4"/>
</svg>`;

const TEXT_RENDERING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#1a202c"/>
  <text x="20" y="60" font-family="Liberation Sans" font-size="28" font-weight="bold" fill="white">
    Travel Map
  </text>
  <text x="20" y="100" font-family="Liberation Sans" font-size="16" fill="#a0aec0">
    Sans-serif regular
  </text>
  <text x="20" y="140" font-family="Liberation Serif" font-size="20" font-weight="bold" fill="#fbd38d">
    Serif Bold Title
  </text>
  <text x="20" y="175" font-family="Liberation Serif" font-size="14" fill="#90cdf4">
    Serif regular body text
  </text>
  <text x="20" y="230" font-family="Liberation Sans" font-size="12" fill="#68d391">
    2019 · 12 countries · 24,000 km
  </text>
  <text x="20" y="270" font-family="Liberation Sans" font-size="10" fill="#fc8181">
    SMALL CAPS LABEL
  </text>
</svg>`;

const MAP_ROUTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#2d3748"/>
  <!-- Ocean / water background -->
  <rect width="400" height="300" fill="#2b6cb0" opacity="0.3"/>
  <!-- Simplified land masses -->
  <path d="M 0 120 Q 60 80 120 110 Q 180 140 200 100 Q 240 60 280 90 Q 320 120 360 100 L 400 110 L 400 300 L 0 300 Z"
        fill="#4a5568"/>
  <!-- Travel route -->
  <polyline
    points="30,200 80,180 130,160 170,140 210,130 250,145 290,135 330,120 370,130"
    fill="none" stroke="#fc8181" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Waypoint dots -->
  <circle cx="30"  cy="200" r="5" fill="#fc8181"/>
  <circle cx="130" cy="160" r="5" fill="#fc8181"/>
  <circle cx="210" cy="130" r="5" fill="#fc8181"/>
  <circle cx="330" cy="120" r="5" fill="#fc8181"/>
  <circle cx="370" cy="130" r="5" fill="#fc8181"/>
  <!-- Labels -->
  <text x="25"  y="218" font-family="Liberation Sans" font-size="9" fill="white">Start</text>
  <text x="125" y="178" font-family="Liberation Sans" font-size="9" fill="white">Stop 1</text>
  <text x="205" y="148" font-family="Liberation Sans" font-size="9" fill="white">Stop 2</text>
  <text x="325" y="138" font-family="Liberation Sans" font-size="9" fill="white">Stop 3</text>
  <text x="355" y="148" font-family="Liberation Sans" font-size="9" fill="white">End</text>
</svg>`;

const POSTER_LAYOUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560">
  <!-- Background -->
  <rect width="400" height="560" fill="#fffaf0"/>
  <!-- Header bar -->
  <rect width="400" height="70" fill="#c53030"/>
  <text x="200" y="30" font-family="Liberation Serif" font-size="22" font-weight="bold"
        fill="white" text-anchor="middle">EUROPE 2023</text>
  <text x="200" y="56" font-family="Liberation Sans" font-size="11"
        fill="#fed7d7" text-anchor="middle">JUNE · JULY · AUGUST</text>
  <!-- Map area -->
  <rect x="20" y="90" width="360" height="360" fill="#dbeafe" rx="4"/>
  <!-- Simplified country outlines -->
  <path d="M 60 200 Q 100 160 160 170 Q 220 180 260 160 Q 300 140 340 160
           Q 360 170 360 200 Q 340 240 300 250 Q 260 260 220 250
           Q 180 240 140 260 Q 100 270 60 250 Z"
        fill="#93c5fd" stroke="#3b82f6" stroke-width="1"/>
  <!-- Route line -->
  <polyline
    points="80,230 120,210 170,200 210,195 250,200 290,190 330,200"
    fill="none" stroke="#c53030" stroke-width="2.5" stroke-linecap="round"/>
  <!-- City dots -->
  <circle cx="80"  cy="230" r="4" fill="#c53030"/>
  <circle cx="170" cy="200" r="4" fill="#c53030"/>
  <circle cx="250" cy="200" r="4" fill="#c53030"/>
  <circle cx="330" cy="200" r="4" fill="#c53030"/>
  <!-- City labels -->
  <text x="85"  y="228" font-family="Liberation Sans" font-size="9" fill="#1e3a5f">Lisbon</text>
  <text x="175" y="198" font-family="Liberation Sans" font-size="9" fill="#1e3a5f">Paris</text>
  <text x="255" y="198" font-family="Liberation Sans" font-size="9" fill="#1e3a5f">Berlin</text>
  <text x="335" y="198" font-family="Liberation Sans" font-size="9" fill="#1e3a5f">Warsaw</text>
  <!-- Stats footer -->
  <rect x="20" y="468" width="360" height="72" fill="#fff5f5" rx="4" stroke="#fed7d7" stroke-width="1"/>
  <text x="200" y="492" font-family="Liberation Sans" font-size="10" fill="#718096" text-anchor="middle">JOURNEY STATS</text>
  <text x="80"  y="518" font-family="Liberation Serif" font-size="18" font-weight="bold" fill="#c53030" text-anchor="middle">12</text>
  <text x="80"  y="530" font-family="Liberation Sans" font-size="8" fill="#718096" text-anchor="middle">COUNTRIES</text>
  <text x="200" y="518" font-family="Liberation Serif" font-size="18" font-weight="bold" fill="#c53030" text-anchor="middle">8,400</text>
  <text x="200" y="530" font-family="Liberation Sans" font-size="8" fill="#718096" text-anchor="middle">KM</text>
  <text x="320" y="518" font-family="Liberation Serif" font-size="18" font-weight="bold" fill="#c53030" text-anchor="middle">84</text>
  <text x="320" y="530" font-family="Liberation Sans" font-size="8" fill="#718096" text-anchor="middle">DAYS</text>
</svg>`;

const FIXTURES: { name: string; svg: string; width: number }[] = [
  { name: "simple-shapes", svg: SIMPLE_SHAPES_SVG, width: 600 },
  { name: "text-rendering", svg: TEXT_RENDERING_SVG, width: 600 },
  { name: "map-route", svg: MAP_ROUTE_SVG, width: 600 },
  { name: "poster-layout", svg: POSTER_LAYOUT_SVG, width: 600 },
];

describe("export visual regression", () => {
  for (const { name, svg, width } of FIXTURES) {
    it(`renders ${name} to PNG`, () => {
      const png = renderSvgToPng(svg, width);
      expect(png.length).toBeGreaterThan(0);
      assertMatchesGolden(name, png);
    });
  }
});
