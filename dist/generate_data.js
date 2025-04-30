#!/usr/bin/env node
import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";
import { URL } from "node:url"; // Import URL constructor
// --- Constants ---
const FILENAME = "./travels.json"; // Use uppercase for constants
const DIRECTIONS_MODES = ["walking", "driving", "bicycling", "transit"]; // Use ReadonlyArray
// --- Main Function ---
async function main() {
    // Ensure API key is set
    if (!process.env.GOOGLE_MAPS_API_KEY) {
        console.error("Error: GOOGLE_MAPS_API_KEY environment variable is not set.");
        process.exit(1);
    }
    let travelsJson;
    try {
        const data = await fs.readFile(FILENAME, { encoding: "utf8" });
        travelsJson = JSON.parse(data); // Assert type after parsing
    }
    catch (error) {
        console.error(`Error reading or parsing ${FILENAME}:`, error?.message || error);
        process.exit(1);
    }
    // Geocode the stages if coordinates are missing.
    const geocodePromises = [];
    for (const travel of travelsJson) {
        if (!travel.stages || !Array.isArray(travel.stages))
            continue;
        for (const stage of travel.stages) {
            geocodePromises.push(updateCoordinatesGoogle(stage));
        }
    }
    try {
        await Promise.all(geocodePromises);
        console.log("Geocoding phase complete.");
    }
    catch (error) {
        console.error("Error during geocoding phase:", error);
        // Decide if you want to exit or continue
    }
    // Generate directions for the stages
    const directionPromises = [];
    for (const travel of travelsJson) {
        if (!travel.stages || !Array.isArray(travel.stages) || travel.stages.length < 2)
            continue;
        let prevStage; // Explicitly allow undefined
        for (const stage of travel.stages) {
            if (prevStage && !stage.polyline) {
                // Check if both stages have the necessary location info
                if (prevStage.endLocation?.latlng && stage.endLocation?.latlng) {
                    // Type guard for mode
                    if (stage.mode && DIRECTIONS_MODES.includes(stage.mode)) {
                        directionPromises.push(updatePolylineGoogle(prevStage, stage));
                    }
                    else {
                        // Generate basic straight-line polyline using endLocation.latlng
                        // No need for optional chaining here due to the outer 'if' check
                        stage.polyline = polyline.encode([
                            [prevStage.endLocation.latlng.lat, prevStage.endLocation.latlng.lng],
                            [stage.endLocation.latlng.lat, stage.endLocation.latlng.lng],
                        ], 5 // Precision 5 is standard for Google Polylines
                        );
                    }
                }
                else {
                    console.warn(`Skipping polyline generation between "${prevStage?.endLocation?.name}" and "${stage?.endLocation?.name}" due to missing latlng.`);
                }
            }
            prevStage = stage;
        }
    }
    try {
        await Promise.all(directionPromises);
        console.log("Directions phase complete.");
    }
    catch (error) {
        console.error("Error during directions phase:", error);
        // Decide if you want to exit or continue
    }
    // Sort trips by start date
    travelsJson.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
    // Write the updated data back
    try {
        await fs.writeFile(FILENAME, JSON.stringify(travelsJson, null, 2));
        console.log(`Updated ${FILENAME} with geocoding and polylines.`);
    }
    catch (error) {
        console.error(`Error writing updated data to ${FILENAME}:`, error?.message || error);
        process.exit(1);
    }
}
// --- Geocoding Function ---
async function updateCoordinatesGoogle(stage) {
    // Check if endLocation and latlng already exist
    if (stage.endLocation?.latlng) {
        return; // Already geocoded
    }
    // endLocation is now required on Stage type based on refactor script
    // if (!stage.endLocation) {
    //   console.warn(`Stage missing endLocation object. Cannot geocode.`);
    //   return;
    // }
    const address = stage.endLocation.geocodeName || stage.endLocation.name;
    if (!address) {
        // This case should ideally not happen if endLocation.name is required by schema/refactor
        console.warn(`Stage missing endLocation.name and endLocation.geocodeName. Cannot geocode.`);
        return;
    }
    console.log(`Geocoding: ${address}`);
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    // API key presence is checked in main()
    url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY); // Use non-null assertion
    try {
        const response = await fetch(url.toString()); // Pass string URL to fetch
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonResponse = (await response.json());
        if (jsonResponse.status === "OK" && jsonResponse.results?.length > 0) {
            // Add latlng to the existing endLocation object
            stage.endLocation.latlng = jsonResponse.results[0].geometry.location; // Google uses {lat, lng}
            console.log(`  -> Found coordinates for ${address}`);
        }
        else {
            console.error(`Error geocoding "${address}": ${jsonResponse.status} - ${jsonResponse.error_message || "No error message provided."}`);
            console.error(`  Request URL: ${url.toString()}`);
            // Consider throwing an error here or handling it based on status code
        }
    }
    catch (error) {
        // Catch unknown error type
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Network or fetch error during geocoding for "${address}":`, message);
        // Optionally re-throw or handle specific errors
        // throw error;
    }
}
// --- Directions Function ---
async function updatePolylineGoogle(prevStage, stage) {
    // Polyline already exists or mode doesn't need directions API
    // Added type guard for mode existence
    if (stage.polyline || !stage.mode || !DIRECTIONS_MODES.includes(stage.mode)) {
        return;
    }
    // Check required location data. Optional chaining already handles potential undefined prevStage/stage
    // but the outer loop logic ensures prevStage exists here.
    // The latlng check is crucial.
    if (!prevStage.endLocation?.latlng || !stage.endLocation?.latlng) {
        console.warn(`Cannot get directions between "${prevStage?.endLocation?.name}" and "${stage?.endLocation?.name}" due to missing latlng.`);
        return;
    }
    // Non-null assertion is safe here due to the check above
    const origin = `${prevStage.endLocation.latlng.lat},${prevStage.endLocation.latlng.lng}`;
    const destination = `${stage.endLocation.latlng.lat},${stage.endLocation.latlng.lng}`;
    const mode = stage.mode; // Mode is guaranteed to exist and be valid here
    console.log(`Fetching directions: ${prevStage.endLocation.name} -> ${stage.endLocation.name} (${mode})`);
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("mode", mode);
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    // API key presence is checked in main()
    url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY); // Use non-null assertion
    try {
        const response = await fetch(url.toString()); // Pass string URL to fetch
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonResponse = (await response.json());
        if (jsonResponse.status === "OK" && jsonResponse.routes?.length > 0) {
            stage.polyline = jsonResponse.routes[0].overview_polyline.points;
            console.log(`  -> Generated polyline for ${prevStage.endLocation.name} -> ${stage.endLocation.name}`);
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
            const fallbackJsonResponse = (await fallbackResponse.json());
            if (fallbackJsonResponse.status === "OK" && fallbackJsonResponse.routes?.length > 0) {
                stage.polyline = fallbackJsonResponse.routes[0].overview_polyline.points;
                // Optionally update the stage's mode if you want to record the fallback:
                // stage.mode = newMode;
                console.log(`  -> Generated polyline using fallback mode "${newMode}"`);
                return; // Success with fallback
            }
        }
        // Log error if no route found even after potential fallback
        console.error(`Error fetching directions for ${prevStage.endLocation.name} -> ${stage.endLocation.name}: ${jsonResponse.status} - ${jsonResponse.error_message || "No error message provided."}`);
        console.error(`  Request URL: ${url.toString()}`);
        // Consider throwing an error here
    }
    catch (error) {
        // Catch unknown error type
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Network or fetch error during directions request for ${prevStage.endLocation.name} -> ${stage.endLocation.name}:`, message);
        // Optionally re-throw or handle specific errors
        // throw error;
    }
}
// --- Run the main function ---
main().catch((error) => {
    // Catch unknown error type
    const message = error instanceof Error ? error.message : String(error);
    console.error("An unhandled error occurred during data generation:", message);
    if (error instanceof Error && error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
});
