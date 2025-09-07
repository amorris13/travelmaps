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
  strava_data?: StravaActivityData; // Store fetched Strava activity data
  hideLabel?: boolean;
  hidePolyline?: boolean;
  showWaypointOnOverview?: boolean;
  dayStop?: boolean;
  partialAttendance?: boolean;
  hidePolylineOnOverview?: boolean;
  hideWaypoint?: boolean;
  stops?: Location[];
  // Add any other properties from the schema if needed
}

export interface Trip {
  hideLabel: boolean;
  name: string;
  startDate: string;
  endDate: string;
  stages: Stage[];
  isHome?: boolean;
  hideOnOverview?: boolean;
  // Add any other top-level trip properties from the schema if needed
}
