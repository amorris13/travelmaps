import { NextRequest, NextResponse } from "next/server";
import { getStravaToken } from "@/lib/auth";
import { fetchStravaActivity, fetchStravaStreams, toStravaActivityData } from "@lib/strava";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tokenResult = await getStravaToken();
  if (!tokenResult) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [activity, streams] = await Promise.all([
      fetchStravaActivity(tokenResult.accessToken, id),
      fetchStravaStreams(tokenResult.accessToken, id),
    ]);

    const activityData = toStravaActivityData(activity, streams);

    const response = NextResponse.json({
      ...activityData,
      polyline: activity.map?.polyline || activity.map?.summary_polyline,
    });

    // Persist refreshed token
    if (tokenResult.refreshed && tokenResult.tokenCookieValue) {
      response.cookies.set("strava_token", tokenResult.tokenCookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (err) {
    console.error("Failed to fetch activity:", err);
    return NextResponse.json(
      { error: "Failed to fetch activity details" },
      { status: 500 }
    );
  }
}
