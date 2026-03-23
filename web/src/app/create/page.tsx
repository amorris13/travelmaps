"use client";

import { useState, useRef, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { PosterConfig, StageConfig } from "@lib/types";
import type { StravaActivity } from "@lib/strava";
import { decodePolyline } from "@lib/geo";
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
  const [activeTab, setActiveTab] = useState<"content" | "styling">("content");
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
          sortedActivities.map(async (activity, index) => {
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
          <button
            onClick={() => setStep(1)}
            className={`transition-colors hover:text-accent ${
              step === 1 ? "text-accent font-medium" : "text-gray-400"
            }`}
          >
            <span className="sm:hidden">1</span>
            <span className="hidden sm:inline">1. Select Activities</span>
          </button>
          <span className="text-gray-300">›</span>
          <button
            onClick={() => setStep(2)}
            disabled={selectedActivities.length === 0}
            className={`transition-colors ${
              step === 2
                ? "text-accent font-medium"
                : selectedActivities.length > 0
                ? "text-gray-400 hover:text-accent"
                : "text-gray-300 cursor-not-allowed"
            }`}
          >
            <span className="sm:hidden">2</span>
            <span className="hidden sm:inline">2. Customize &amp; Export</span>
          </button>
        </div>
        <div className="hidden md:block md:w-48" />
      </header>

      {/* Step 1: Activity Selection */}
      <main className={`flex-1 overflow-y-auto flex flex-col items-center bg-gray-50 p-4 sm:p-8 ${step !== 1 ? "hidden" : ""}`}>
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
        <div className="flex flex-col-reverse lg:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar: Customization */}
          <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-r border-gray-200 flex flex-col bg-white h-1/2 lg:h-full">
            {/* Header: Tabs */}
            <div className="shrink-0 border-b border-gray-200 flex items-center px-4">
              <div className="flex flex-1">
                {(["content", "styling"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                      activeTab === tab
                        ? "border-accent text-accent"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <CustomizationPanel
                config={config}
                onChange={setConfig}
                activeTab={activeTab}
              />

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Export
                </label>
                <ExportButton posterRef={posterRef} title={config.title} />
              </div>
            </div>
          </aside>

          {/* Main content: Poster preview */}
          <main className="flex-1 overflow-hidden flex flex-col bg-gray-100 relative">
            {loadingDetails ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Loading activity data…
              </div>
            ) : (
              <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={8}
                centerOnInit
                limitToBounds={false}
              >
                {({ zoomIn, zoomOut, resetTransform }) => (
                  <>
                    <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
                      <button
                        onClick={() => zoomIn()}
                        className="w-10 h-10 bg-white shadow-md border border-gray-200 rounded-md flex items-center justify-center text-gray-600 hover:text-accent transition-colors"
                        title="Zoom In"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => zoomOut()}
                        className="w-10 h-10 bg-white shadow-md border border-gray-200 rounded-md flex items-center justify-center text-gray-600 hover:text-accent transition-colors"
                        title="Zoom Out"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => resetTransform()}
                        className="w-10 h-10 bg-white shadow-md border border-gray-200 rounded-md flex items-center justify-center text-gray-600 hover:text-accent transition-colors"
                        title="Reset View"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>

                    <TransformComponent
                      wrapperClass="!w-full !h-full cursor-grab active:cursor-grabbing"
                      contentClass="!w-full !h-full flex items-center justify-center p-8"
                    >
                      <div
                        className="shadow-2xl"
                        style={{
                          width: "auto",
                          height: "90%",
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
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
