export const ACCENT_COLOR = "#C61016";
export const FONT_FAMILY = "Helvetica";
export const FONT_FAMILY_LIGHT = "Helvetica Neue, sans-serif";
export const LABEL_FONT_SIZE_PX = 18;
export const MARKER_RADIUS = 5;
export const SIDE_PX = 1200;
export const EXPORT_PRECISION = 3;

// Poster dimensions (A2 proportions: 420x594mm ≈ 1:1.414)
export const POSTER_ASPECT_RATIO = 1.414;
export const POSTER_WIDTH = 1200;
export const POSTER_HEIGHT = Math.round(1200 * POSTER_ASPECT_RATIO);

// Elevation chart constants
export const ELEVATION_PADDING = 5;
export const KEY_ELEVATIONS_HEIGHT = 0;
export const STAGE_MARKERS_HEIGHT = 15;
export const PROMINENT_ELEVATION_LABELS_HEIGHT = 40;

// Map styles
export const MAP_STYLES: Record<string, { id: string; label: string }> = {
  muted: {
    id: "amorris13/clyk5oa2u01dw01rba38pe12t",
    label: "Muted",
  },
  outdoors: {
    id: "mapbox/outdoors-v12",
    label: "Outdoors",
  },
  satellite: {
    id: "mapbox/satellite-streets-v12",
    label: "Satellite",
  },
  dark: {
    id: "mapbox/dark-v11",
    label: "Dark",
  },
};

// Regions for overview maps
export const REGIONS: Record<
  string,
  { north: number; east: number; south: number; west: number; scale?: number }
> = {
  UK: { north: 61, east: 2.4, south: 49.4, west: -12, scale: 0.625 },
  Europe: { north: 63.3313, east: 39.0154, south: 27.3501, west: -15.0154 },
  Australia: { north: -10, east: 155, south: -44, west: 112 },
  World: { north: 75, east: 180, south: -60, west: -180 },
};
