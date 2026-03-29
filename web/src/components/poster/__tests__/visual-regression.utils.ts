import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface ComparisonResult {
  mismatchedPixels: number;
  width: number;
  height: number;
  diffPng: Buffer;
}

/**
 * Compare two PNG buffers and return the number of mismatched pixels.
 */
export function comparePngs(img1: Buffer, img2: Buffer, threshold = 0.01): ComparisonResult {
  const png1 = PNG.sync.read(img1);
  const png2 = PNG.sync.read(img2);

  const { width, height } = png1;
  const diff = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(png1.data, png2.data, diff.data, width, height, {
    threshold,
  });

  return {
    mismatchedPixels,
    width,
    height,
    diffPng: PNG.sync.write(diff),
  };
}
