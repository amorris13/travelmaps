import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "MAPBOX_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood&access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Mapbox error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const name: string = data.features?.[0]?.text ?? "";
    return NextResponse.json({ name });
  } catch (err) {
    console.error("Reverse geocoding error:", err);
    return NextResponse.json(
      { error: "Reverse geocoding failed" },
      { status: 500 }
    );
  }
}
