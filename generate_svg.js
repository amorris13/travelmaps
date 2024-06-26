#!/usr/bin/env node

import parseArgs from 'minimist';
import { createSVGWindow } from 'svgdom'
import { SVG, registerWindow, Point, Matrix, PointArray, extend, Element } from '@svgdotjs/svg.js'
import fs from 'node:fs/promises';
import polyline from '@mapbox/polyline';
import pixelWidth from 'string-pixel-width';

const SIDE_PX = 1200;

extend(Element, {
    at: function (point) {
        return this.x(point.x).y(point.y);
    },
    centerAt: function (point) {
        return this.cx(point.x).cy(point.y);
    }
})

async function main() {
    var argv = parseArgs(process.argv.slice(2), { boolean: ['staticmap'] });
    const filename = argv.filename;
    const tripname = argv.tripname;
    const fetchStaticMap = argv.staticmap;

    const data = await fs.readFile(filename, { encoding: 'utf8' });
    const json = JSON.parse(data);
    const tripJson = json.find(trip => trip.name === tripname);

    const tripSvg = generateTripSvg(tripJson);

    await fs.mkdir('output', { recursive: true });
    await fs.writeFile('output/' + toSnakeCase(tripname) + ".svg", tripSvg.svg);

    if (fetchStaticMap) {
        const staticMap = await fetchStaticMapMapbox(tripSvg.boundingBox);
        const staticMapBuffer = Buffer.from(await staticMap.arrayBuffer());
        await fs.writeFile('output/' + toSnakeCase(tripname) + ".png", staticMapBuffer);
    }
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

    // returns a window with a document and an svg root node
    const window = createSVGWindow();
    const document = window.document;

    // register window and document
    registerWindow(window, document);

    // create canvas
    const canvas = SVG(document.documentElement);
    canvas.viewbox(0, 0, SIDE_PX, SIDE_PX);

    const color = '#C61016';
    canvas.style('.line', {
        fill: 'none',
        'stroke-width': 4,
        stroke: color,
        'stroke-opacity': 0.8,
        'stroke-linejoin': 'round',
        'stroke-dasharray': '8 4'
    });
    canvas.style('.waypoint', {
        r: 8,
        fill: color
    });
    const labelFontSizePx = 24;
    canvas.style('.label', {
        fontFamily: 'Helvetica',
        fontSize: labelFontSizePx + 'px',
        fill: color
    });

    // Add lines for each leg
    for (const waypoint of trip.waypoints) {
        if (!waypoint.polyline) {
            continue;
        }
        const decodedPolyline = polyline.decode(waypoint.polyline);
        const transformedPolyline = decodedPolyline.map(latlng =>
            toMercator(latlng[1], latlng[0]).transform(transform).toArray());

        canvas.polyline(transformedPolyline).addClass('line');
    }

    // Add marker for each waypoint
    for (const waypoint of trip.waypoints) {
        const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
        canvas.circle().centerAt(point).addClass('waypoint');
    }

    // Add label for each waypoint
    for (const waypoint of trip.waypoints) {
        const point = toMercator(waypoint.location.lng, waypoint.location.lat).transform(transform);
        const labelWidth = pixelWidth(waypoint.name, { font: 'helvetica', size: labelFontSizePx });
        const labelHeight = labelFontSizePx;
        const offsetPoint = point.transform(new Matrix().translate(6, 6));
        canvas.rect(labelWidth, labelHeight).at(offsetPoint).opacity(0.2);
        canvas.text(waypoint.name).at(offsetPoint).addClass('label');
    }

    // get your svg as string
    console.log(canvas.svg());
    return { svg: canvas.svg(), boundingBox: expandedBoundingBox };
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

async function fetchStaticMapMapbox(boundingBox) {
    const yExpandFactor = 1.05;
    const expandBottom = new Matrix().scale(1, yExpandFactor, boundingBox.x, boundingBox.y);
    const ySide = SIDE_PX * yExpandFactor;

    const staticMapBoundingBox = boundingBox.transform(expandBottom);

    const tlLatLng = fromMercator({ x: staticMapBoundingBox.x, y: staticMapBoundingBox.y });
    const brLatLng = fromMercator({ x: staticMapBoundingBox.x2, y: staticMapBoundingBox.y2 });

    const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/[${tlLatLng.lng},${brLatLng.lat},${brLatLng.lng},${tlLatLng.lat}]/${SIDE_PX}x${ySide}@2x?access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;

    const response = await fetch(url);
    const staticMapPng = await response.blob();

    return staticMapPng;
}

main();