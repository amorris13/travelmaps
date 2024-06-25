#!/usr/bin/env node

import parseArgs from 'minimist';
import { createSVGWindow } from 'svgdom'
import { SVG, registerWindow, Point, Matrix, PointArray } from '@svgdotjs/svg.js'
import fs from 'node:fs/promises';
import polyline from '@mapbox/polyline';

const SIDE_PX = 1200;

async function main() {
    var argv = parseArgs(process.argv.slice(2));
    const filename = argv.filename;
    const tripname = argv.tripname;

    const data = await fs.readFile(filename, { encoding: 'utf8' });
    const json = JSON.parse(data);
    const tripJson = json.find(trip => trip.name === tripname);

    const svg = generateTripSvg(tripJson);

    await fs.writeFile(toSnakeCase(tripname) + ".svg", svg);
}

function generateTripSvg(trip) {
    const tripBounds = computerTripBounds(trip);
    console.log(tripBounds);

    // Convert trip bounds to mercator projection
    const tlMercator = toMercator(tripBounds.minLng, tripBounds.maxLat);
    const brMercator = toMercator(tripBounds.maxLng, tripBounds.minLat);
    console.log(tlMercator, brMercator);

    // For Testing Only
    const tlLatLng = fromMercator(tlMercator);
    const brLatLng = fromMercator(brMercator);
    console.log(tlLatLng, brLatLng);

    const boundingBox = new PointArray([[tlMercator.x, tlMercator.y], [brMercator.x, brMercator.y]]).bbox();
    console.log(boundingBox);
    const expandedBoundingBox = boundingBox.transform(new Matrix().scale(1.2, boundingBox.cx, boundingBox.cy));
    console.log(expandedBoundingBox);

    const transform = new Matrix()
        .translate(-expandedBoundingBox.cx, -expandedBoundingBox.cy)
        .lmultiply(new Matrix().scale(Math.min(SIDE_PX / expandedBoundingBox.width, SIDE_PX / expandedBoundingBox.height)))
        .lmultiply(new Matrix().translate(SIDE_PX / 2, SIDE_PX / 2));

    console.log(tlMercator.transform(transform), brMercator.transform(transform));


    // convert latlng to canvas coordinate. Convert to normalized mercator then transform to svg coordinates

    // returns a window with a document and an svg root node
    const window = createSVGWindow();
    const document = window.document;

    // register window and document
    registerWindow(window, document);

    // create canvas
    const canvas = SVG(document.documentElement);

    // use svg.js as normal
    canvas.rect(100, 100).fill('yellow').move(50, 50);

    // get your svg as string
    console.log(canvas.svg());
    return canvas.svg();
}

// Compute trip bounds
function computerTripBounds(trip) {
    const lngs = trip.waypoints.map(waypoint => waypoint.location.lng);
    const lats = trip.waypoints.map(waypoint => waypoint.location.lat);

    return { minLng: Math.min(...lngs), maxLng: Math.max(...lngs), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
}

// Convert lat and lng to mercator
function toMercator(lng, lat) {
    const x = lng / 180;
    const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    const y2 = - y / 180;
    return new Point(x, y2);
}

// Convert from mercator to lat and lng
function fromMercator(p) {
    const lng = 180 * p.x;
    const lat = 360 * Math.atan(Math.exp(-p.y * Math.PI)) / Math.PI - 90;
    return { lng, lat };
}


// Convert string to snake case
function toSnakeCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/\s+/g, '_')
        .toLowerCase();
}

main();