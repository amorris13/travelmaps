import { describe, it, expect } from "vitest";
import {
  computeElevationProfile,
  mixColors,
  parseToRgb,
  rgbToHex,
} from "../elevation";

describe("color helpers", () => {
  it("parseToRgb should parse hex colors", () => {
    expect(parseToRgb("#C61016")).toEqual({ r: 198, g: 16, b: 22 });
    expect(parseToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("rgbToHex should convert back to hex", () => {
    expect(rgbToHex({ r: 198, g: 16, b: 22 })).toBe("#c61016");
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
  });

  it("mixColors should blend colors", () => {
    // 50/50 mix of black and white should be gray
    const result = mixColors("#000000", "#ffffff", 0.5);
    const rgb = parseToRgb(result);
    expect(rgb.r).toBeCloseTo(128, -1);
    expect(rgb.g).toBeCloseTo(128, -1);
    expect(rgb.b).toBeCloseTo(128, -1);
  });

  it("mixColors ratio 1 returns first color", () => {
    expect(mixColors("#ff0000", "#0000ff", 1)).toBe("#ff0000");
  });

  it("mixColors ratio 0 returns second color", () => {
    expect(mixColors("#ff0000", "#0000ff", 0)).toBe("#0000ff");
  });
});

describe("computeElevationProfile", () => {
  const sampleElevation = [100, 200, 350, 300, 150, 100];
  const sampleDistance = [0, 1000, 2000, 3000, 4000, 5000];
  const sampleSegments = [{ elevationStream: sampleElevation, distanceStream: sampleDistance }];

  it("should compute basic profile data", () => {
    const result = computeElevationProfile(
      sampleSegments,
      600,
      200
    );
    expect(result.svgWidth).toBeGreaterThan(0);
    expect(result.svgHeight).toBeGreaterThan(0);
    expect(result.profileSegments[0].length).toBeGreaterThan(0);
    expect(result.maxElevation).toBe(350);
  });

  it("should identify correct max elevation index", () => {
    const result = computeElevationProfile(
      sampleSegments,
      600,
      200
    );
    expect(result.maxElevationIndex).toBe(2); // index of 350
  });

  it("should compute key elevations", () => {
    const result = computeElevationProfile(
      sampleSegments,
      600,
      200,
      { showKeyElevations: true }
    );
    expect(result.keyElevations.start).toBe(100);
    expect(result.keyElevations.peak).toBe(350);
    expect(result.keyElevations.end).toBe(100);
  });

  it("should handle stage markers", () => {
    const result = computeElevationProfile(
      sampleSegments,
      600,
      200,
      {
        stageMarkers: [
          { distance: 0, label: "1" },
          { distance: 2500, label: "2" },
        ],
      }
    );
    expect(result.stageMarkerPositions).toHaveLength(2);
    expect(result.stageMarkerPositions[0].label).toBe("1");
  });

  it("should compute prominent elevation labels", () => {
    // Create data with a clear prominent peak
    const elevation = [0, 50, 100, 500, 100, 50, 0];
    const distance = [0, 100, 200, 300, 400, 500, 600];
    const result = computeElevationProfile([{ elevationStream: elevation, distanceStream: distance }], 600, 200, {
      labelProminentElevations: { minProminence: 100 },
    });
    expect(result.prominentLabels.length).toBeGreaterThan(0);
    // The 500m peak should be labeled
    expect(result.prominentLabels.some((l) => l.elevation === 500)).toBe(true);
  });

  it("should clamp negative elevations to 0", () => {
    const elevation = [-50, 100, 200];
    const distance = [0, 100, 200];
    const result = computeElevationProfile([{ elevationStream: elevation, distanceStream: distance }], 600, 200);
    // Max elevation should still be 200 (clamped input)
    expect(result.keyElevations.start).toBe(0); // -50 clamped to 0
    expect(result.keyElevations.peak).toBe(200);
  });

  it("should handle gaps between non-continuous segments", () => {
    const segments = [
      { elevationStream: [100, 150], distanceStream: [0, 1000], isContinuousWithNext: false },
      { elevationStream: [200, 250], distanceStream: [0, 1000] },
    ];
    const result = computeElevationProfile(segments, 600, 200);
    expect(result.profileSegments).toHaveLength(2);
    // Gap should be 1% of 2000 (total distance) = 20
    // Segment 1 ends at 1000
    // Segment 2 starts at 1000 + 20 = 1020
    // Total maxDistance = 1020 + 1000 = 2020
    expect(result.allPoints[2].x).toBeGreaterThan(result.allPoints[1].x);
  });

  it("should generate gradient colors from accent", () => {
    const result = computeElevationProfile(
      sampleSegments,
      600,
      200,
      undefined,
      "#C61016"
    );
    expect(result.gradientStartColor).toBeTruthy();
    expect(result.gradientEndColor).toBeTruthy();
    expect(result.accentColor).toBe("#C61016");
  });
});
