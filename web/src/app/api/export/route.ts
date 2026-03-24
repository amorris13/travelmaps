import path from "path";
import fs from "fs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";

// Load bundled fonts so Vercel (which has no system fonts) can render text.
function getFontFiles() {
  // Use web/fonts if it exists (for local tests from root), otherwise try fonts (for Vercel)
  let fontsDir = path.join(process.cwd(), "fonts");
  if (!fs.existsSync(fontsDir)) {
    fontsDir = path.join(process.cwd(), "web/fonts");
  }

  if (!fs.existsSync(fontsDir)) {
    return [];
  }

  return fs
    .readdirSync(fontsDir)
    .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
    .map((f) => path.join(fontsDir, f));
}

const fontFiles = getFontFiles();

export function renderSvgToPng(svgString: string, width: number): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles,
      loadSystemFonts: false,
      // Map generic families to the Liberation fonts we bundle
      sansSerifFamily: "Liberation Sans",
      serifFamily: "Liberation Serif",
      defaultFontFamily: "Liberation Sans",
    },
  });
  return resvg.render().asPng();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { svgString, format, width: widthParam } = body;
    const width = widthParam ?? 1200;

    if (!svgString) {
      return NextResponse.json({ error: "SVG string required" }, { status: 400 });
    }

    if (format === "svg") {
      return new NextResponse(svgString, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Content-Disposition": 'attachment; filename="poster.svg"',
        },
      });
    }

    if (format === "png") {
      const pngBuffer = renderSvgToPng(svgString, width);

      return new NextResponse(pngBuffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="poster.png"',
        },
      });
    }

    if (format === "pdf") {
      const pngBuffer = renderSvgToPng(svgString, width);

      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(pngBuffer);
      const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pngImage.width,
        height: pngImage.height,
      });

      const pdfBytes = await pdfDoc.save();

      return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="poster.pdf"',
        },
      });
    }

    return NextResponse.json(
      { error: `Unsupported export format: "${format}"` },
      { status: 400 }
    );
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
