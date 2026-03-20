/**
 * Serialize a poster SVG element to string and trigger download.
 */
export async function exportPoster(
  svgElement: SVGSVGElement,
  format: "svg" | "png" | "pdf",
  filename = "poster"
) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);

  if (format === "svg") {
    downloadBlob(
      new Blob([svgString], { type: "image/svg+xml" }),
      `${filename}.svg`
    );
    return;
  }

  // For PNG/PDF, send to server
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      svgString,
      format,
      width: svgElement.viewBox.baseVal.width,
      height: svgElement.viewBox.baseVal.height,
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
