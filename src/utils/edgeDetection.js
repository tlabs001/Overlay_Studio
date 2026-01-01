const SOBEL_KERNEL_X = [
  -1, 0, 1,
  -2, 0, 2,
  -1, 0, 1,
];

const SOBEL_KERNEL_Y = [
  -1, -2, -1,
  0, 0, 0,
  1, 2, 1,
];

export function toGrayscale(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[i] = luminance;
    gray[i + 1] = luminance;
    gray[i + 2] = luminance;
    gray[i + 3] = 255;
  }

  return new ImageData(gray, width, height);
}

export function applySobelEdges(imageData) {
  const { width, height, data } = imageData;
  const grayscale = new Float32Array((data.length / 4) | 0);

  for (let i = 0, g = 0; i < data.length; i += 4, g += 1) {
    grayscale[g] = data[i];
  }

  const output = new Uint8ClampedArray(data.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const pixel = grayscale[(y + ky) * width + (x + kx)];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += pixel * SOBEL_KERNEL_X[kernelIndex];
          gy += pixel * SOBEL_KERNEL_Y[kernelIndex];
        }
      }
      const magnitude = Math.min(255, Math.hypot(gx, gy));
      const outIndex = (y * width + x) * 4;
      output[outIndex] = magnitude;
      output[outIndex + 1] = magnitude;
      output[outIndex + 2] = magnitude;
      output[outIndex + 3] = 255;
    }
  }

  return new ImageData(output, width, height);
}

export function thresholdEdges(imageData, threshold = 50) {
  const { width, height, data } = imageData;
  const binary = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    binary[i] = value;
    binary[i + 1] = value;
    binary[i + 2] = value;
    binary[i + 3] = value ? 255 : 0;
  }

  return new ImageData(binary, width, height);
}

export function createOutline(imageData, threshold = 50) {
  const grayscale = toGrayscale(imageData);
  const sobel = applySobelEdges(grayscale);
  return thresholdEdges(sobel, threshold);
}

export function posterizeImage(imageData, levels = 4) {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const clampedLevels = Math.max(1, levels);
  const step = 255 / clampedLevels;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const bucket = Math.floor((gray / 255) * clampedLevels);
    const value = (bucket / clampedLevels) * 255;
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    output[i + 3] = data[i + 3];
  }

  return new ImageData(output, width, height);
}

function rdpSimplify(points, epsilon) {
  if (points.length < 3) return points;

  const getPerpendicularDistance = (p, lineStart, lineEnd) => {
    const area =
      Math.abs(
        0.5 *
          (lineStart.x * (lineEnd.y - p.y) +
            lineEnd.x * (p.y - lineStart.y) +
            p.x * (lineStart.y - lineEnd.y))
      );
    const bottom = Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y);
    return bottom === 0 ? 0 : (2 * area) / bottom;
  };

  const recursiveSimplify = (pts) => {
    if (pts.length < 3) return pts;

    let maxDistance = 0;
    let index = 0;

    for (let i = 1; i < pts.length - 1; i += 1) {
      const distance = getPerpendicularDistance(pts[i], pts[0], pts[pts.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > epsilon) {
      const left = recursiveSimplify(pts.slice(0, index + 1));
      const right = recursiveSimplify(pts.slice(index));
      return left.slice(0, -1).concat(right);
    }

    return [pts[0], pts[pts.length - 1]];
  };

  return recursiveSimplify(points);
}

function extractEdgePoints(mask, width, height) {
  const points = [];
  const idx = (x, y) => (y * width + x) * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const current = mask[idx(x, y)] === 255;
      if (!current) continue;
      const neighbors = [
        mask[idx(x - 1, y)],
        mask[idx(x + 1, y)],
        mask[idx(x, y - 1)],
        mask[idx(x, y + 1)],
      ];
      const hasBackgroundNeighbor = neighbors.some((value) => value === 0);
      if (hasBackgroundNeighbor) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function drawSimplifiedEdges(points, width, height) {
  const output = new ImageData(width, height);
  const setPixel = (x, y) => {
    const i = (y * width + x) * 4;
    output.data[i] = 255;
    output.data[i + 1] = 255;
    output.data[i + 2] = 255;
    output.data[i + 3] = 255;
  };

  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(start.x + (dx * step) / steps);
      const y = Math.round(start.y + (dy * step) / steps);
      setPixel(x, y);
    }
  }

  return output;
}

export function simplifyEdges(imageData, threshold = 128, epsilon = 2.5) {
  const grayscale = toGrayscale(
    new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
  );
  const binary = thresholdEdges(grayscale, threshold);

  const edgePoints = extractEdgePoints(binary.data, imageData.width, imageData.height);
  const simplifiedPoints = rdpSimplify(edgePoints, epsilon);

  return drawSimplifiedEdges(simplifiedPoints, imageData.width, imageData.height);
}
