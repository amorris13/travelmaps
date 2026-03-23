import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { exchangeStravaToken } from "@lib/strava";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Strava credentials not configured" },
      { status: 500 }
    );
  }

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

  // 1. Verify the state signature and handle cross-domain redirect if necessary.
  // This allows preview deployments to use the canonical domain for the OAuth callback
  // and then bounce back to the correct origin.
  if (!state) {
    return NextResponse.redirect(
      new URL("/?error=no_state", request.url)
    );
  }

  const stateParts = state.split(":");
  if (stateParts.length !== 3) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  const [random, base64Origin, signature] = stateParts;
  const origin = Buffer.from(base64Origin, "base64").toString("utf-8");
  const expectedSignature = createHmac("sha256", clientSecret)
    .update(`${random}:${origin}`)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("Invalid state signature");
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  const currentUrl = new URL(request.url);
  const currentOrigin = `${currentUrl.protocol}//${currentUrl.host}`;

  if (origin !== currentOrigin) {
    // We are on the canonical domain (or another domain). Redirect back to the
    // original origin that initiated the request.
    const redirectUrl = new URL(`${origin}/api/auth/strava/callback`);
    redirectUrl.search = currentUrl.search;
    return NextResponse.redirect(redirectUrl.toString());
  }

  // 2. Now that we are on the correct origin, validate the state against the cookie.
  const storedState = request.cookies.get("oauth_state")?.value;
  if (state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  // We are on the correct origin (the one that initiated the request).
  // Proceed with the token exchange using the same redirect_uri that was
  // used to initiate the OAuth flow.
  const canonicalUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const currentUrl = new URL(request.url);
  const currentOrigin = `${currentUrl.protocol}//${currentUrl.host}`;
  const baseUrl = (canonicalUrl || currentOrigin).replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/strava/callback`;

  try {
    const tokenData = await exchangeStravaToken(
      clientId,
      clientSecret,
      code,
      redirectUri
    );

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
