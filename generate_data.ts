#!/usr/bin/env node

import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";
import { URL } from "node:url"; // Import URL constructor
import dotenv from "dotenv";
import type { LatLng, Trip, Stage, Location, StravaActivityData } from "./trips.ts";

// Load environment variables from .env file
dotenv.config();

// --- Google API Response Types (Simplified) ---
interface GoogleGeocodeResult {
  geometry: {
    location: LatLng;
  };
  // Add other properties if needed
}

interface GoogleGeocodeResponse {
  results: GoogleGeocodeResult[];
  status: string;
  error_message?: string;
}

interface GoogleDirectionsRoute {
  overview_polyline: {
    points: string;
  };
  // Add other properties if needed
}

interface GoogleDirectionsResponse {
  routes: GoogleDirectionsRoute[];
  status: string;
  error_message?: string;
  available_travel_modes?: string[];
}

// --- Strava API Response Types ---
interface StravaActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  elev_high?: number; // meters
  elev_low?: number; // meters
  average_speed: number; // meters per second
  max_speed: number; // meters per second
}

interface StravaStream {
  type: string;
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

interface StravaActivityResponse {
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
  map?: {
    polyline?: string;
  };
}

interface StravaStreamsResponse {
  distance?: StravaStream;
  altitude?: StravaStream;
  time?: StravaStream;
}

// --- Constants ---

const FILENAME = "./travels.json"; // Use uppercase for constants
const DIRECTIONS_MODES: ReadonlyArray<string> = ["walking", "driving", "bicycling", "transit"]; // Use ReadonlyArray

// --- Main Function ---

async function main(): Promise<void> {
  // Ensure API key is set
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error("Error: GOOGLE_MAPS_API_KEY environment variable is not set.");
    process.exit(1);
  }

  let travelsJson: Trip[];
  try {
    const data = await fs.readFile(FILENAME, { encoding: "utf8" });
    travelsJson = JSON.parse(data) as Trip[]; // Assert type after parsing
  } catch (error: any) {
    console.error(`Error reading or parsing ${FILENAME}:`, error?.message || error);
    process.exit(1);
  }

  // Check if any stages have Strava activity IDs
  const hasStravaActivities = travelsJson.some(travel => 
    travel.stages?.some(stage => stage.strava_activity_id)
  );
  
  if (hasStravaActivities && !process.env.STRAVA_ACCESS_TOKEN) {
    console.warn("Warning: Some stages have Strava activity IDs but STRAVA_ACCESS_TOKEN is not set. Strava data will be skipped.");
  }

  // Geocode the stages if coordinates are missing.
  const geocodePromises: Promise<void>[] = [];
  for (const travel of travelsJson) {
    if (!travel.stages || !Array.isArray(travel.stages)) continue;

    for (const stage of travel.stages) {
      geocodePromises.push(updateCoordinatesGoogle(stage.endLocation));
      if (stage.stops) {
        for (const stop of stage.stops) {
          geocodePromises.push(updateCoordinatesGoogle(stop));
        }
      }
    }
  }
  try {
    await Promise.all(geocodePromises);
    console.log("Geocoding phase complete.");
  } catch (error) {
    console.error("Error during geocoding phase:", error);
    // Decide if you want to exit or continue
  }

  // Generate directions for the stages
  const directionPromises: Promise<void>[] = [];
  for (const travel of travelsJson) {
    if (!travel.stages || !Array.isArray(travel.stages) || travel.stages.length < 2) continue;

    let prevStage: Stage | undefined; // Explicitly allow undefined
    for (const stage of travel.stages) {
      if (stage.strava_activity_id) {
        directionPromises.push(updateStageStrava(stage));
      } else if (prevStage && !stage.polyline) {
        // Check if both stages have the necessary location info
        if (prevStage.endLocation?.latlng && stage.endLocation?.latlng) {
          // Type guard for mode
          if (stage.mode && DIRECTIONS_MODES.includes(stage.mode)) {
            directionPromises.push(updatePolylineGoogle(prevStage, stage));
          } else {
            // Generate basic straight-line polyline using endLocation.latlng
            // No need for optional chaining here due to the outer 'if' check
            stage.polyline = polyline.encode(
              [
                [prevStage.endLocation.latlng.lat, prevStage.endLocation.latlng.lng],
                [stage.endLocation.latlng.lat, stage.endLocation.latlng.lng],
              ],
              5 // Precision 5 is standard for Google Polylines
            );
          }
        } else {
          console.warn(
            `Skipping polyline generation between "${prevStage?.endLocation?.name}" and "${stage?.endLocation?.name}" due to missing latlng.`
          );
        }
      }
      prevStage = stage;
    }
  }
  try {
    await Promise.all(directionPromises);
    console.log("Directions phase complete.");
  } catch (error) {
    console.error("Error during directions phase:", error);
    // Decide if you want to exit or continue
  }

