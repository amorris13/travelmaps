import { NextRequest, NextResponse } from "next/server";
import { getStravaToken } from "@/lib/auth";
import { fetchStravaActivity, fetchStravaStreams, toStravaActivityData } from "@lib/strava";
import { cacheGet, cacheSet } from "@/lib/strava-cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tokenResult = await getStravaToken();
  if (!tokenResult) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const cacheKey = `activity-detail:${tokenResult.athleteId}:${id}`;

  try {
    let result = cacheGet<Record<string, unknown>>(cacheKey);

    if (!result) {
      const [activity, streams] = await Promise.all([
        fetchStravaActivity(tokenResult.accessToken, id),
        fetchStravaStreams(tokenResult.accessToken, id),
      ]);

      const activityData = toStravaActivityData(activity, streams);
      result = {
        ...activityData,
        polyline: activity.map?.polyline || activity.map?.summary_polyline,
      };
      cacheSet(cacheKey, result);
    }

    const response = NextResponse.json(result);

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
