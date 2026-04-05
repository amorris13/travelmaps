import path from "path";
import fs from "fs";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { PosterHtml } from "@/components/poster/PosterHtml";
import type { PosterConfig } from "@lib/types";
import { POSTER_WIDTH, POSTER_HEIGHT, MAP_STYLES } from "@lib/constants";
import { computeBoundsFromPolylines, computeMapTransform } from "@lib/geo";
import { computeMapTileParams, buildMapTileUrl } from "@lib/map-tiles";
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
  // Pre-fetch map tile on server to provide as Data URI
  let mapTileUrl = "";
  try {
    const polylines = config.stages.map((s) => s.polyline).filter(Boolean);
    if (polylines.length > 0) {
      let bounds = computeBoundsFromPolylines(polylines);
      if (config.additionalLocations.length > 0) {
        let { west, east, south, north } = bounds;
        for (const loc of config.additionalLocations) {
          west = Math.min(west, loc.lng);
          east = Math.max(east, loc.lng);
          south = Math.min(south, loc.lat);
          north = Math.max(north, loc.lat);
        }
        bounds = { west, east, south, north };
      }

      // Height logic matching PosterHtml
      const padding = POSTER_WIDTH * 0.05;
      const showElevation = config.showElevation && config.stages.some((s) => s.elevationStream.length > 0);
      const showStageTable = config.showStageTable && config.stages.length > 1;
      const useSideBySide = showElevation && showStageTable && config.stages.length < 9;

      const mapHeight =
        POSTER_HEIGHT -
        (POSTER_HEIGHT * 0.1) -
        (POSTER_HEIGHT * 0.055) -
        (showElevation ? POSTER_HEIGHT * 0.1 : 0) -
        (useSideBySide ? 0 : (showStageTable ? 20 + Math.ceil(config.stages.length / 3) * 18 + 16 : 0)) -
        padding * 4;

      const sidePx = Math.min(POSTER_WIDTH, mapHeight);
      const { expandedBbox } = computeMapTransform(bounds, sidePx);

      const styleId = config.mapStyle && MAP_STYLES[config.mapStyle]
        ? MAP_STYLES[config.mapStyle].id
        : undefined;

      const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
      if (accessToken) {
        const params = computeMapTileParams(expandedBbox, accessToken, styleId, 1200);
        const remoteUrl = buildMapTileUrl(params);

        const response = await fetch(remoteUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          mapTileUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        }
      }
    }
  } catch (err) {
    console.error("Server-side map tile fetch failed:", err);
  }

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

  // No need to mock URLs here, the components handle it.

  return await satori(
    React.createElement(PosterHtml, { config, mapTileUrl }),
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
