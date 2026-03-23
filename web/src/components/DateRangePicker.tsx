"use client";

import * as React from "react";
import { format } from "date-fns";
import { DateRange, DayPicker } from "react-day-picker";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex h-9 w-full items-center justify-start gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-xs font-normal transition-colors hover:bg-gray-50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
            !value?.from && "text-gray-500"
          }`}
        >
          <CalendarIconSVG />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, "LLL dd, y")} -{" "}
                {format(value.to, "LLL dd, y")}
              </>
            ) : (
              format(value.from, "LLL dd, y")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </button>
        {value && (value.from || value.to) && (
          <button
            onClick={() => onChange(undefined)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            title="Clear range"
          >
            <XIconSVG />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="range"
            selected={value}
            onSelect={(range) => {
              onChange(range);
            }}
            classNames={{
              selected: "bg-accent text-white rounded-md",
              range_start: "rounded-l-md",
              range_end: "rounded-r-md",
              range_middle: "bg-red-50 text-accent",
              today: "font-bold text-accent underline",
              outside: "text-gray-300 opacity-50",
              disabled: "text-gray-300 opacity-50",
              chevron: "fill-gray-400",
              month_caption: "flex justify-center text-sm font-medium pt-1 px-10 mb-2 capitalize",
              month: "space-y-4",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "text-gray-400 rounded-md w-9 font-normal text-[0.8rem]",
              weeks: "space-y-1",
              week: "flex w-full mt-2",
              day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 cursor-pointer hover:bg-gray-100 rounded-md flex items-center justify-center",
              day_button: "h-full w-full",
              nav: "flex items-center",
              button_previous: "absolute left-3 top-3 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
              button_next: "absolute right-3 top-3 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
            }}
          />
        </div>
      )}
    </div>
  );
}

function CalendarIconSVG() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-400"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function XIconSVG() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
