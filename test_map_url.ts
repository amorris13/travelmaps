import { computeMapTileParams, buildMapTileUrl } from "./lib/map-tiles";

const bbox = {
  x: 0,
  y: 0,
  width: 0.1,
  height: 0.1,
  cx: 0.05,
  cy: 0.05,
  x2: 0.1,
  y2: 0.1,
};

const accessToken = process.env.MAPBOX_ACCESS_TOKEN || "pk.eyJ1IjoiYW1vcnJpczEzIiwiYSI6ImNseWs1bWhpZzBicG8ycW96dWZha3pueXoifQ.R7p_9-v5-C1Z7z6Q2-X7Zw"; // Use the one from the code if found or just a dummy if I can't find it.
// Actually I don't have the token. I should check if it's in .env

const style = "amorris13/clyk5oa2u01dw01rba38pe12t";
const params = computeMapTileParams(bbox, "DUMMY_TOKEN", style, 600);
console.log(buildMapTileUrl(params));
