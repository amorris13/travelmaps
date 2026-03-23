"use client";

import { useState, useRef, useEffect } from "react";
import { exportPoster } from "@/lib/export";

interface ExportButtonProps {
  posterRef: React.RefObject<SVGSVGElement | null>;
  title: string;
}

type Format = "svg" | "png" | "pdf";

export function ExportButton({ posterRef, title }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleExport(format: Format) {
    if (!posterRef.current) return;
    setExporting(true);
    setIsOpen(false);
    try {
      const filename = title.toLowerCase().replace(/\s+/g, "-") || "poster";
      await exportPoster(posterRef.current, format, filename);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative inline-flex w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => handleExport("pdf")}
        disabled={exporting}
        className="flex-1 bg-accent text-white px-4 py-2.5 rounded-l-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        {exporting ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Exporting...</span>
          </>
        ) : (
          "Download PDF"
        )}
      </button>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting}
        className="px-2 bg-accent text-white border-l border-white/20 rounded-r-md hover:opacity-90 disabled:opacity-50 transition-all"
        aria-label="Select format"
      >
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
          >
            <span>PDF Document</span>
            <span className="text-[10px] text-gray-400 font-mono">.pdf</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("png")}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
          >
            <span>PNG Image</span>
            <span className="text-[10px] text-gray-400 font-mono">.png</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("svg")}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
          >
            <span>SVG Vector</span>
            <span className="text-[10px] text-gray-400 font-mono">.svg</span>
          </button>
        </div>
      )}
    </div>
  );
}
