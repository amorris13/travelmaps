"use client";

import { useState, useEffect, useMemo } from "react";
import type { StravaActivity } from "@lib/strava";
import { DateRangePicker } from "./DateRangePicker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

interface ActivitySelectorProps {
  onSelect: (activities: StravaActivity[]) => void;
  selectedActivities: StravaActivity[];
}

export function ActivitySelector({
  onSelect,
  selectedActivities,
}: ActivitySelectorProps) {
  const selectedIds = useMemo(() => new Set(selectedActivities.map(a => a.id)), [selectedActivities]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Date range filter
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Direct ID input
  const [activityIdInput, setActivityIdInput] = useState("");
  const [idLoading, setIdLoading] = useState(false);

  // Additional filters
  const [nameFilter, setNameFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [minDistance, setMinDistance] = useState("");
  const [minDuration, setMinDuration] = useState("");

  const activityTypes = useMemo(() => {
    return Array.from(new Set(activities.map((a) => a.type))).sort();
  }, [activities]);

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      if (
        nameFilter &&
        !activity.name.toLowerCase().includes(nameFilter.toLowerCase())
      ) {
        return false;
      }
      if (typeFilter && activity.type !== typeFilter) {
        return false;
      }
      if (minDistance && activity.distance < Number(minDistance) * 1000) {
        return false;
      }
      if (minDuration && activity.moving_time < Number(minDuration) * 60) {
        return false;
      }
      return true;
    });
  }, [activities, nameFilter, typeFilter, minDistance, minDuration]);

  function buildUrl(pageNum: number) {
    const params = new URLSearchParams({
      page: String(pageNum),
      per_page: "200",
    });
    if (dateRange?.from) {
      params.set("after", format(dateRange.from, "yyyy-MM-dd"));
    }
    if (dateRange?.to) {
      params.set("before", format(dateRange.to, "yyyy-MM-dd"));
    }
    return `/api/strava/activities?${params}`;
  }

  async function fetchActivities(pageNum: number, replace = false, urlOverride?: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(urlOverride || buildUrl(pageNum));
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/api/auth/strava";
          return;
        }
        throw new Error("Failed to fetch activities");
      }
      const data: StravaActivity[] = await response.json();
      if (pageNum === 1 || replace) {
        setActivities(data);
      } else {
        setActivities((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === 200);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchActivities(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on mount and when dateRange changes
  }, [dateRange]);

  function clearDateFilter() {
    setDateRange(undefined);
  }

  async function addActivityById() {
    const id = activityIdInput.trim();
    if (!id || !/^\d+$/.test(id)) {
      setError("Please enter a valid numeric activity ID");
      return;
    }

    if (selectedIds.has(Number(id))) {
      setError("Activity already selected");
      return;
    }

    setIdLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strava/activity/${id}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/api/auth/strava";
          return;
        }
        throw new Error(
          res.status === 404
            ? "Activity not found"
            : "Failed to fetch activity"
        );
      }

      // We need the summary info too. Create a minimal StravaActivity from the detail response.
      const data = await res.json();
      const syntheticActivity: StravaActivity = {
        id: Number(id),
        name: data.name,
        distance: data.distance || 0,
        moving_time: data.moving_time || 0,
        elapsed_time: data.elapsed_time || 0,
        total_elevation_gain: data.total_elevation_gain || 0,
        average_speed: data.average_speed || 0,
        max_speed: data.max_speed || 0,
        start_date: "",
        start_date_local: "",
        type: "",
        sport_type: "",
      };

      // Add to visible list and auto-select it.
      setActivities((prev) => {
        if (prev.some((a) => a.id === Number(id))) {
          return prev;
        }
        return [syntheticActivity, ...prev];
      });

      onSelect([...selectedActivities, syntheticActivity]);
      setActivityIdInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIdLoading(false);
    }
  }

  function toggleActivity(activity: StravaActivity) {
    if (selectedIds.has(activity.id)) {
      onSelect(selectedActivities.filter((a) => a.id !== activity.id));
    } else {
      onSelect([...selectedActivities, activity]);
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 bg-white sm:bg-gray-50 pt-1 pb-3 space-y-3 z-20">
        <h3 className="text-sm font-medium text-gray-700">Select Activities</h3>

        {/* Direct activity ID input */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Add by Activity ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={activityIdInput}
              onChange={(e) => setActivityIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addActivityById()}
              placeholder="e.g. 1234567890"
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={addActivityById}
              disabled={idLoading}
              className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {idLoading ? "..." : "Add"}
            </button>
          </div>
        </div>

        {/* Date range filter */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Filter by Date Range
          </label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            className="w-full"
          />
        </div>

        {/* More filters */}
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="block text-xs text-gray-500">More Filters</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filter by name..."
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent bg-white"
              >
                <option value="">All Types</option>
                {activityTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                type="number"
                value={minDistance}
                onChange={(e) => setMinDistance(e.target.value)}
                placeholder="Min distance (km)"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <input
                type="number"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                placeholder="Min duration (min)"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Activity list */}
      <div className="rounded-lg border border-gray-200">
        {filteredActivities.map((activity) => {
          const isSelected = selectedIds.has(activity.id);
          return (
            <button
              key={activity.id}
              onClick={() => toggleActivity(activity)}
              className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 ${
                isSelected ? "bg-red-50 border-l-2 border-l-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {activity.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {activity.start_date_local
                      ? formatDate(activity.start_date_local)
                      : `ID: ${activity.id}`}{" "}
                    &middot; {(activity.distance / 1000).toFixed(1)} km
                    {activity.type ? ` \u00b7 ${activity.type}` : ""}
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
        {!loading && activities.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-400">
            No activities found
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
