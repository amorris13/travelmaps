"use client";

import { useState, useRef, useCallback } from "react";
import type { PosterConfig, StageConfig } from "@lib/types";
import type { StravaActivity } from "@lib/strava";
import { createDefaultPosterConfig } from "@/lib/poster-config";
import { POSTER_WIDTH, POSTER_HEIGHT } from "@lib/constants";
import { Poster } from "@/components/poster/Poster";
import { ActivitySelector } from "@/components/ActivitySelector";
import { CustomizationPanel } from "@/components/CustomizationPanel";
import { ExportButton } from "@/components/ExportButton";

type Step = 1 | 2;

export default function CreatePage() {
  const [step, setStep] = useState<Step>(1);
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
        // Sort activities chronologically before building stage configs
        const sortedActivities = [...activities].sort((a, b) => {
          if (!a.start_date_local) return 1;
          if (!b.start_date_local) return -1;
          return new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime();
        });

        // Fetch detailed data for each activity
        const stageConfigs: StageConfig[] = await Promise.all(
          sortedActivities.map(async (activity) => {
            const res = await fetch(`/api/strava/activity/${activity.id}`);
            if (!res.ok) throw new Error("Failed to fetch activity details");
            const data = await res.json();

            return {
              activityId: String(activity.id),
              name: activity.name,
              startLabel: "",
              endLabel: "",
              polyline: data.polyline || "",
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

        const title =
          sortedActivities.length === 1
            ? sortedActivities[0].name
            : `${sortedActivities.length}-Stage Journey`;

        const dates = sortedActivities
          .filter((a) => a.start_date_local)
          .map((a) => new Date(a.start_date_local));
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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <a href="/" className="text-lg font-light text-gray-900">
          Travel<span className="text-accent font-normal">Maps</span>
        </a>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={
              step === 1
                ? "text-accent font-medium"
                : "text-gray-400"
            }
          >
            1. Select Activities
          </span>
          <span className="text-gray-300">›</span>
          <span
            className={
              step === 2
                ? "text-accent font-medium"
                : "text-gray-400"
            }
          >
            2. Customize &amp; Export
          </span>
        </div>
        <div className="w-48" />
      </header>

      {/* Step 1: Activity Selection */}
      <main className={`flex-1 overflow-y-auto flex flex-col items-center bg-gray-50 p-8 ${step !== 1 ? "hidden" : ""}`}>
          <div className="w-full max-w-lg">
            <div className="mb-6">
              <h1 className="text-2xl font-light text-gray-900">
                Select Activities
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Choose one or more Strava activities for your poster
              </p>
            </div>
            <ActivitySelector
              onSelect={handleActivitiesSelected}
              selectedIds={selectedIds}
            />
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={selectedActivities.length === 0 || loadingDetails}
                className="px-6 py-2 bg-accent text-white rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {loadingDetails
                  ? "Loading activity data…"
                  : selectedActivities.length === 0
                  ? "Select activities to continue"
                  : `Continue with ${selectedActivities.length} ${
                      selectedActivities.length === 1 ? "activity" : "activities"
                    } →`}
              </button>
            </div>
          </div>
        </main>

      {/* Step 2: Customization + Poster preview */}
      {step === 2 && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar: Customization */}
          <aside className="w-80 shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
            <div className="p-4 space-y-6">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← Back to activities
              </button>

              <CustomizationPanel config={config} onChange={setConfig} />

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Export
                </label>
                <ExportButton posterRef={posterRef} title={config.title} />
              </div>
            </div>
          </aside>

          {/* Main content: Poster preview */}
          <main className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-8">
            {loadingDetails ? (
              <div className="text-gray-400 text-sm">
                Loading activity data…
              </div>
            ) : (
              <div
                className="shadow-2xl h-full"
                style={{
                  aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}`,
                  maxWidth: "100%",
                }}
              >
                <Poster
                  ref={posterRef}
                  config={config}
                  className="w-full h-full"
                />
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
