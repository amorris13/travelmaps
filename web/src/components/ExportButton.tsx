"use client";

import { useState } from "react";
import { exportPoster } from "@/lib/export";

interface ExportButtonProps {
  posterRef: React.RefObject<SVGSVGElement | null>;
  title: string;
}

export function ExportButton({ posterRef, title }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: "png" | "pdf") {
    if (!posterRef.current) return;
    setExporting(true);
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
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("png")}
        disabled={exporting}
        className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {exporting ? "Exporting..." : "PNG"}
      </button>
      <button
        onClick={() => handleExport("pdf")}
        disabled={exporting}
        className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        PDF
      </button>
    </div>
  );
}
