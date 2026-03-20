import { NextRequest, NextResponse } from "next/server";
import { computeMapTileParams, buildMapTileUrl } from "@lib/map-tiles";
import { MAP_STYLES } from "@lib/constants";
import type { BBox } from "@lib/geo";

export async function GET(request: NextRequest) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "MAPBOX_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  // Parse bounding box from query params
  const x = parseFloat(request.nextUrl.searchParams.get("x") || "0");
  const y = parseFloat(request.nextUrl.searchParams.get("y") || "0");
  const width = parseFloat(request.nextUrl.searchParams.get("w") || "0");
  const height = parseFloat(request.nextUrl.searchParams.get("h") || "0");
  const styleKey = request.nextUrl.searchParams.get("style") || undefined;
  const sidePx = parseInt(request.nextUrl.searchParams.get("side") || "1200");

  // Translate style key (e.g. "muted") to Mapbox style ID
  const styleId = styleKey && MAP_STYLES[styleKey]
    ? MAP_STYLES[styleKey].id
    : undefined;

  const bbox: BBox = {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
    x2: x + width,
    y2: y + height,
  };

  try {
    const params = computeMapTileParams(bbox, accessToken, styleId, sidePx);
    const url = buildMapTileUrl(params);

    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Mapbox error: ${response.status}` },
        { status: response.status }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("Map tile fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch map tile" },
      { status: 500 }
    );
  }
}
