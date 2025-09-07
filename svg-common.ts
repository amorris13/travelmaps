import { createSVGWindow } from "svgdom";
import * as SVG from "@svgdotjs/svg.js";
import type { Shape } from "svg-intersections";

import {
  LabelPoint,
  calculateBestLabelPositions,
  addCanvasStyles,
} from "./svg-helpers.js";

export class SvgGenerator {
  public readonly canvas: SVG.Svg;
  public readonly transform: SVG.Matrix;
  public readonly shapes: Shape[] = [];
  public readonly labels: LabelPoint[] = [];
  public readonly markerRadius: number;
  public readonly labelFontSizePx: number;
  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number, transform: SVG.Matrix) {
    this.width = width;
    this.height = height;
    this.transform = transform;

    const window = createSVGWindow();
    const document = window.document;
    SVG.registerWindow(window, document);
    this.canvas = SVG.SVG(document.documentElement) as SVG.Svg;
    this.canvas.viewbox(0, 0, this.width, this.height);

    const { markerRadius, labelFontSizePx } = addCanvasStyles(this.canvas);
    this.markerRadius = markerRadius;
    this.labelFontSizePx = labelFontSizePx;
  }

  public addShape(shape: Shape) {
    this.shapes.push(shape);
  }

  public addLabel(name: string, point: SVG.Point, partialAttendance = false) {
    if (!name) return;
    this.labels.push({ name, point, partialAttendance });
  }

  public placeLabels(maxOffset: number) {
    const bestLabelPlacement = calculateBestLabelPositions(
      this.labels,
      maxOffset,
      this.labelFontSizePx,
      this.shapes,
      this.width,
      this.height
    );

    for (const labelPlacement of bestLabelPlacement.result) {
      if (labelPlacement.intersects) {
        console.log(`Intersecting ${labelPlacement.label.name}`);
      }
      this.canvas
        .rect(labelPlacement.width, labelPlacement.height)
        .at(labelPlacement.point)
        .opacity(0.2)
        .fill(labelPlacement.intersects ? "red" : "green")
        .addClass("labelRect");

      this.addShape(labelPlacement.shape);

      const label = this.canvas
        .text(labelPlacement.label.name)
        .at(labelPlacement.point)
        .addClass("label");
      if (labelPlacement.label.partialAttendance) {
        label.addClass("partialAttendance");
      }
    }
  }
}
