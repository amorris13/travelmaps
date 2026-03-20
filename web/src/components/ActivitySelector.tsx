"use client";

import { useState, useEffect } from "react";
import type { StravaActivity } from "@lib/strava";

interface ActivitySelectorProps {
  onSelect: (activities: StravaActivity[]) => void;
  selectedIds: Set<number>;
}

export function ActivitySelector({
  onSelect,
  selectedIds,
}: ActivitySelectorProps) {
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchActivities(1);
  }, []);

  async function fetchActivities(pageNum: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/strava/activities?page=${pageNum}&per_page=30`
      );
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/api/auth/strava";
          return;
        }
        throw new Error("Failed to fetch activities");
      }
      const data: StravaActivity[] = await response.json();
      if (pageNum === 1) {
        setActivities(data);
      } else {
        setActivities((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === 30);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function toggleActivity(activity: StravaActivity) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(activity.id)) {
      newSelected.delete(activity.id);
    } else {
      newSelected.add(activity.id);
    }
    onSelect(activities.filter((a) => newSelected.has(a.id)));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">Select Activities</h3>
      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
        {activities.map((activity) => {
          const isSelected = selectedIds.has(activity.id);
          return (
            <button
              key={activity.id}
              onClick={() => toggleActivity(activity)}
              className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50 ${
                isSelected ? "bg-red-50 border-l-2 border-l-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {activity.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(activity.start_date_local)} &middot;{" "}
                    {(activity.distance / 1000).toFixed(1)} km &middot;{" "}
                    {activity.type}
                  </p>
                </div>
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-accent bg-accent"
                      : "border-gray-300"
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {loading && (
          <div className="p-4 text-center text-sm text-gray-400">
            Loading activities...
          </div>
        )}
      </div>
      {hasMore && !loading && (
        <button
          onClick={() => fetchActivities(page + 1)}
          className="w-full py-2 text-sm text-accent hover:underline"
        >
          Load more
        </button>
      )}
    </div>
  );
}
