"use client";

import { useState } from "react";
import type { PosterConfig, StageConfig } from "@lib/types";
import { MAP_STYLES } from "@lib/constants";

interface CustomizationPanelProps {
  config: PosterConfig;
  onChange: (config: PosterConfig) => void;
}

export function CustomizationPanel({
  config,
  onChange,
}: CustomizationPanelProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newLocationQuery, setNewLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [activeTab, setActiveTab] = useState<"content" | "styling">("content");

  function update(partial: Partial<PosterConfig>) {
    onChange({ ...config, ...partial });
  }

  function updateStage(index: number, partial: Partial<StageConfig>) {
    const stages = [...config.stages];
    stages[index] = { ...stages[index], ...partial };
    update({ stages });
  }

  async function handleAddWaypoint() {
    const label = newLabel.trim();
    if (!label) return;

    const query = newLocationQuery.trim() || label;
    setGeocoding(true);
    setGeocodeError("");

    try {
      const res = await fetch(
        `/api/geocode/forward?query=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Geocoding request failed");
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        setGeocodeError(`No location found for "${query}"`);
        return;
      }

      const { lat, lng } = data.results[0];
      update({
        additionalLocations: [
          ...config.additionalLocations,
          { name: label, lat, lng },
        ],
      });
      setNewLabel("");
      setNewLocationQuery("");
    } catch {
      setGeocodeError("Geocoding failed. Please try again.");
    } finally {
      setGeocoding(false);
    }
  }

  function removeWaypoint(index: number) {
    const next = config.additionalLocations.filter((_, i) => i !== index);
    update({ additionalLocations: next });
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 -mx-4 px-4">
        {(["content", "styling"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {activeTab === "content" ? (
          <>
            {/* General */}
            <CollapsibleSection title="General" defaultOpen>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={config.title}
                    onChange={(e) => update({ title: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Date Range
                    <span className="ml-1 text-[10px] text-gray-400 font-normal lowercase tracking-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={config.dateRange}
                    onChange={(e) => update({ dateRange: e.target.value })}
                    placeholder="e.g. July 2024"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Stage Labels */}
            {config.stages.length > 0 && (
              <CollapsibleSection title="Stage Labels" defaultOpen>
                <div className="space-y-3">
                  {config.stages.map((stage, i) => (
                    <div key={stage.activityId} className="space-y-1">
                      <p className="text-xs text-gray-400">Stage {i + 1}</p>
                      <input
                        type="text"
                        value={stage.name}
                        onChange={(e) =>
                          updateStage(i, { name: e.target.value })
                        }
                        placeholder="Stage name"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-1">
                        {i === 0 && (
                          <input
                            type="text"
                            value={stage.startLabel}
                            onChange={(e) =>
                              updateStage(i, { startLabel: e.target.value })
                            }
                            placeholder="Start"
                            className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-accent focus:outline-none"
                          />
                        )}
                        <input
                          type="text"
                          value={stage.endLabel}
                          onChange={(e) =>
                            updateStage(i, { endLabel: e.target.value })
                          }
                          placeholder="End"
                          className={`rounded border border-gray-200 px-2 py-1 text-xs focus:border-accent focus:outline-none${i === 0 ? "" : " col-span-2"}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Additional Waypoints */}
            <CollapsibleSection title="Additional Waypoints" defaultOpen>
              <div>
                {/* Existing waypoints */}
                {config.additionalLocations.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {config.additionalLocations.map((loc, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded border border-gray-200 px-2 py-1.5 bg-white"
                      >
                        <div className="min-w-0">
                          <span className="text-sm text-gray-800 truncate block">
                            {loc.name}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </span>
                        </div>
                        <button
                          onClick={() => removeWaypoint(i)}
                          className="ml-2 shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                          aria-label="Remove waypoint"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add waypoint form */}
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => {
                      setNewLabel(e.target.value);
                      setGeocodeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddWaypoint();
                    }}
                    placeholder="Label (shown on map)"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newLocationQuery}
                    onChange={(e) => {
                      setNewLocationQuery(e.target.value);
                      setGeocodeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddWaypoint();
                    }}
                    placeholder="Location search (optional)"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  {geocodeError && (
                    <p className="text-xs text-red-500">{geocodeError}</p>
                  )}
                  <button
                    onClick={handleAddWaypoint}
                    disabled={!newLabel.trim() || geocoding}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {geocoding ? "Searching…" : "Add Waypoint"}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </>
        ) : (
          <>
            {/* Appearance */}
            <CollapsibleSection title="Appearance" defaultOpen>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={(e) => update({ accentColor: e.target.value })}
                      className="h-8 w-8 cursor-pointer rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={config.accentColor}
                      onChange={(e) => update({ accentColor: e.target.value })}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Map Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(MAP_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        onClick={() => update({ mapStyle: key })}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                          config.mapStyle === key
                            ? "border-accent bg-red-50 text-accent"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Sections */}
            <CollapsibleSection title="Sections" defaultOpen>
              <div className="space-y-3">
                <Toggle
                  label="Elevation Profile"
                  checked={config.showElevation}
                  onChange={(v) => update({ showElevation: v })}
                />
                {config.stages.length > 1 && (
                  <Toggle
                    label="Stage Table"
                    checked={config.showStageTable}
                    onChange={(v) => update({ showStageTable: v })}
                  />
                )}
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-100 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {title}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
