import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import fs from "fs";
import path from "path";
import { PosterHtml as Poster } from "../PosterHtml";
import { testConfigs } from "./test-configs";
import { comparePngs } from "./visual-regression.utils";
import { renderSvgToPng, renderPosterToSvg } from "../../../lib/render-server";

// Directory for storing golden images (snapshots)
const SNAPSHOTS_DIR = path.resolve(__dirname, "__snapshots__");
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

/**
 * VISUAL REGRESSION TESTING
 *
 * To update golden images:
 * 1. Delete the existing PNG(s) in web/src/components/poster/__tests__/__snapshots__/
 * 2. Run the tests: npm test -- PosterExport
 * 3. The tests will regenerate the missing goldens.
 */

describe("Poster Visual Regression", () => {
  beforeAll(() => {
    // Set a dummy access token for tests to trigger map tile fetching
    process.env.MAPBOX_ACCESS_TOKEN = "pk.test-token";

    // Mock fetch for map tiles and geocoding
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      // Return a 10x10 solid light green PNG buffer for any image-like request
      const lightGreenPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYlWNk+M/wn4EYwMjIisv9AAL9CBVf3KviAAAAAElFTkSuQmCC",
        "base64"
      );

      const mockArrayBuffer = async () => {
        const ab = new ArrayBuffer(lightGreenPng.length);
        const view = new Uint8Array(ab);
        for (let i = 0; i < lightGreenPng.length; ++i) {
          view[i] = lightGreenPng[i];
        }
        return ab;
      };

      if (url.includes("/api/map-tile") || url.includes("mapbox.com")) {
        return {
          ok: true,
          blob: async () => new Blob([lightGreenPng], { type: "image/png" }),
          arrayBuffer: mockArrayBuffer,
        } as any;
      }

      return {
        ok: true,
        json: async () => ({}),
        arrayBuffer: mockArrayBuffer,
      } as any;
    }));

    // Mock URL methods for JSDOM
    global.URL.createObjectURL = vi.fn();
    global.URL.revokeObjectURL = vi.fn();
  });

  Object.entries(testConfigs).forEach(([name, config]) => {
    it(`renders "${name}" correctly`, async () => {
      // Use the production Satori-based pipeline to generate the SVG
      const svgString = await renderPosterToSvg(config);
      const pngBuffer = renderSvgToPng(svgString, 1200);
      const snapshotPath = path.join(SNAPSHOTS_DIR, `${name}.png`);

      if (!fs.existsSync(snapshotPath)) {
        // First run: save as golden version
        fs.writeFileSync(snapshotPath, pngBuffer);
        console.log(`Created golden image: ${snapshotPath}`);
        return;
      }

      // Subsequent runs: compare against golden version
      const goldenBuffer = fs.readFileSync(snapshotPath);
      const { mismatchedPixels, diffPng } = comparePngs(pngBuffer, goldenBuffer);

      if (mismatchedPixels > 0) {
        const diffPath = path.join(SNAPSHOTS_DIR, `${name}_diff.png`);
        const actualPath = path.join(SNAPSHOTS_DIR, `${name}_actual.png`);
        fs.writeFileSync(diffPath, diffPng);
        fs.writeFileSync(actualPath, pngBuffer);

        throw new Error(
          `Visual regression failed for "${name}": ${mismatchedPixels} pixels mismatched.\n` +
          `Difference image saved to ${diffPath}\n` +
          `Actual image saved to ${actualPath}`
        );
      }

      // If comparison passed, clean up any old actual/diff files
      const oldDiffPath = path.join(SNAPSHOTS_DIR, `${name}_diff.png`);
      const oldActualPath = path.join(SNAPSHOTS_DIR, `${name}_actual.png`);
      if (fs.existsSync(oldDiffPath)) fs.unlinkSync(oldDiffPath);
      if (fs.existsSync(oldActualPath)) fs.unlinkSync(oldActualPath);

      expect(mismatchedPixels).toBe(0);
    }, 10000); // 10s timeout per test
  });
});
