import type { BBox } from "./geo";
import { fromMercator } from "./geo";
import { SIDE_PX } from "./constants";

export interface MapTileParams {
  style: string;
  boundsString: string;
  width: number;
  height: number;
  accessToken: string;
}

/**
 * Compute the parameters needed to fetch a Mapbox static map tile.
 * Returns the URL parameters without actually fetching (so it works in both
 * server API routes and CLI scripts).
 */
export function computeMapTileParams(
  boundingBox: BBox,
  accessToken: string,
  style = "amorris13/clyk5oa2u01dw01rba38pe12t",
  sidePx = SIDE_PX
): MapTileParams {
  const maxDim = Math.max(boundingBox.width, boundingBox.height);
  const scale = maxDim === 0 ? 1 : sidePx / maxDim;
  const widthPx = Math.ceil(boundingBox.width * scale);
  const heightPx = Math.ceil(boundingBox.height * scale);

  const tl = fromMercator({ x: boundingBox.x, y: boundingBox.y });
  const br = fromMercator({ x: boundingBox.x2, y: boundingBox.y2 });

  const boundsString = `[${tl.lng},${br.lat},${br.lng},${tl.lat}]`;

  return {
    style,
    boundsString,
    width: widthPx,
    height: heightPx,
    accessToken,
  };
}

export function buildMapTileUrl(params: MapTileParams): string {
  return `https://api.mapbox.com/styles/v1/${params.style}/static/${params.boundsString}/${params.width}x${params.height}@2x?access_token=${params.accessToken}&attribution=false&logo=false`;
}
