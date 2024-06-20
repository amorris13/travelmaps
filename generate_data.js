#!/usr/bin/env node

const fs = require('node:fs/promises');

async function main() {
    // TODO: pass filename in as command line parameter
    const data = await fs.readFile('./test_data.json', { encoding: 'utf8' });
    const json = JSON.parse(data);

    // Geocode the waypoints if not already populated.
    const geocodes = [];
    for (var travel of json) {
        for (var waypoint of travel.waypoints) {
            geocodes.push(updateCoordinates(waypoint));
        }
    }
    await Promise.all(geocodes);

    // Generate directions between the waypoints
    const directions = [];
    for (var travel of json) {
        var prevLocation
        for (var waypoint of travel.waypoints) {
            if (prevLocation) {
                directions.push(updatePolyline(prevLocation, waypoint));
            }

            prevLocation = waypoint.location;
        }
    }
    await Promise.all(directions);




    await fs.writeFile('./test_data.json', JSON.stringify(json, null, 4));

}

async function updateCoordinates(waypoint) {
    if (waypoint.location) {
        return;
    }
    const coordinates = await geocode(waypoint.name);
    waypoint.location = { lng: coordinates[0], lat: coordinates[1] }
}

async function geocode(location) {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${location}&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`);
    const geocode = await response.json();
    const coordinates = geocode.features[0].geometry.coordinates;
    console.log(JSON.stringify(coordinates, null, 2));
    return coordinates;
}


async function updatePolyline(prevLocation, waypoint) {
    if (waypoint.polyline) {
        return;
    }

    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${waypoint.transitMode}/${prevLocation.lng}%2C${prevLocation.lat}%3B${waypoint.location.lng}%2C${waypoint.location.lat}?alternatives=false&continue_straight=false&geometries=polyline&overview=simplified&steps=false&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`);
    const directions = await response.json();
    waypoint.polyline = directions.routes[0].geometry;
    console.log(waypoint.polyline);
}


main();
