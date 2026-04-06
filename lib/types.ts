export interface LatLng {
  lat: number;
  lng: number;
}

export interface Location {
  name: string;
  geocodeName?: string;
  latlng?: LatLng;
}

export interface StravaActivityData {
  name: string;
  distance?: number; // In meters
  moving_time?: number; // In seconds
  elapsed_time?: number; // In seconds
  total_elevation_gain?: number; // In meters
  max_elevation?: number; // In meters
  average_speed?: number; // meters per second
  max_speed?: number; // meters per second
  distance_stream?: string; // Comma-separated list of numbers
  elevation_stream?: string; // Comma-separated list of numbers
  time_stream?: string; // Comma-separated list of numbers
}

export interface Stage {
  endLocation: Location;
  mode?: string;
  polyline?: string;
  strava_activity_id?: string;
  strava_data?: StravaActivityData;
  hideLabel?: boolean;
  hidePolyline?: boolean;
  showWaypointOnOverview?: boolean;
  dayStop?: boolean;
  partialAttendance?: boolean;
  hidePolylineOnOverview?: boolean;
  hideWaypoint?: boolean;
  stops?: Location[];
  // Added during bounds computation
  startLocation?: Location & { latlng: LatLng };
  lngShift?: number;
  isContinuousWithPrev?: boolean;
}

export interface Trip {
  hideLabel: boolean;
  name: string;
  startDate: string;
  endDate: string;
  stages: Stage[];
  isHome?: boolean;
  hideOnOverview?: boolean;
}

// --- Web app types ---

export interface PosterConfig {
  title: string;
  dateRange: string;
  accentColor: string;
  fontFamily: string;
  mapStyle: string;
  mapTint?: string;
  showElevation: boolean;
  showStageTable: boolean;
  stages: StageConfig[];
  additionalLocations: { name: string; lat: number; lng: number }[];
  units: "metric" | "imperial";
  showSeconds?: boolean;
}

export interface StageConfig {
  activityId: string;
  name: string;
  startLabel: string;
  endLabel: string;
  polyline: string;
  distance: number;
  movingTime: number;
  elevationGain: number;
  averageSpeed: number;
  elevationStream: number[];
  distanceStream: number[];
  activityType: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  isContinuousWithPrev?: boolean;
}

// Bounds types
export interface RegionBounds {
  north: number;
  east: number;
  south: number;
  west: number;
  scale?: number;
}

export interface TripBounds extends RegionBounds {
  lngShift?: number;
}

// Label types used by the label placement algorithm
export interface SimplePoint {
  x: number;
  y: number;
}

export interface LabelPoint {
  name: string;
  point: SimplePoint;
  partialAttendance?: boolean;
}

export interface SimpleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
