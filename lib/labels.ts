import pixelWidth from "string-pixel-width";
import type { Shape } from "svg-intersections";
import { intersect, shape } from "svg-intersections";
import seedrandom from "seedrandom";
import type { LabelPoint, SimplePoint, SimpleRect } from "./types";
import { distanceBetweenPoints } from "./geo";

// --- Label Placement Types ---

export interface LabelOffsetOption {
  offset: number;
  offsetPoint: SimplePoint;
  labelRect: SimpleRect;
  shape: Shape;
  prominence: {
    prominence: number;
    closestPoint: LabelPoint | undefined;
  };
}

export interface LabelPlacement extends LabelOffsetOption {
  label: LabelPoint;
  intersects: boolean;
}

export interface LabelPlacementResult {
  result: LabelPlacement[];
  numberOfIntersections: number;
  averageOffset: number;
  labelSeparationScore: number;
  labelProminenceScore: number;
}

// --- Main Algorithm ---

export function calculateBestLabelPositions(
  labelPoints: LabelPoint[],
  maxOffset: number,
  labelFontSizePx: number,
  shapesToAvoid: Shape[],
  maxWidth: number,
  maxHeight: number
): LabelPlacementResult {
  const labelOffsetOptionsMap: Map<LabelPoint, LabelOffsetOption[]> = new Map();

  for (let i = 0; i < labelPoints.length; i++) {
    const label = labelPoints[i];
    if (!label.name) continue;

    const options: LabelOffsetOption[] = [];
    const labelWidth = pixelWidth(label.name, {
      font: "helvetica",
      size: labelFontSizePx,
    });
    const labelHeight = labelFontSizePx;

    for (let offset = 0; offset <= maxOffset; offset += 4) {
      const offsetOptions = generateLabelOffsetOptions(
        label.point,
        offset,
        labelWidth,
        labelHeight,
        maxWidth,
        maxHeight
      );

      for (const offsetPoint of offsetOptions) {
        const labelRect: SimpleRect = {
          x: offsetPoint.x,
          y: offsetPoint.y + labelHeight * 0.1,
          width: labelWidth,
          height: labelHeight,
        };

        const labelShape = shapeForLabel(labelRect);
        const intersects = hasIntersections(shapesToAvoid, labelShape);
        const prominence = calculateIndividualLabelProminence(
          label,
          labelRect,
          labelPoints.filter((_, index) => index !== i)
        );

        if (!intersects) {
          options.push({
            offsetPoint,
            labelRect,
            shape: labelShape,
            prominence,
            offset,
          });
        }
      }
    }

    const filteredOptions = options.filter(
      (option) => option.prominence.prominence > 5
    );
    if (filteredOptions.length < 5) {
      filteredOptions.push(
        ...options
          .sort((a, b) => b.prominence.prominence - a.prominence.prominence)
          .slice(0, 5 - filteredOptions.length)
      );
    }
    labelOffsetOptionsMap.set(label, filteredOptions);
  }

  const rng = seedrandom("travelmaps");
  const numAttempts = 50;
  let bestLabelPlacement: LabelPlacementResult | null = null;

  for (let attempt = 0; attempt < numAttempts; attempt++) {
    const currentPlacement = calculateLabelPositions(
      rng,
      labelPoints,
      labelOffsetOptionsMap,
      shapesToAvoid
    );
    if (
      !bestLabelPlacement ||
      compareLabelPlacement(currentPlacement, bestLabelPlacement) > 0
    ) {
      bestLabelPlacement = currentPlacement;
    }
  }

  if (!bestLabelPlacement) {
    return {
      result: [],
      numberOfIntersections: 0,
      averageOffset: 0,
      labelSeparationScore: 0,
      labelProminenceScore: 0,
    };
  }

  return bestLabelPlacement;
}

function calculateLabelPositions(
  rng: seedrandom.PRNG,
  labels: LabelPoint[],
  labelOffsetOptionsMap: Map<LabelPoint, LabelOffsetOption[]>,
  existingShapes: Shape[]
): LabelPlacementResult {
  const shapes = [...existingShapes];
  const shuffledLabels = [...labels];
  shuffleArray(shuffledLabels, rng);
  const result: LabelPlacement[] = [];

  for (const label of shuffledLabels) {
    if (!label.name) continue;

    const labelOffsetOptions = [...(labelOffsetOptionsMap.get(label) || [])];
    shuffleArray(labelOffsetOptions, rng);
    labelOffsetOptions.sort((a, b) => a.offset - b.offset);

    let hasLabelled = false;
    for (const option of labelOffsetOptions) {
      const intersects = hasIntersections(shapes, option.shape);
      if (!intersects) {
        shapes.push(option.shape);
        result.push({ ...option, label, intersects });
        hasLabelled = true;
        break;
      }
    }
    if (!hasLabelled && labelOffsetOptions.length > 0) {
      const lastOption = labelOffsetOptions[labelOffsetOptions.length - 1];
      shapes.push(lastOption.shape);
      result.push({ ...lastOption, label, intersects: true });
    }
  }

  return {
    result,
    numberOfIntersections: result.filter((l) => l.intersects).length,
    averageOffset: calculateOffsetScore(result),
    labelSeparationScore: calculateLabelSeparation(result),
    labelProminenceScore: calculateLabelProminenceScore(result),
  };
}

// --- Scoring ---

function compareLabelPlacement(
  a: LabelPlacementResult,
  b: LabelPlacementResult
): number {
  return scoreLabelPlacement(a) - scoreLabelPlacement(b);
}

