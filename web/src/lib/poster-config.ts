import type { PosterConfig, StageConfig } from "@lib/types";
import { ACCENT_COLOR } from "@lib/constants";

export function createDefaultPosterConfig(
  stages: StageConfig[],
  title?: string
): PosterConfig {
  return {
    title: title || "My Journey",
    dateRange: "",
    accentColor: ACCENT_COLOR,
    fontFamily: "Helvetica Neue",
    mapStyle: "muted",
    showElevation: true,
    showStageTable: stages.length > 1,
    stages,
    additionalLocations: [],
    units: "metric",
    showSeconds: false,
  };
}

function addCommas(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function usePace(activityType: string): boolean {
  const t = activityType.toLowerCase();
  return t.includes("run") || t.includes("walk") || t.includes("hike");
}

export function isCycling(activityType: string): boolean {
  const t = activityType.toLowerCase();
  return t.includes("ride") || t.includes("cycling") || t.includes("bike");
}

export function formatDistance(
  meters: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (units === "imperial") {
    const miles = meters * 0.000621371;
    if (miles >= 0.1) {
      const decimals = miles < 10 ? 2 : 1;
      const val = miles.toFixed(decimals);
      const [whole, dec] = val.split(".");
      return `${addCommas(whole)}.${dec}mi`;
    }
    const feet = meters * 3.28084;
    return `${Math.round(feet)}ft`;
  }

  if (meters >= 1000) {
    const km = meters / 1000;
    const decimals = km < 10 ? 2 : 1;
    const val = km.toFixed(decimals);
    const [whole, dec] = val.split(".");
    return `${addCommas(whole)}.${dec}km`;
  }
  return `${Math.round(meters)}m`;
}

export function formatDuration(
  seconds: number,
  showSeconds: boolean = false
): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  const includeSeconds = showSeconds || (hours === 0 && minutes < 60);

  if (hours > 0) {
    let res = `${hours}h ${minutes.toString().padStart(2, "0")}m`;
    if (includeSeconds) {
      res += ` ${secs.toString().padStart(2, "0")}s`;
    }
    return res;
  }
  if (includeSeconds) {
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${minutes}m`;
}

export function formatSpeed(
  metersPerSecond: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (units === "imperial") {
    const mph = metersPerSecond * 2.23694;
    return `${mph.toFixed(1)}mph`;
  }
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(1)}km/h`;
}

export function formatPace(
  metersPerSecond: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (metersPerSecond <= 0) return units === "imperial" ? "0:00/mi" : "0:00/km";

  const secondsPerUnit = Math.round(
    units === "imperial"
      ? 1609.34 / metersPerSecond
      : 1000 / metersPerSecond
  );

  const mins = Math.floor(secondsPerUnit / 60);
  const secs = secondsPerUnit % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}${units === "imperial" ? "/mi" : "/km"}`;
}

export function formatElevation(meters: number, units: "metric" | "imperial" = "metric"): string {
  const val = units === "imperial" ? meters * 3.28084 : meters;
  const suffix = units === "imperial" ? "ft" : "m";
  return `${addCommas(Math.round(val).toString())}${suffix}`;
}

// Compact formats for stage table (no units)
export function formatDistanceCompact(
  meters: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (units === "imperial") {
    const miles = meters * 0.000621371;
    return miles.toFixed(miles < 10 ? 2 : 1);
  }
  if (meters >= 1000) {
    const km = meters / 1000;
    return km.toFixed(km < 10 ? 2 : 1);
  }
  return Math.round(meters).toString();
}

export function formatDurationCompact(
  seconds: number,
  showSeconds: boolean = false
): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  const includeSeconds = showSeconds || (hours === 0 && minutes < 60);

  if (hours > 0) {
    const base = `${hours}:${minutes.toString().padStart(2, "0")}`;
    return includeSeconds ? `${base}:${secs.toString().padStart(2, "0")}` : base;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatSpeedCompact(
  metersPerSecond: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (units === "imperial") {
    return (metersPerSecond * 2.23694).toFixed(1);
  }
  const kmh = metersPerSecond * 3.6;
  return kmh.toFixed(1);
}

export function formatPaceCompact(
  metersPerSecond: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (metersPerSecond <= 0) return "0:00";

  const secondsPerUnit = Math.round(
    units === "imperial"
      ? 1609.34 / metersPerSecond
      : 1000 / metersPerSecond
  );

  const mins = Math.floor(secondsPerUnit / 60);
  const secs = secondsPerUnit % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatElevationCompact(meters: number, units: "metric" | "imperial" = "metric"): string {
  const val = units === "imperial" ? meters * 3.28084 : meters;
  return addCommas(Math.round(val).toString());
}

export function totalDistance(stages: StageConfig[]): number {
  return stages.reduce((sum, s) => sum + s.distance, 0);
}

export function totalDuration(stages: StageConfig[]): number {
  return stages.reduce((sum, s) => sum + s.movingTime, 0);
}

export function totalElevation(stages: StageConfig[]): number {
  return stages.reduce((sum, s) => sum + s.elevationGain, 0);
}

export function averageSpeed(stages: StageConfig[]): number {
  const dist = totalDistance(stages);
  const time = totalDuration(stages);
  return time > 0 ? dist / time : 0;
}
