import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "MAPBOX_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const query = request.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Mapbox error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const results = (data.features ?? []).map(
      (f: { text: string; center: [number, number]; place_name: string }) => ({
        name: f.text,
        lat: f.center[1],
        lng: f.center[0],
        placeName: f.place_name,
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Forward geocoding error:", err);
    return NextResponse.json(
      { error: "Geocoding failed" },
      { status: 500 }
    );
  }
}