function scoreLabelPlacement(lp: LabelPlacementResult): number {
  return (
    -10000 * lp.numberOfIntersections +
    -2 * lp.averageOffset +
    Math.min(lp.labelSeparationScore, 100) +
    2 * Math.min(lp.labelProminenceScore, 100)
  );
}

function calculateOffsetScore(placements: LabelPlacement[]): number {
  if (placements.length === 0) return 0;
  return generalizedMean(
    placements.map((l) => l.offset),
    2
  );
}

function calculateLabelSeparation(placements: LabelPlacement[]): number {
  if (placements.length < 2) return 0;
  const separations: number[] = [];
  for (let i = 0; i < placements.length; i++) {
    let minDist = Infinity;
    for (let j = 0; j < placements.length; j++) {
      if (i !== j) {
        minDist = Math.min(
          minDist,
          distanceBetweenRectangles(
            placements[i].labelRect,
            placements[j].labelRect
          )
        );
      }
    }
    separations.push(minDist);
  }
  return generalizedMean(separations, -1);
}

function calculateLabelProminenceScore(placements: LabelPlacement[]): number {
  if (placements.length === 0) return 0;
  const minProminence = placements.reduce(
    (min, current) =>
      current.prominence.prominence < min.prominence.prominence ? current : min,
    placements[0]
  );
  return minProminence.prominence.prominence;
}

function calculateIndividualLabelProminence(
  labelPoint: LabelPoint,
  labelRect: SimpleRect,
  otherPoints: LabelPoint[]
) {
  let minDistanceToOtherLabelPoint = Infinity;
  let closestPoint: LabelPoint | undefined = undefined;
  for (const point of otherPoints) {
    const distance = distanceFromPointToRectangle(point.point, labelRect);
    if (distance < minDistanceToOtherLabelPoint) {
      minDistanceToOtherLabelPoint = distance;
      closestPoint = point;
    }
  }
  const ownDistance = distanceFromPointToRectangle(
    labelPoint.point,
    labelRect
  );
  const prominence = minDistanceToOtherLabelPoint - ownDistance;
  return { prominence, closestPoint };
}

// --- Geometry Helpers ---

function generateLabelOffsetOptions(
  point: SimplePoint,
  offset: number,
  labelWidth: number,
  labelHeight: number,
  maxWidth: number,
  maxHeight: number
): SimplePoint[] {
  const diag = offset / Math.SQRT2;
  const buffer = 0.02;

  const candidates: SimplePoint[] = [
    // Diagonal
    { x: point.x + diag, y: point.y + diag },
    { x: point.x + diag, y: point.y - diag - labelHeight },
    { x: point.x - diag - labelWidth, y: point.y - diag - labelHeight },
    { x: point.x - diag - labelWidth, y: point.y + diag },
    // Cardinal
    { x: point.x - labelWidth / 2, y: point.y + offset },
    { x: point.x - labelWidth / 2, y: point.y - offset - labelHeight },
    { x: point.x - offset - labelWidth, y: point.y - labelHeight / 2 },
    { x: point.x + offset, y: point.y - labelHeight / 2 },
  ];

  return candidates.filter(
    (p) =>
      p.x >= maxWidth * buffer &&
      p.y >= maxHeight * buffer &&
      p.x + labelWidth <= maxWidth * (1 - buffer) &&
      p.y + labelHeight <= maxHeight * (1 - buffer)
  );
}

export function shapeForLabel(rect: SimpleRect): Shape {
  let { x, y, width, height } = rect;
  const buf = height * 0.05;
  x -= buf;
  y -= buf;
  width += 2 * buf;
  height += 2 * buf;

  const divisions = 3;
  let d = `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} L ${x} ${y}`;
  for (let i = 1; i <= divisions; i++) {
    d += ` L ${x + width} ${y + (height / divisions) * i} L ${x} ${y + (height / divisions) * i}`;
  }
  return shape("path", { d });
}

export function hasIntersections(shapes: Shape[], testShape: Shape): boolean {
  for (const existingShape of shapes) {
    try {
      const intersection = intersect(existingShape, testShape);
      if (intersection.points.length > 0) {
        return true;
      }
    } catch {
      return true; // Safer to assume intersection on error
    }
  }
  return false;
}

function distanceFromPointToRectangle(
  point: SimplePoint,
  rect: SimpleRect
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceBetweenRectangles(r1: SimpleRect, r2: SimpleRect): number {
  const dx = Math.max(
    r1.x - (r2.x + r2.width),
    0,
    r2.x - (r1.x + r1.width)
  );
  const dy = Math.max(
    r1.y - (r2.y + r2.height),
    0,
    r2.y - (r1.y + r1.height)
  );
  return Math.sqrt(dx * dx + dy * dy);
}

function generalizedMean(array: number[], exponent: number): number {
  if (array.length === 0) return 0;
  if (exponent === 0) {
    const product = array.reduce((a, b) => a * (b > 0 ? b : 1e-9), 1);
    return Math.pow(product, 1 / array.length);
  }
  if (exponent === Infinity) return Math.max(...array);
  if (exponent === -Infinity) return Math.min(...array);

  let sumOfPowers = 0;
  for (const value of array) {
    if (value < 0 && !Number.isInteger(exponent)) {
      return NaN;
    }
    sumOfPowers += Math.pow(value, exponent);
  }
  const meanOfPowers = sumOfPowers / array.length;
  if (meanOfPowers < 0 && !Number.isInteger(1 / exponent)) {
    return NaN;
  }
  return Math.pow(meanOfPowers, 1 / exponent);
}

function shuffleArray<T>(array: T[], rng: seedrandom.PRNG): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
