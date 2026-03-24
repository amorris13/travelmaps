import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { renderSvgToPng } from "@/lib/render-server";

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
