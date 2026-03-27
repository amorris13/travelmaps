import { describe, it, expect } from "vitest";
import { calculateBestLabelPositions, shapeForLabel } from "../labels";
import type { LabelPoint } from "../types";

describe("shapeForLabel", () => {
  it("should create a shape from a rectangle", () => {
    const rect = { x: 10, y: 20, width: 100, height: 18 };
    const s = shapeForLabel(rect);
    expect(s).toBeDefined();
  });
});

describe("calculateBestLabelPositions", () => {
  it("should place a single label", () => {
    const labels: LabelPoint[] = [
      { name: "London", point: { x: 500, y: 500 } },
    ];
    const result = calculateBestLabelPositions(
      labels,
      32,
      18,
      [], // no shapes to avoid
      1200,
      1200
    );
    expect(result.result).toHaveLength(1);
    expect(result.result[0].label.name).toBe("London");
    expect(result.numberOfIntersections).toBe(0);
  });

  it("should place multiple non-overlapping labels", () => {
    const labels: LabelPoint[] = [
      { name: "London", point: { x: 200, y: 200 } },
      { name: "Paris", point: { x: 800, y: 800 } },
    ];
    const result = calculateBestLabelPositions(labels, 32, 18, [], 1200, 1200);
    expect(result.result).toHaveLength(2);
    // Labels are far apart, so no intersections expected
    expect(result.numberOfIntersections).toBe(0);
  });

  it("should produce deterministic results (same seed)", () => {
    const labels: LabelPoint[] = [
      { name: "A", point: { x: 300, y: 300 } },
      { name: "B", point: { x: 320, y: 310 } },
      { name: "C", point: { x: 340, y: 290 } },
    ];
    const result1 = calculateBestLabelPositions(labels, 32, 18, [], 1200, 1200);
    const result2 = calculateBestLabelPositions(labels, 32, 18, [], 1200, 1200);

    // Same seed "travelmaps" should produce same result
    expect(result1.result.length).toBe(result2.result.length);
    for (let i = 0; i < result1.result.length; i++) {
      expect(result1.result[i].offsetPoint.x).toBe(
        result2.result[i].offsetPoint.x
      );
      expect(result1.result[i].offsetPoint.y).toBe(
        result2.result[i].offsetPoint.y
      );
    }
  });

  it("should handle empty labels", () => {
    const result = calculateBestLabelPositions([], 32, 18, [], 1200, 1200);
    expect(result.result).toHaveLength(0);
    expect(result.numberOfIntersections).toBe(0);
  });

  it("should skip labels with empty names", () => {
    const labels: LabelPoint[] = [
      { name: "", point: { x: 500, y: 500 } },
      { name: "Valid", point: { x: 600, y: 600 } },
    ];
    const result = calculateBestLabelPositions(labels, 32, 18, [], 1200, 1200);
    expect(result.result).toHaveLength(1);
    expect(result.result[0].label.name).toBe("Valid");
  });
});
