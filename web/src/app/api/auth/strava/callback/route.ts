import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaToken } from "@lib/strava";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      new URL("/?error=strava_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=no_code", request.url)
    );
  }

  // Validate OAuth state parameter
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Strava credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const tokenData = await exchangeStravaToken(clientId, clientSecret, code);

    // Encode token data as base64 JSON in an HTTP-only cookie
    const tokenPayload = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      athlete: tokenData.athlete,
    });

    const response = NextResponse.redirect(new URL("/create", request.url));

    // Clear the OAuth state cookie
    response.cookies.delete("oauth_state");

    response.cookies.set("strava_token", Buffer.from(tokenPayload).toString("base64"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Also set a non-httpOnly flag so client JS can check auth state
    response.cookies.set("strava_authenticated", "true", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    console.error("Strava token exchange error:", err);
    return NextResponse.redirect(
      new URL("/?error=token_exchange", request.url)
    );
  }
}
