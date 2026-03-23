import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { Poster } from "../Poster";
import { testConfigs } from "./test-configs";
import { comparePngs } from "./visual-regression.utils";

// Directory for storing golden images (snapshots)
const SNAPSHOTS_DIR = path.resolve(__dirname, "__snapshots__");
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Load fonts from the project's fonts directory for consistent rendering
const FONTS_DIR = path.resolve(__dirname, "../../../../fonts");
const fontFiles = fs
  .readdirSync(FONTS_DIR)
  .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
  .map((f) => path.join(FONTS_DIR, f));

describe("Poster Visual Regression", () => {
  beforeAll(() => {
    // Mock fetch for map tiles and geocoding
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/map-tile")) {
        // Return a 1x1 transparent PNG buffer
        const transparentPng = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64"
        );
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob([transparentPng], { type: "image/png" })),
          arrayBuffer: () => Promise.resolve(transparentPng.buffer),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any);
    });

    // Mock URL methods for JSDOM
    global.URL.createObjectURL = vi.fn();
    global.URL.revokeObjectURL = vi.fn();
  });

  Object.entries(testConfigs).forEach(([name, config]) => {
    it(`renders "${name}" correctly`, async () => {
      const { container } = render(<Poster config={config} />);

      // Wait for the 500ms debounce in PosterMap to complete
      // Since we are NOT using fake timers here (as it might interfere with other things),
      // we use waitFor with a long timeout.
      await waitFor(() => {
        const svg = container.querySelector("svg");
        expect(svg).toBeTruthy();
        // The PosterMap component updates labelPlacements after 500ms
        // We can't easily check for labelPlacements directly, but we can wait.
      }, { timeout: 2000 });

      // Actually wait for real time if necessary, or just wait for the element to be stable
      await new Promise(resolve => setTimeout(resolve, 600));

      const svgElement = container.querySelector("svg")!;
      const svgString = svgElement.outerHTML;

      // Render SVG to PNG using resvg-js (same as the app's export API)
      const resvg = new Resvg(svgString, {
        fitTo: { mode: "width", value: 1200 },
        font: {
          fontFiles,
          loadSystemFonts: false,
          sansSerifFamily: "Liberation Sans",
          serifFamily: "Liberation Serif",
          defaultFontFamily: "Liberation Sans",
        },
      });

      const pngBuffer = resvg.render().asPng();
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
