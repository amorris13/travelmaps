export interface LatLng {
  lat: number;
  lng: number;
}

export interface EndLocation {
  name: string;
  geocodeName?: string;
  latlng?: LatLng;
}

export interface Stage {
  endLocation: EndLocation;
  mode?: string;
  polyline?: string;
  strava_id?: string;
  elevation_profile?: any; // Consider defining more specifically later
  hideLabel?: boolean;
  hidePolyline?: boolean;
  showWaypointOnOverview?: boolean;
  dayStop?: boolean;
  partialAttendance?: boolean;
  hidePolylineOnOverview?: boolean;
  hideWaypoint?: boolean;
  // Add any other properties from the schema if needed
}

export interface Trip {
  hideLabel: any;
  name: string;
  startDate: string;
  endDate: string;
  stages: Stage[];
  isHome?: boolean;
  hideOnOverview?: boolean;
  // Add any other top-level trip properties from the schema if needed
}
