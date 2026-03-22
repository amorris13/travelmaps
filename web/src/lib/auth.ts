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

export interface StravaTokenResult {
  accessToken: string;
  athleteId?: number;
  refreshed: boolean;
  tokenCookieValue?: string;
}

export async function getStravaToken(): Promise<StravaTokenResult | null> {
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

      const newPayload = JSON.stringify({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
        athlete: tokenData.athlete,
      });

      return {
        accessToken: refreshed.access_token,
        athleteId: tokenData.athlete?.id,
        refreshed: true,
        tokenCookieValue: Buffer.from(newPayload).toString("base64"),
      };
    }

    return { accessToken: tokenData.access_token, athleteId: tokenData.athlete?.id, refreshed: false };
  } catch {
    return null;
  }
}

/**
 * Helper to set the refreshed token cookie on a NextResponse.
 */
export function setTokenCookie(
  response: Response,
  cookieValue: string
): void {
  const headers = new Headers(response.headers);
  const secure = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 30;
  headers.append(
    "Set-Cookie",
    `strava_token=${cookieValue}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`
  );
}
