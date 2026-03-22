import type { PosterConfig, StageConfig } from "@lib/types";
import { ACCENT_COLOR } from "@lib/constants";

export function createDefaultPosterConfig(
  stages: StageConfig[],
  title?: string
): PosterConfig {
  const firstDate = stages.length > 0 ? "" : "";
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
  };
}

function addCommas(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1);
    const [whole, dec] = km.split(".");
    return `${addCommas(whole)}.${dec}km`;
  }
  return `${Math.round(meters)}m`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

export function formatSpeed(metersPerSecond: number): string {
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(1)}km/h`;
}

export function formatElevation(meters: number): string {
  return `${addCommas(Math.round(meters).toString())}m`;
}

// Compact formats for stage table (no units)
export function formatDistanceCompact(meters: number): string {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1);
  }
  return Math.round(meters).toString();
}

export function formatDurationCompact(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  }
  return `0:${minutes.toString().padStart(2, "0")}`;
}

export function formatSpeedCompact(metersPerSecond: number): string {
  const kmh = metersPerSecond * 3.6;
  return kmh.toFixed(1);
}

export function formatElevationCompact(meters: number): string {
  return addCommas(Math.round(meters).toString());
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
