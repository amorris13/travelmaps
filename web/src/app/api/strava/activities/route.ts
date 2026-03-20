import { NextRequest, NextResponse } from "next/server";
import { getStravaToken } from "@/lib/auth";
import { fetchStravaActivities } from "@lib/strava";
import { cacheGet, cacheSet } from "@/lib/strava-cache";
import type { StravaActivity } from "@lib/strava";

export async function GET(request: NextRequest) {
  const tokenResult = await getStravaToken();
  if (!tokenResult) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
  const perPage = parseInt(request.nextUrl.searchParams.get("per_page") || "30");
  const before = request.nextUrl.searchParams.get("before");
  const after = request.nextUrl.searchParams.get("after");

  const options: { before?: number; after?: number } = {};
  if (before) options.before = Math.floor(new Date(before).getTime() / 1000);
  if (after) options.after = Math.floor(new Date(after).getTime() / 1000);

  const cacheKey = `activities:${page}:${perPage}:${before || ""}:${after || ""}`;

  try {
    let activities = cacheGet<StravaActivity[]>(cacheKey);
    if (!activities) {
      activities = await fetchStravaActivities(tokenResult.accessToken, page, perPage, options);
      cacheSet(cacheKey, activities);
    }

    const response = NextResponse.json(activities);

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
    console.error("Failed to fetch activities:", err);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
