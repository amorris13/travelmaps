/**
 * Serialize a poster SVG element to string and trigger download.
 */
export async function exportPoster(
  svgElement: SVGSVGElement,
  format: "png" | "pdf",
  filename = "poster"
) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);

  // Inline external images then send to server
  const inlinedSvg = await inlineImages(svgString);

  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      svgString: inlinedSvg,
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

/**
 * Replace all <image> href attributes that are relative URLs with base64 data URIs
 * so that the server-side SVG renderer (resvg) can render them without HTTP access.
 */
async function inlineImages(svgString: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const images = Array.from(doc.querySelectorAll("image"));

  await Promise.all(
    images.map(async (img) => {
      const href =
        img.getAttribute("href") || img.getAttribute("xlink:href");
      if (!href || href.startsWith("data:")) return;

      const response = await fetch(href);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);

      if (img.hasAttribute("href")) {
        img.setAttribute("href", dataUrl);
      } else {
        img.setAttribute("xlink:href", dataUrl);
      }
    })
  );

  return new XMLSerializer().serializeToString(doc.documentElement);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
