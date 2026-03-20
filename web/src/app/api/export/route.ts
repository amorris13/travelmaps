import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { svgString, format, width, height } = body;

    if (!svgString) {
      return NextResponse.json({ error: "SVG string required" }, { status: 400 });
    }

    // For now, return the SVG as-is (PNG/PDF rendering will be added
    // when we install @resvg/resvg-js and pdf-lib)
    if (format === "svg") {
      return new NextResponse(svgString, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Content-Disposition": 'attachment; filename="poster.svg"',
        },
      });
    }

    // TODO: Add PNG export via @resvg/resvg-js
    // TODO: Add PDF export via pdf-lib
    return NextResponse.json(
      { error: `Export format "${format}" not yet implemented. Use "svg" for now.` },
      { status: 501 }
    );
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
