import { NextRequest, NextResponse } from "next/server";
import { getStravaToken } from "@/lib/auth";
import { fetchStravaActivity, fetchStravaStreams, toStravaActivityData } from "@lib/strava";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getStravaToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [activity, streams] = await Promise.all([
      fetchStravaActivity(token, id),
      fetchStravaStreams(token, id),
    ]);

    const activityData = toStravaActivityData(activity, streams);

    return NextResponse.json({
      ...activityData,
      polyline: activity.map?.polyline || activity.map?.summary_polyline,
    });
  } catch (err) {
    console.error("Failed to fetch activity:", err);
    return NextResponse.json(
      { error: "Failed to fetch activity details" },
      { status: 500 }
    );
  }
}
