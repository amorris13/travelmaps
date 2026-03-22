"use client";

import { useState, useRef, useCallback } from "react";
import type { PosterConfig, StageConfig } from "@lib/types";
import type { StravaActivity } from "@lib/strava";
import { decodePolyline } from "@lib/geo";
import { createDefaultPosterConfig } from "@/lib/poster-config";
import { Poster } from "@/components/poster/Poster";
import { ActivitySelector } from "@/components/ActivitySelector";
import { CustomizationPanel } from "@/components/CustomizationPanel";
import { ExportButton } from "@/components/ExportButton";

export default function CreatePage() {
  const [selectedActivities, setSelectedActivities] = useState<
    StravaActivity[]
  >([]);
  const [config, setConfig] = useState<PosterConfig>(
    createDefaultPosterConfig([])
  );
  const [loadingDetails, setLoadingDetails] = useState(false);
  const posterRef = useRef<SVGSVGElement>(null);
  const requestIdRef = useRef(0);

  const selectedIds = new Set(selectedActivities.map((a) => a.id));

  const handleActivitiesSelected = useCallback(
    async (activities: StravaActivity[]) => {
      setSelectedActivities(activities);

      if (activities.length === 0) {
        setConfig(createDefaultPosterConfig([]));
        return;
      }

      const currentRequestId = ++requestIdRef.current;
      setLoadingDetails(true);
      try {
        // Fetch detailed data for each activity
        const stageConfigs: StageConfig[] = await Promise.all(
          activities.map(async (activity, index) => {
            const isFirst = index === 0;
            const res = await fetch(`/api/strava/activity/${activity.id}`);
            if (!res.ok) throw new Error("Failed to fetch activity details");
            const data = await res.json();

            const polyline: string = data.polyline || "";
            let startLabel = "";
            let endLabel = "";

            if (polyline) {
              const decoded = decodePolyline(polyline);
              if (decoded.length > 0) {
                const startPt = decoded[0];
                const endPt = decoded[decoded.length - 1];
                const [startRes, endRes] = await Promise.all([
                  isFirst
                    ? fetch(
                        `/api/geocode/reverse?lat=${startPt.lat}&lng=${startPt.lng}`
                      ).then((r) => (r.ok ? r.json() : null))
                    : Promise.resolve(null),
                  fetch(
                    `/api/geocode/reverse?lat=${endPt.lat}&lng=${endPt.lng}`
                  ).then((r) => (r.ok ? r.json() : null)),
                ]);
                startLabel = startRes?.name ?? "";
                endLabel = endRes?.name ?? "";
              }
            }

            return {
              activityId: String(activity.id),
              name: activity.name,
              startLabel,
              endLabel,
              polyline,
              distance: data.distance || activity.distance,
              movingTime: data.moving_time || activity.moving_time,
              elevationGain:
                data.total_elevation_gain || activity.total_elevation_gain,
              averageSpeed: data.average_speed || activity.average_speed,
              elevationStream: data.elevation_stream
                ? data.elevation_stream.split(",").map(Number)
                : [],
              distanceStream: data.distance_stream
                ? data.distance_stream.split(",").map(Number)
                : [],
            };
          })
        );

        // Derive title and date range from activities
        const title =
          activities.length === 1
            ? activities[0].name
            : `${activities.length}-Stage Journey`;

        const dates = activities.map(
          (a) => new Date(a.start_date_local)
        );
        const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
        const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
        const dateRange =
          earliest.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
          }) +
          (dates.length > 1
            ? ` - ${latest.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}`
            : `, ${earliest.getFullYear()}`);

        // Discard stale responses
        if (currentRequestId !== requestIdRef.current) return;

        setConfig({
          ...createDefaultPosterConfig(stageConfigs, title),
          dateRange,
        });
      } catch (err) {
        console.error("Failed to load activity details:", err);
      } finally {
        setLoadingDetails(false);
      }
    },
    []
  );

  return (
    <div className="flex min-h-screen">
      {/* Left sidebar: Activity selection + Customization */}
      <aside className="w-80 shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
        <div className="p-4 border-b border-gray-100">
          <a href="/" className="text-lg font-light text-gray-900">
            Travel<span className="text-accent font-normal">Maps</span>
          </a>
        </div>
        <div className="p-4 space-y-6">
          <ActivitySelector
            onSelect={handleActivitiesSelected}
            selectedIds={selectedIds}
          />

          {config.stages.length > 0 && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <CustomizationPanel
                  config={config}
                  onChange={setConfig}
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Export
                </label>
                <ExportButton posterRef={posterRef} title={config.title} />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main content: Poster preview */}
      <main className="flex-1 flex items-center justify-center bg-gray-100 p-8">
        {loadingDetails ? (
          <div className="text-gray-400 text-sm">
            Loading activity data...
          </div>
        ) : config.stages.length === 0 ? (
          <div className="text-center text-gray-400">
            <p className="text-lg font-light">Select activities to get started</p>
            <p className="text-sm mt-2">
              Choose one or more Strava activities from the sidebar
            </p>
          </div>
        ) : (
          <div className="poster-container w-full max-w-2xl shadow-2xl">
            <Poster ref={posterRef} config={config} className="w-full h-full" />
          </div>
        )}
      </main>
    </div>
  );
}
