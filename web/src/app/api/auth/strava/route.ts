import { NextResponse } from "next/server";
import { randomBytes, createHmac } from "crypto";

export async function GET(request: Request) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Strava credentials not configured" },
      { status: 500 }
    );
  }

  const requestUrl = new URL(request.url);
  const currentOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  const canonicalUrl = process.env.NEXT_PUBLIC_BASE_URL;

  // Use the canonical URL for the redirect_uri if we're not on it.
  // This allows preview deployments and localhost to use the production
  // callback, which can then redirect back to the correct origin.
  const baseUrl = (canonicalUrl || currentOrigin).replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/strava/callback`;

  const scope = "read,activity:read_all";
  const random = randomBytes(16).toString("hex");
  // Sign the current origin so we can safely redirect back to it in the callback
  const signature = createHmac("sha256", clientSecret)
    .update(`${random}:${currentOrigin}`)
    .digest("hex");
  const state = `${random}:${Buffer.from(currentOrigin).toString("base64")}:${signature}`;

  const authUrl = new URL("https://www.strava.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("approval_prompt", "auto");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
