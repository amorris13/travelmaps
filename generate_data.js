#!/usr/bin/env node

import fs from 'node:fs/promises';

const filename = './travels.json';

async function main() {
    const data = await fs.readFile(filename, { encoding: 'utf8' });
    const json = JSON.parse(data);

    // Geocode the waypoints if not already populated.
    const geocodes = [];
    for (var travel of json) {
        for (var waypoint of travel.waypoints) {
            geocodes.push(updateCoordinatesGoogle(waypoint));
        }
    }
    await Promise.all(geocodes);

    // Generate directions between the waypoints
    const directions = [];
    for (var travel of json) {
        var prevWaypoint
        for (var waypoint of travel.waypoints) {
            if (prevWaypoint) {
                directions.push(updatePolylineGoogle(prevWaypoint, waypoint));
            }

            prevWaypoint = waypoint;
        }
    }
    await Promise.all(directions);




    await fs.writeFile(filename, JSON.stringify(json, null, 4));

}

async function updateCoordinatesMapbox(waypoint) {
    if (waypoint.location) {
        return;
    }
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(waypoint.name)}&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`);
    const jsonResponse = await response.json();
    const coordinates = jsonResponse.features[0].geometry.coordinates;
    console.log(waypoint.name + ': ' + JSON.stringify(coordinates));
    waypoint.location = { lng: coordinates[0], lat: coordinates[1] }
}

async function updateCoordinatesGoogle(waypoint) {
    if (waypoint.location) {
        return;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(waypoint.name)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    console.log(url);
    const response = await fetch(url);
    const jsonResponse = await response.json();
    const coordinates = jsonResponse.results[0].geometry.location;
    console.log(waypoint.name + ': ' + JSON.stringify(coordinates));
    waypoint.location = coordinates;
}

async function updatePolylineMapbox(prevWaypoint, waypoint) {
    if (waypoint.polyline) {
        return;
    }

    const mode = prevWaypoint.mode == 'bicycling' ? 'cycling' : prevWaypoint.mode;
    const jsonResponse = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${mode}/${prevWaypoint.location.lng}%2C${prevWaypoint.location.lat}%3B${waypoint.location.lng}%2C${waypoint.location.lat}?alternatives=false&continue_straight=false&geometries=polyline&overview=simplified&steps=false&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`);
    const directions = await jsonResponse.json();
    waypoint.polyline = directions.routes[0].geometry;
    console.log(`${prevLocation.name} -> ${waypoint.name}: ${waypoint.polyline}`);
}

async function updatePolylineGoogle(prevWaypoint, waypoint) {
    if (waypoint.polyline) {
        return;
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?mode=${waypoint.mode}&origin=${prevWaypoint.location.lat},${prevWaypoint.location.lng}&destination=${waypoint.location.lat},${waypoint.location.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    console.log(url);
    const response = await fetch(url);
    const jsonResponse = await response.json();
    console.log(JSON.stringify(jsonResponse, null, 2));
    waypoint.polyline = jsonResponse.routes[0].overview_polyline.points;
    console.log(`${prevWaypoint.name} -> ${waypoint.name}: ${waypoint.polyline}`);
}



main();
