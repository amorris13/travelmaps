import { cookies } from "next/headers";
import { refreshStravaToken } from "@lib/strava";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

export async function getStravaToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("strava_token");
  if (!tokenCookie) return null;

  try {
    const tokenData: TokenData = JSON.parse(
      Buffer.from(tokenCookie.value, "base64").toString("utf-8")
    );

    // Check if token is expired (with 5min buffer)
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at < now + 300) {
      // Refresh the token
      const clientId = process.env.STRAVA_CLIENT_ID;
      const clientSecret = process.env.STRAVA_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const refreshed = await refreshStravaToken(
        clientId,
        clientSecret,
        tokenData.refresh_token
      );

      // We can't set cookies in a utility function called from API routes,
      // but the caller can handle the refresh. For now, return the new token.
      return refreshed.access_token;
    }

    return tokenData.access_token;
  } catch {
    return null;
  }
}
