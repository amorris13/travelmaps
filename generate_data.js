#!/usr/bin/env node

import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";

// Assuming travels.json is in the same directory or adjust path as needed
const filename = "./travels.json";

const DIRECTIONS_MODES = ["walking", "driving", "bicycling", "transit"];

async function main() {
  const data = await fs.readFile(filename, { encoding: "utf8" });
  const json = JSON.parse(data);

  // Geocode the stages if coordinates are missing.
  const geocodes = [];
  for (let travel of json) {
    // Ensure stages array exists
    if (!travel.stages || !Array.isArray(travel.stages)) continue;

    for (let stage of travel.stages) {
      // Pass the whole stage object
      geocodes.push(updateCoordinatesGoogle(stage));
    }
  }
  await Promise.all(geocodes);

  // Generate directions for the stages
  const directions = [];
  for (let travel of json) {
    // Ensure stages array exists and has at least 2 elements for polylines
    if (!travel.stages || !Array.isArray(travel.stages) || travel.stages.length < 2) continue;

    let prevStage;
    for (let stage of travel.stages) {
      if (prevStage && !stage.polyline) {
        // Check if both stages have the necessary location info
        if (prevStage.endLocation?.latlng && stage.endLocation?.latlng) {
          if (DIRECTIONS_MODES.includes(stage.mode)) {
            directions.push(updatePolylineGoogle(prevStage, stage));
          } else {
            // Generate basic straight-line polyline using endLocation.latlng
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
  await Promise.all(directions);

  // Sort trips by start date
  json.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

  // Write the updated data back
  await fs.writeFile(filename, JSON.stringify(json, null, 2));
  console.log(`Updated ${filename} with geocoding and polylines.`);
}

// --- Geocoding Function (Updated) ---

async function updateCoordinatesGoogle(stage) {
  // Check if endLocation and latlng already exist
  if (stage.endLocation?.latlng) {
    return;
  }
  // Ensure endLocation exists before trying to add latlng to it
  if (!stage.endLocation) {
    console.warn(`Stage missing endLocation object. Cannot geocode.`);
    // Or potentially create it: stage.endLocation = { name: 'Unknown' };
    return;
  }

  const address = stage.endLocation.geocodeName || stage.endLocation.name;
  if (!address) {
    console.warn(`Stage missing endLocation.name and endLocation.geocodeName. Cannot geocode.`);
    return;
  }

  console.log(`Geocoding: ${address}`);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY); // Ensure GOOGLE_MAPS_API_KEY is set in your environment

  try {
    const response = await fetch(url);
    const jsonResponse = await response.json();

    if (jsonResponse.status === "OK" && jsonResponse.results?.length > 0) {
      // Add latlng to the existing endLocation object
      stage.endLocation.latlng = jsonResponse.results[0].geometry.location; // Google uses {lat, lng}
      console.log(`  -> Found coordinates for ${address}`);
    } else {
      console.error(
        `Error geocoding "${address}": ${jsonResponse.status} - ${jsonResponse.error_message || ""}`
      );
      console.error(`  Request URL: ${url.toString()}`);
    }
  } catch (error) {
    console.error(`Network or fetch error during geocoding for "${address}":`, error);
  }
}

// --- Directions Function (Updated) ---

async function updatePolylineGoogle(prevStage, stage) {
  // Polyline already exists or mode doesn't need directions API
  if (stage.polyline || !DIRECTIONS_MODES.includes(stage.mode)) {
    return;
  }
  // Check required location data using optional chaining
  if (!prevStage?.endLocation?.latlng || !stage?.endLocation?.latlng) {
    console.warn(
      `Cannot get directions between "${prevStage?.endLocation?.name}" and "${stage?.endLocation?.name}" due to missing latlng.`
    );
    return;
  }

  const origin = `${prevStage.endLocation.latlng.lat},${prevStage.endLocation.latlng.lng}`;
  const destination = `${stage.endLocation.latlng.lat},${stage.endLocation.latlng.lng}`;
  const mode = stage.mode; // Use the mode defined in the current stage

  console.log(
    `Fetching directions: ${prevStage.endLocation.name} -> ${stage.endLocation.name} (${mode})`
  );

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("mode", mode);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY); // Ensure GOOGLE_MAPS_API_KEY is set

  try {
    const response = await fetch(url);
    const jsonResponse = await response.json();

    if (jsonResponse.status === "OK" && jsonResponse.routes?.length > 0) {
      stage.polyline = jsonResponse.routes[0].overview_polyline.points;
      console.log(
        `  -> Generated polyline for ${prevStage.endLocation.name} -> ${stage.endLocation.name}`
      );
      return; // Success
    }

    // Handle potential fallback modes if initial request failed
    if (jsonResponse.available_travel_modes?.length > 0) {
      const newMode = jsonResponse.available_travel_modes[0].toLowerCase(); // Google might return uppercase
      console.warn(`  Mode "${mode}" not available. Trying fallback: "${newMode}"`);
      url.searchParams.set("mode", newMode);
      const fallbackResponse = await fetch(url);
      const fallbackJsonResponse = await fallbackResponse.json();

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
      } - ${jsonResponse.error_message || ""}`
    );
    console.error(`  Request URL: ${url.toString()}`);
  } catch (error) {
    console.error(
      `Network or fetch error during directions request for ${prevStage.endLocation.name} -> ${stage.endLocation.name}:`,
      error
    );
  }
}

// --- Run the main function ---
main().catch((error) => {
  console.error("An error occurred during data generation:", error);
  process.exit(1);
});
