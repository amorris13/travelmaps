import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";

// Resolve Montserrat woff2 files from @fontsource/montserrat so the same
// font is used in both the browser and the server-side SVG renderer.
const fontsourceDir = path.join(
  process.cwd(),
  "node_modules/@fontsource/montserrat/files"
);
const fontFiles = [
  "montserrat-latin-400-normal.woff2",
  "montserrat-latin-700-normal.woff2",
].map((f) => path.join(fontsourceDir, f));

function makeResvg(svgString: string, width: number) {
  return new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles,
      loadSystemFonts: false,
      sansSerifFamily: "Montserrat",
      defaultFontFamily: "Montserrat",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { svgString, format, width } = body;

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
      const resvg = makeResvg(svgString, width ?? 1200);
      const pngBuffer = resvg.render().asPng();

      return new NextResponse(pngBuffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="poster.png"',
        },
      });
    }

    if (format === "pdf") {
      const resvg = makeResvg(svgString, width ?? 1200);
      const pngBuffer = resvg.render().asPng();

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
