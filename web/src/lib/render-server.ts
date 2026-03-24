import path from "path";
import fs from "fs";
import { Resvg } from "@resvg/resvg-js";

// Load bundled fonts so Vercel (which has no system fonts) can render text.
function getFontFiles() {
  // Use web/fonts if it exists (for local tests from root), otherwise try fonts (for Vercel)
  let fontsDir = path.join(process.cwd(), "fonts");
  if (!fs.existsSync(fontsDir)) {
    fontsDir = path.join(process.cwd(), "web/fonts");
  }

  if (!fs.existsSync(fontsDir)) {
    return [];
  }

  return fs
    .readdirSync(fontsDir)
    .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
    .map((f) => path.join(fontsDir, f));
}

const fontFiles = getFontFiles();

/**
 * Render an SVG string to a PNG buffer using resvg-js.
 * This logic is used by both the export API and visual regression tests.
 */
export function renderSvgToPng(svgString: string, width: number): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles,
      loadSystemFonts: false,
      // Map generic families to the Liberation fonts we bundle
      sansSerifFamily: "Liberation Sans",
      serifFamily: "Liberation Serif",
      defaultFontFamily: "Liberation Sans",
    },
  });
  return resvg.render().asPng();
}
