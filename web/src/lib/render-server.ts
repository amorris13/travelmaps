import path from "path";
import fs from "fs";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { PosterHtml } from "@/components/poster/PosterHtml";
import type { PosterConfig } from "@lib/types";
import { POSTER_WIDTH, POSTER_HEIGHT } from "@lib/constants";
import React from "react";

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
 * Render the PosterHtml component to an SVG string using satori.
 */
export async function renderPosterToSvg(config: PosterConfig): Promise<string> {
  const montserratRegular = fs.readFileSync(
    path.join(
      process.cwd(),
      fs.existsSync(path.join(process.cwd(), "web/fonts")) ? "web/fonts" : "fonts",
      "LiberationSans-Regular.ttf"
    )
  );
  const montserratBold = fs.readFileSync(
    path.join(
      process.cwd(),
      fs.existsSync(path.join(process.cwd(), "web/fonts")) ? "web/fonts" : "fonts",
      "LiberationSans-Bold.ttf"
    )
  );

  // @ts-ignore
  global.window = undefined;

  return await satori(
    React.createElement(PosterHtml, { config }),
    {
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      fonts: [
        {
          name: "Montserrat",
          data: montserratRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Montserrat",
          data: montserratBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "Helvetica",
          data: montserratRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Helvetica",
          data: montserratBold,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );
}

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
