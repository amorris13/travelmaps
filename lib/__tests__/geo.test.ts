import { describe, it, expect } from "vitest";
import {
  toMercator,
  fromMercator,
  latlngToMercatorBbox,
  decodePolyline,
  computeTripBounds,
  computeBoundsFromPolylines,
  latLngDistance,
  findPointAtFraction,
  toSnakeCase,
  round,
  distanceBetweenPoints,
  pathFromPolyline,
  computeMapTransform,
  applyTransform,
} from "../geo";

describe("toMercator / fromMercator", () => {
  it("should be inverse operations (round-trip)", () => {
    const latlng = { lat: 51.5074, lng: -0.1278 }; // London
    const merc = toMercator(latlng);
    const result = fromMercator(merc);
    expect(result.lat).toBeCloseTo(latlng.lat, 5);
    expect(result.lng).toBeCloseTo(latlng.lng, 5);
  });

  it("should handle equator/prime meridian", () => {
    const latlng = { lat: 0, lng: 0 };
    const merc = toMercator(latlng);
    expect(merc.x).toBe(0);
    expect(merc.y).toBeCloseTo(0, 10);
    const result = fromMercator(merc);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeCloseTo(0, 5);
  });

  it("should invert Y axis (north is negative)", () => {
    const north = toMercator({ lat: 60, lng: 0 });
    const south = toMercator({ lat: -60, lng: 0 });
    expect(north.y).toBeLessThan(south.y);
  });
});

describe("latlngToMercatorBbox", () => {
  it("should compute correct bounding box", () => {
    const bounds = { north: 52, south: 48, east: 2, west: -2 };
    const bbox = latlngToMercatorBbox(bounds);
    expect(bbox.width).toBeGreaterThan(0);
    expect(bbox.height).toBeGreaterThan(0);
    expect(bbox.cx).toBeCloseTo(0, 1); // Centered on prime meridian
  });
});

describe("decodePolyline", () => {
  it("should decode a known polyline", () => {
    // Simple polyline encoding for [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const decoded = decodePolyline(encoded);
    expect(decoded).toHaveLength(3);
    expect(decoded[0].lat).toBeCloseTo(38.5, 1);
    expect(decoded[0].lng).toBeCloseTo(-120.2, 1);
  });
});

describe("computeTripBounds", () => {
  it("should compute bounds from trip stages", () => {
    const trip = {
      name: "Test",
      startDate: "2024-01-01",
      endDate: "2024-01-02",
      hideLabel: false,
      stages: [
        { endLocation: { name: "A", latlng: { lat: 50, lng: -1 } } },
        { endLocation: { name: "B", latlng: { lat: 52, lng: 2 } } },
      ],
    };
    const bounds = computeTripBounds(trip);
    expect(bounds.north).toBe(52);
    expect(bounds.south).toBe(50);
    expect(bounds.east).toBe(2);
    expect(bounds.west).toBe(-1);
  });

  it("should return zero bounds for empty trip", () => {
    const trip = {
      name: "Empty",
      startDate: "2024-01-01",
      endDate: "2024-01-01",
      hideLabel: false,
      stages: [],
    };
    const bounds = computeTripBounds(trip);
    expect(bounds.north).toBe(0);
    expect(bounds.south).toBe(0);
  });
});

describe("computeBoundsFromPolylines", () => {
  it("should compute bounds from encoded polylines", () => {
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const bounds = computeBoundsFromPolylines([encoded]);
    expect(bounds.south).toBeCloseTo(38.5, 0);
    expect(bounds.north).toBeCloseTo(43.25, 0);
  });

  it("should return zero for empty input", () => {
    const bounds = computeBoundsFromPolylines([]);
    expect(bounds.north).toBe(0);
  });
});

describe("latLngDistance", () => {
  it("should compute correct distance between London and Paris", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    const dist = latLngDistance(london, paris);
    // ~343 km
    expect(dist).toBeGreaterThan(340000);
    expect(dist).toBeLessThan(350000);
  });

  it("should return 0 for same point", () => {
    const p = { lat: 40, lng: -74 };
    expect(latLngDistance(p, p)).toBe(0);
  });
});

describe("findPointAtFraction", () => {
  it("should return start point at fraction 0", () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ];
    const result = findPointAtFraction(points, 0);
    expect(result!.lat).toBe(0);
    expect(result!.lng).toBe(0);
  });

  it("should return end point at fraction 1", () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ];
    const result = findPointAtFraction(points, 1);
    expect(result!.lat).toBe(1);
    expect(result!.lng).toBe(1);
  });

  it("should return midpoint at fraction 0.5", () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
    ];
    const result = findPointAtFraction(points, 0.5);
    expect(result!.lat).toBeCloseTo(5, 0);
  });
});

describe("utilities", () => {
  it("toSnakeCase converts correctly", () => {
    expect(toSnakeCase("London to Rome")).toBe("london_to_rome");
    expect(toSnakeCase("CamelCase")).toBe("camel_case");
  });

  it("round works correctly", () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.14159, 4)).toBe(3.1416);
  });

  it("distanceBetweenPoints works", () => {
    expect(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("computeMapTransform", () => {
  it("should produce a transform that maps bounds to canvas", () => {
    const bounds = { north: 52, south: 48, east: 2, west: -2 };
    const { transform, expandedBbox } = computeMapTransform(bounds, 1200);
    expect(expandedBbox.width).toBeGreaterThan(0);
    expect(transform.scale).toBeGreaterThan(0);

    // The center of bounds should map near the center of canvas
    const center = toMercator({ lat: 50, lng: 0 });
    const mapped = applyTransform(center, transform);
    expect(mapped.x).toBeCloseTo(600, -2); // Near center
    expect(mapped.y).toBeCloseTo(600, -2); // Mercator distortion means not exactly centered
  });
});

describe("pathFromPolyline", () => {
  it("should generate SVG path from polyline", () => {
    const bounds = { north: 52, south: 48, east: 2, west: -2 };
    const { transform } = computeMapTransform(bounds, 1200);
    const points = [
      { lat: 50, lng: -1 },
      { lat: 50, lng: 0 },
      { lat: 50, lng: 1 },
    ];
    const path = pathFromPolyline(points, transform);
    expect(path).toContain("M");
    expect(path.length).toBeGreaterThan(0);
  });

  it("should return empty string for empty polyline", () => {
    const transform = { translateX: 0, translateY: 0, scale: 1 };
    expect(pathFromPolyline([], transform)).toBe("");
  });
});
