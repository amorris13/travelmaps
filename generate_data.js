#!/usr/bin/env node

import fs from "node:fs/promises";
import polyline from "@mapbox/polyline";

const filename = "./travels.json";

const DIRECTIONS_MODES = ["walking", "driving", "bicycling", "transit"];

async function main() {
  const data = await fs.readFile(filename, { encoding: "utf8" });
  const json = JSON.parse(data);

  // Geocode the waypoints if not already populated.
  const geocodes = [];
  for (let travel of json) {
    for (let waypoint of travel.waypoints) {
      geocodes.push(updateCoordinatesGoogle(waypoint));
    }
  }
  await Promise.all(geocodes);

  // Generate directions between the waypoints
  const directions = [];
  for (let travel of json) {
    let prevWaypoint;
    for (let waypoint of travel.waypoints) {
      if (prevWaypoint) {
        if (DIRECTIONS_MODES.includes(waypoint.mode)) {
          directions.push(updatePolylineGoogle(prevWaypoint, waypoint));
        } else {
          waypoint.polyline = polyline.encode(
            [
              [prevWaypoint.location.lat, prevWaypoint.location.lng],
              [waypoint.location.lat, waypoint.location.lng],
            ],
            5
          );
        }
      }

      prevWaypoint = waypoint;
    }
  }
  await Promise.all(directions);

  json.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

  await fs.writeFile(filename, JSON.stringify(json, null, 2));
}

async function updateCoordinatesMapbox(waypoint) {
  if (waypoint.location) {
    return;
  }
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.append("q", waypoint.geocodeName || waypoint.name);
  url.searchParams.append("access_token", process.env.MAPBOX_ACCESS_TOKEN);
  const response = await fetch(url);
  const jsonResponse = await response.json();
  const coordinates = jsonResponse.features[0].geometry.coordinates;
  waypoint.location = { lng: coordinates[0], lat: coordinates[1] };
}

async function updateCoordinatesGoogle(waypoint) {
  if (waypoint.location) {
    return;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", waypoint.geocodeName || waypoint.name);
  url.searchParams.append("key", process.env.GOOGLE_MAPS_API_KEY);
  const response = await fetch(url);
  const jsonResponse = await response.json();
  if (jsonResponse.status === "OK") {
    waypoint.location = jsonResponse.results[0].geometry.location;
  } else {
    console.log(`Error in geocode for ${waypoint.geocodeName || waypoint.name}`);
    console.log(url.toString());
  }
}

async function updatePolylineMapbox(prevWaypoint, waypoint) {
  if (waypoint.polyline) {
    return;
  }

  const mode = prevWaypoint.mode == "bicycling" ? "cycling" : prevWaypoint.mode;
  const jsonResponse = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/${mode}/${prevWaypoint.location.lng}%2C${prevWaypoint.location.lat}%3B${waypoint.location.lng}%2C${waypoint.location.lat}?alternatives=false&continue_straight=false&geometries=polyline&overview=simplified&steps=false&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`
  );
  const directions = await jsonResponse.json();
  waypoint.polyline = directions.routes[0].geometry;
}

async function updatePolylineGoogle(prevWaypoint, waypoint) {
  if (waypoint.polyline) {
    return;
  }
  if (!prevWaypoint.location || !waypoint.location) {
    return;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.append("mode", waypoint.mode);
  url.searchParams.append("origin", `${prevWaypoint.location.lat},${prevWaypoint.location.lng}`);
  url.searchParams.append("destination", `${waypoint.location.lat},${waypoint.location.lng}`);
  url.searchParams.append("key", process.env.GOOGLE_MAPS_API_KEY);
  const response = await fetch(url);
  const jsonResponse = await response.json();
  if (jsonResponse.status === "OK") {
    waypoint.polyline = jsonResponse.routes[0].overview_polyline.points;
  } else {
    console.log(`Error in directions for ${prevWaypoint.name} to  ${waypoint.name}`);
    console.log(url.toString());
  }
}

main();