  // Sort trips by start date
  travelsJson.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

  // Write the updated data back
  try {
    await fs.writeFile(FILENAME, JSON.stringify(travelsJson, null, 2));
    console.log(`Updated ${FILENAME} with geocoding and polylines.`);
  } catch (error: any) {
    console.error(`Error writing updated data to ${FILENAME}:`, error?.message || error);
    process.exit(1);
  }
}

// --- Geocoding Function ---

async function updateCoordinatesGoogle(location: Location): Promise<void> {
  // Check if endLocation and latlng already exist
  if (location?.latlng) {
    return; // Already geocoded
  }

  const address = location.geocodeName || location.name;
  if (!address) {
    // This case should ideally not happen if endLocation.name is required by schema/refactor
    console.warn(`Stage missing endLocation.name and endLocation.geocodeName. Cannot geocode.`);
    return;
  }

  console.log(`Geocoding: ${address}`);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  // API key presence is checked in main()
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!); // Use non-null assertion

  try {
    const response = await fetch(url.toString()); // Pass string URL to fetch
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonResponse = (await response.json()) as GoogleGeocodeResponse;

    if (jsonResponse.status === "OK" && jsonResponse.results?.length > 0) {
      // Add latlng to the existing endLocation object
      location.latlng = jsonResponse.results[0].geometry.location; // Google uses {lat, lng}
      console.log(`  -> Found coordinates for ${address}`);
    } else {
      console.error(
        `Error geocoding "${address}": ${jsonResponse.status} - ${
          jsonResponse.error_message || "No error message provided."
        }`
      );
      console.error(`  Request URL: ${url.toString()}`);
      // Consider throwing an error here or handling it based on status code
    }
  } catch (error: unknown) {
    // Catch unknown error type
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Network or fetch error during geocoding for "${address}":`, message);
    // Optionally re-throw or handle specific errors
    // throw error;
  }
}

// --- Directions Function ---

async function updatePolylineGoogle(prevStage: Stage, stage: Stage): Promise<void> {
  // Polyline already exists or mode doesn't need directions API
  // Added type guard for mode existence
  if (stage.polyline || !stage.mode || !DIRECTIONS_MODES.includes(stage.mode)) {
    return;
  }

  // Check required location data. Optional chaining already handles potential undefined prevStage/stage
  // but the outer loop logic ensures prevStage exists here.
  // The latlng check is crucial.
  if (!prevStage.endLocation?.latlng || !stage.endLocation?.latlng) {
    console.warn(
      `Cannot get directions between "${prevStage?.endLocation?.name}" and "${stage?.endLocation?.name}" due to missing latlng.`
    );
    return;
  }

  // Non-null assertion is safe here due to the check above
  const origin = `${prevStage.endLocation.latlng.lat},${prevStage.endLocation.latlng.lng}`;
  const destination = `${stage.endLocation.latlng.lat},${stage.endLocation.latlng.lng}`;
  const mode = stage.mode; // Mode is guaranteed to exist and be valid here

  console.log(
    `Fetching directions: ${prevStage.endLocation.name} -> ${stage.endLocation.name} (${mode})`
  );

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("mode", mode);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  // API key presence is checked in main()
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!); // Use non-null assertion

  try {
    const response = await fetch(url.toString()); // Pass string URL to fetch
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonResponse = (await response.json()) as GoogleDirectionsResponse;

    if (jsonResponse.status === "OK" && jsonResponse.routes?.length > 0) {
      stage.polyline = jsonResponse.routes[0].overview_polyline.points;
      console.log(
        `  -> Generated polyline for ${prevStage.endLocation.name} -> ${stage.endLocation.name}`
      );
      return; // Success
    }

    const available_travel_modes = jsonResponse.available_travel_modes;
    // Handle potential fallback modes if initial request failed
    if (available_travel_modes && available_travel_modes?.length > 0) {
      const newMode = available_travel_modes[0].toLowerCase(); // Google might return uppercase
      console.warn(`  Mode "${mode}" not available. Trying fallback: "${newMode}"`);
      url.searchParams.set("mode", newMode);
      const fallbackResponse = await fetch(url.toString());
      if (!fallbackResponse.ok) {
        throw new Error(`HTTP error on fallback! status: ${fallbackResponse.status}`);
      }
      const fallbackJsonResponse = (await fallbackResponse.json()) as GoogleDirectionsResponse;

      if (fallbackJsonResponse.status === "OK" && fallbackJsonResponse.routes?.length > 0) {
        stage.polyline = fallbackJsonResponse.routes[0].overview_polyline.points;
        // Optionally update the stage's mode if you want to record the fallback:
        // stage.mode = newMode;
        console.log(`  -> Generated polyline using fallback mode "${newMode}"`);
        return; // Success with fallback
      }
    }

    // Log error if no route found even after potential fallback
    console.error(
      `Error fetching directions for ${prevStage.endLocation.name} -> ${stage.endLocation.name}: ${
        jsonResponse.status
      } - ${jsonResponse.error_message || "No error message provided."}`
    );
    console.error(`  Request URL: ${url.toString()}`);
    // Consider throwing an error here
  } catch (error: unknown) {
    // Catch unknown error type
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Network or fetch error during directions request for ${prevStage.endLocation.name} -> ${stage.endLocation.name}:`,
      message
    );
    // Optionally re-throw or handle specific errors
    // throw error;
  }
}

