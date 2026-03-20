import { NextRequest, NextResponse } from "next/server";
import { getStravaToken } from "@/lib/auth";
import { fetchStravaActivities } from "@lib/strava";

export async function GET(request: NextRequest) {
  const token = await getStravaToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
  const perPage = parseInt(request.nextUrl.searchParams.get("per_page") || "30");

  try {
    const activities = await fetchStravaActivities(token, page, perPage);
    return NextResponse.json(activities);
  } catch (err) {
    console.error("Failed to fetch activities:", err);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
