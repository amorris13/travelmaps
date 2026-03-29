import { PosterConfig } from "@lib/types";

/**
 * Send the poster configuration to the server for high-quality export.
 */
export async function exportPoster(
  config: PosterConfig,
  format: "svg" | "png" | "pdf",
  filename = "poster"
) {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      format,
    }),
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  downloadBlob(blob, `${filename}.${format}`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
