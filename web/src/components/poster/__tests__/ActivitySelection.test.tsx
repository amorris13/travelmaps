import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PosterMap } from "../PosterMap";
import React from "react";

// Mock the dependencies
vi.mock("@lib/geo", () => ({
  computeBoundsFromPolylines: vi.fn(() => ({ west: 0, east: 1, south: 0, north: 1 })),
  computeMapTransform: vi.fn(() => ({
    transform: { translateX: 0, translateY: 0, scale: 1 },
    expandedBbox: { x: 0, y: 0, width: 1, height: 1 }
  })),
  decodePolyline: vi.fn((p) => p ? [{ lat: 0, lng: 0 }] : []),
  pathFromPolyline: vi.fn((decoded) => decoded.length > 0 ? "M 0 0 L 1 1" : ""),
  toMercator: vi.fn((ll) => ({ x: ll.lng, y: ll.lat })),
  applyTransform: vi.fn((p) => p),
  roundPoint: vi.fn((p) => p),
}));

vi.mock("@lib/labels", () => ({
  calculateBestLabelPositions: vi.fn(() => ({
    result: [],
    numberOfIntersections: 0,
    averageOffset: 0,
    labelSeparationScore: 0,
    labelProminenceScore: 0,
  })),
}));

vi.mock("svg-intersections", () => ({
  shape: vi.fn(),
  intersect: vi.fn(),
}));

describe("PosterMap Selection Fix", () => {
  it("should render all stages when multiple are provided", () => {
    const stages = [
      { activityId: "1", polyline: "poly1", startLabel: "A", endLabel: "B", isContinuousWithPrev: false } as any,
      { activityId: "2", polyline: "poly2", startLabel: "B", endLabel: "C", isContinuousWithPrev: true } as any,
    ];

    const { container } = render(
      <svg>
        <PosterMap
          stages={stages}
          accentColor="#ff0000"
          y={0}
          width={500}
          height={500}
        />
      </svg>
    );

    // In PosterMap.tsx, route lines are rendered with strokeWidth={3} and strokeDasharray="6 6"
    const routePaths = container.querySelectorAll('path[stroke-width="3"][stroke-dasharray="6 6"]');
    expect(routePaths.length).toBe(2);

    // Waypoint markers (dots)
    const markers = container.querySelectorAll('circle');
    // Stage 1: startLabel (A), endLabel (B) -> 2 points
    // Stage 2: isContinuousWithPrev: true, so startLabel is skipped. endLabel (C) -> 1 point
    // Total markers: 3
    expect(markers.length).toBe(3);
  });
});
