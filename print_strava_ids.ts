#!/usr/bin/env node

import fs from "node:fs/promises";
import minimist from "minimist";
import dotenv from "dotenv";
import type { Trip } from "./trips.js";

// Load environment variables from .env file
dotenv.config();

interface StravaActivity {
  id: number;
  name: string;
  start_date: string;
}

async function fetchStravaActivities(
  accessToken: string,
  after: number,
  before: number
): Promise<StravaActivity[]> {
  let page = 1;
  const perPage = 30;
  let allActivities: StravaActivity[] = [];
  let keepFetching = true;

  while (keepFetching) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("before", String(before));
    url.searchParams.set("after", String(after));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const activities = (await response.json()) as StravaActivity[];

      if (activities.length > 0) {
        allActivities = allActivities.concat(activities);
        page++;
      } else {
        keepFetching = false;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching Strava activities:`, message);
      keepFetching = false;
      // Re-throw or handle as needed
      throw error;
    }
  }

  return allActivities;
}

async function main() {
  const args = minimist(process.argv.slice(2));

  const fromDateStr = args.from;
  const toDateStr = args.to;
  const accessToken = process.env.STRAVA_ACCESS_TOKEN;

  if (!fromDateStr || !toDateStr) {
    console.error("Usage: --from <yyyy-mm-dd> --to <yyyy-mm-dd>");
    process.exit(1);
  }

  if (!accessToken) {
    console.error(
      "Error: STRAVA_ACCESS_TOKEN is not set in your .env file."
    );
    process.exit(1);
  }

  const fromDate = new Date(fromDateStr);
  const toDate = new Date(toDateStr);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    console.error("Invalid date format. Please use yyyy-mm-dd.");
    process.exit(1);
  }

  // Convert dates to epoch timestamps (seconds)
  const afterTimestamp = Math.floor(fromDate.getTime() / 1000);
  const beforeTimestamp = Math.floor(toDate.getTime() / 1000);

  try {
    const activities = await fetchStravaActivities(
      accessToken,
      afterTimestamp,
      beforeTimestamp
    );

    if (activities.length > 0) {
      const activityIds = activities.map((activity) => activity.id);
      console.log("Fetched Strava Activity IDs:");
      console.log(activityIds.join("\n"));
    } else {
      console.log("No Strava activities found in the given date range.");
    }
  } catch (error) {
    // Error is already logged in fetchStravaActivities
    process.exit(1);
  }
}

main().catch((error) => {
  // Final catch-all for any unhandled errors during main execution
  if (error instanceof Error && error.message.includes("HTTP error")) {
    // No need to log again, as it's handled in the fetch function
  } else {
    console.error("An unexpected error occurred during execution:", error);
  }
  process.exit(1);
});
