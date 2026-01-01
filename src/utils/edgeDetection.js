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

function clampRefinement(value = 0) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function applyBoxBlur(imageData, radius = 1) {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return imageData;

  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const channels = 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let ky = -r; ky <= r; ky += 1) {
        for (let kx = -r; kx <= r; kx += 1) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const idx = (ny * width + nx) * channels;
          sum += data[idx];
          count += 1;
        }
      }
      const avg = sum / Math.max(1, count);
      const outIndex = (y * width + x) * channels;
      output[outIndex] = avg;
      output[outIndex + 1] = avg;
      output[outIndex + 2] = avg;
      output[outIndex + 3] = 255;
    }
  }

  return new ImageData(output, width, height);
}

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

function imageDataToMask(imageData) {
  const { data } = imageData;
  const mask = new Uint8Array((data.length / 4) | 0);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    mask[p] = data[i + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function maskToImageData(mask, width, height) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const value = mask[i] ? 255 : 0;
    const outIndex = i * 4;
    output[outIndex] = value;
    output[outIndex + 1] = value;
    output[outIndex + 2] = value;
    output[outIndex + 3] = value;
  }
  return new ImageData(output, width, height);
}

function pruneIsolatedPixels(mask, width, height, minNeighbors = 0) {
  if (minNeighbors <= 0) return Uint8Array.from(mask);

  const pruned = new Uint8Array(mask.length);
  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      let neighbors = 0;
      for (let i = 0; i < neighborOffsets.length; i += 1) {
        const [ox, oy] = neighborOffsets[i];
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (mask[nIdx]) neighbors += 1;
      }
      if (neighbors >= minNeighbors) {
        pruned[idx] = 1;
      }
    }
  }

  return pruned;
}

function removeSmallComponents(mask, width, height, minSize = 0) {
  if (minSize <= 0) return Uint8Array.from(mask);

  const visited = new Uint8Array(mask.length);
  const kept = new Uint8Array(mask.length);
  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (!mask[startIdx] || visited[startIdx]) continue;

      const stack = [startIdx];
      const component = [];
      visited[startIdx] = 1;

      while (stack.length) {
        const current = stack.pop();
        component.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);

        for (let i = 0; i < neighborOffsets.length; i += 1) {
          const [ox, oy] = neighborOffsets[i];
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (visited[nIdx] || !mask[nIdx]) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }

      if (component.length >= minSize) {
        for (let i = 0; i < component.length; i += 1) {
          kept[component[i]] = 1;
        }
      }
    }
  }

  return kept;
}

function computeCoverage(mask, width, height) {
  let edges = 0;
  for (let i = 0; i < mask.length; i += 1) {
    edges += mask[i] ? 1 : 0;
  }
  return edges / Math.max(1, width * height);
}

function cleanupOutlineMask(mask, width, height, refinement = 0) {
  const minNeighbors = refinement === 0 ? 0 : 1 + Math.floor((refinement / 100) * 2);
  const minComponentPixels = refinement === 0 ? 0 : Math.round(5 + (refinement / 100) * 80);

  const applyCleanup = (neighbors, componentThreshold) => {
    const pruned = pruneIsolatedPixels(mask, width, height, neighbors);
    return removeSmallComponents(pruned, width, height, componentThreshold);
  };

  const baseCoverage = computeCoverage(mask, width, height);
  const cleaned = applyCleanup(minNeighbors, minComponentPixels);
  const cleanedCoverage = computeCoverage(cleaned, width, height);

  if (
    baseCoverage > 0 &&
    cleanedCoverage < baseCoverage * 0.3 &&
    refinement < 80
  ) {
    const relaxedNeighbors = Math.max(0, minNeighbors - 1);
    const relaxedComponent = Math.max(0, Math.floor(minComponentPixels / 2));
    return applyCleanup(relaxedNeighbors, relaxedComponent);
  }

  return cleaned;
}

export function createOutline(imageData, threshold = 50, opts = {}) {
  const refinement = clampRefinement(opts?.refinement ?? 0);
  const grayscale = toGrayscale(imageData);
  const prefiltered = refinement >= 60 ? applyBoxBlur(grayscale, 1) : grayscale;
  const sobel = applySobelEdges(prefiltered);
  const binary = thresholdEdges(sobel, threshold);

  if (refinement === 0) {
    return binary;
  }

  const mask = imageDataToMask(binary);
  const cleanedMask = cleanupOutlineMask(mask, binary.width, binary.height, refinement);
  return maskToImageData(cleanedMask, binary.width, binary.height);
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
