import type { StravaActivityData } from "./types";

// --- Strava API Response Types ---

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  elev_high?: number;
  elev_low?: number;
  average_speed: number;
  max_speed: number;
  start_date: string;
  start_date_local: string;
  type: string;
  sport_type: string;
  map?: {
    polyline?: string;
    summary_polyline?: string;
  };
}

export interface StravaStream {
  type: string;
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  athlete?: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

// --- Helpers ---

function normalizeActivityId(activityId: string | number): string {
  const id = String(activityId);
  if (!/^\d+$/.test(id)) {
    throw new Error(`Invalid activity ID: ${id}`);
  }
  return id;
}

// --- API Helpers ---

export async function fetchStravaActivities(
  accessToken: string,
  page = 1,
  perPage = 30,
  options?: { before?: number; after?: number }
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (options?.before) params.set("before", String(options.before));
  if (options?.after) params.set("after", String(options.after));

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<StravaActivity[]>;
}

export async function fetchStravaActivity(
  accessToken: string,
  activityId: string | number
): Promise<StravaActivity> {
  const id = normalizeActivityId(activityId);
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${id}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<StravaActivity>;
}

export async function fetchStravaStreams(
  accessToken: string,
  activityId: string | number
): Promise<{ distance?: StravaStream; altitude?: StravaStream; time?: StravaStream }> {
  const id = normalizeActivityId(activityId);
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${id}/streams?keys=distance,altitude,time&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function exchangeStravaToken(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<StravaTokenResponse> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Strava token exchange failed: ${response.status}`);
  }
  return response.json() as Promise<StravaTokenResponse>;
}

export async function refreshStravaToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<StravaTokenResponse> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status}`);
  }
  return response.json() as Promise<StravaTokenResponse>;
}

/**
 * Convert a Strava activity + streams into our StravaActivityData format.
 */
export function toStravaActivityData(
  activity: StravaActivity,
  streams: { distance?: StravaStream; altitude?: StravaStream; time?: StravaStream }
): StravaActivityData {
  return {
    name: activity.name,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    max_elevation: activity.elev_high,
    average_speed: activity.average_speed,
    max_speed: activity.max_speed,
    distance_stream: streams.distance?.data?.join(","),
    elevation_stream: streams.altitude?.data?.join(","),
    time_stream: streams.time?.data?.join(","),
  };
}