async function updateStageStrava(stage: Stage): Promise<void> {
  // Check if stage has Strava activity ID
  if (!stage.strava_activity_id) {
    return; // No activity ID
  }

  // Check if we already have complete Strava data (including elevation stream)
  if (stage.strava_data && stage.strava_data.elevation_stream) {
    return; // Already processed with complete data
  }

  // Check if Strava access token is available
  if (!process.env.STRAVA_ACCESS_TOKEN) {
    console.warn(`Skipping Strava data for activity ${stage.strava_activity_id}: STRAVA_ACCESS_TOKEN not set`);
    return;
  }

  const activityId = stage.strava_activity_id;
  console.log(`Fetching Strava data for activity: ${activityId}`);

  try {
    // Fetch activity details
    const activityResponse = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.STRAVA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!activityResponse.ok) {
      throw new Error(`HTTP error! status: ${activityResponse.status}`);
    }

    const activityData = (await activityResponse.json()) as StravaActivityResponse;

    // Fetch activity streams (distance, altitude, and time)
    const streamsResponse = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=distance,altitude,time&key_by_type=true`, {
      headers: {
        'Authorization': `Bearer ${process.env.STRAVA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!streamsResponse.ok) {
      throw new Error(`HTTP error! status: ${streamsResponse.status}`);
    }

    const streamsData = (await streamsResponse.json()) as StravaStreamsResponse;

    // Map the data to our interface
    const stravaData: StravaActivityData = {
      name: activityData.name,
      distance: activityData.distance,
      moving_time: activityData.moving_time,
      elapsed_time: activityData.elapsed_time,
      total_elevation_gain: activityData.total_elevation_gain,
      max_elevation: activityData.elev_high,
      average_speed: activityData.average_speed,
      max_speed: activityData.max_speed,
      distance_stream: streamsData.distance?.data ? streamsData.distance.data.join(",") : undefined,
      elevation_stream: streamsData.altitude?.data ? streamsData.altitude.data.join(",") : undefined,
      time_stream: streamsData.time?.data ? streamsData.time.data.join(",") : undefined
    };

    // Update the stage with Strava data and polyline
    stage.strava_data = stravaData;
    if (activityData.map?.polyline) {
      stage.polyline = activityData.map.polyline;
    }
    console.log(`  -> Fetched Strava data for activity: ${activityData.name}`);
    console.log(`    Distance: ${(activityData.distance / 1000).toFixed(2)}km`);
    console.log(`    Moving time: ${Math.round(activityData.moving_time / 60)}min`);
    console.log(`    Elevation gain: ${activityData.total_elevation_gain}m`);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching Strava data for activity ${activityId}:`, message);
    // Don't throw error to allow processing to continue with other activities
  }
}

// --- Run the main function ---
main().catch((error: unknown) => {
  // Catch unknown error type
  const message = error instanceof Error ? error.message : String(error);
  console.error("An unhandled error occurred during data generation:", message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
