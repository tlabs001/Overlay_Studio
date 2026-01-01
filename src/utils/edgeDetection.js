const SOBEL_KERNEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_KERNEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

const DEFAULT_OUTLINE_OPTIONS = {
  maxSide: 640,
  blurRadius: 1.5,
  threshold: 0.22,
  minComponentPixels: 45,
  applyClose: true,
};

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

function grayscaleToFloatArray(imageData) {
  const gray = new Float32Array((imageData.data.length / 4) | 0);
  for (let i = 0, g = 0; i < imageData.data.length; i += 4, g += 1) {
    gray[g] = imageData.data[i];
  }
  return gray;
}

function boxBlurGrayChannel(input, width, height, radius = 1) {
  if (radius <= 0) return input;

  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);
  const kernelSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      const clampedX = Math.min(width - 1, Math.max(0, x));
      sum += input[y * width + clampedX];
    }
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      horizontal[idx] = sum / kernelSize;
      const addIndex = Math.min(width - 1, x + radius + 1);
      const removeIndex = Math.max(0, x - radius);
      sum += input[y * width + addIndex] - input[y * width + removeIndex];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      const clampedY = Math.min(height - 1, Math.max(0, y));
      sum += horizontal[clampedY * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      const idx = y * width + x;
      output[idx] = sum / kernelSize;
      const addIndex = Math.min(height - 1, y + radius + 1);
      const removeIndex = Math.max(0, y - radius);
      sum += horizontal[addIndex * width + x] - horizontal[removeIndex * width + x];
    }
  }

  return output;
}

function computeSobelMagnitude(gray, width, height) {
  const magnitude = new Float32Array(gray.length);
  let maxMagnitude = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const pixel = gray[(y + ky) * width + (x + kx)];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += pixel * SOBEL_KERNEL_X[kernelIndex];
          gy += pixel * SOBEL_KERNEL_Y[kernelIndex];
        }
      }
      const mag = Math.hypot(gx, gy);
      magnitude[y * width + x] = mag;
      if (mag > maxMagnitude) maxMagnitude = mag;
    }
  }

  return { magnitude, maxMagnitude: maxMagnitude || 1 };
}

function thresholdAndClean(magnitude, width, height, options) {
  const { threshold, minComponentPixels, applyClose } = options;
  const normalizedThreshold = threshold > 1 ? threshold / 255 : threshold;
  const binary = new Uint8Array(magnitude.length);
  let maxValue = 0;

  for (let i = 0; i < magnitude.length; i += 1) {
    if (magnitude[i] > maxValue) maxValue = magnitude[i];
  }
  const scale = maxValue ? 255 / maxValue : 1;
  const cutoff = normalizedThreshold * 255;

  for (let i = 0; i < magnitude.length; i += 1) {
    const value = magnitude[i] * scale;
    binary[i] = value > cutoff ? 255 : 0;
  }

  const opened = dilate(erode(binary, width, height), width, height);
  const cleaned = applyClose ? erode(dilate(opened, width, height), width, height) : opened;
  const withoutSpeckles = removeSmallComponents(cleaned, width, height, minComponentPixels);
  return withoutSpeckles;
}

function erode(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let keep = 255;
      for (let ky = -1; ky <= 1 && keep; ky += 1) {
        for (let kx = -1; kx <= 1 && keep; kx += 1) {
          if (mask[(y + ky) * width + (x + kx)] === 0) {
            keep = 0;
          }
        }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
}

function dilate(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let found = 0;
      for (let ky = -1; ky <= 1 && !found; ky += 1) {
        for (let kx = -1; kx <= 1 && !found; kx += 1) {
          if (mask[(y + ky) * width + (x + kx)] === 255) {
            found = 255;
          }
        }
      }
      output[y * width + x] = found;
    }
  }
  return output;
}

function removeSmallComponents(mask, width, height, minSize) {
  if (!minSize) return mask;
  const visited = new Uint8Array(mask.length);
  const output = mask.slice();
  const neighbors = [1, -1, width, -width];

  for (let i = 0; i < mask.length; i += 1) {
    if (visited[i] || output[i] === 0) continue;

    const stack = [i];
    const component = [];
    visited[i] = 1;

    while (stack.length) {
      const idx = stack.pop();
      component.push(idx);
      const y = Math.floor(idx / width);
      const x = idx - y * width;
      for (let n = 0; n < neighbors.length; n += 1) {
        const offset = neighbors[n];
        const nx = x + (offset === 1 ? 1 : offset === -1 ? -1 : 0);
        const ny = y + (offset === width ? 1 : offset === -width ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighborIndex = idx + offset;
        if (!visited[neighborIndex] && output[neighborIndex] === 255) {
          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        }
      }
    }

    if (component.length < minSize) {
      for (let c = 0; c < component.length; c += 1) {
        output[component[c]] = 0;
      }
    }
  }

  return output;
}

function maskToImageData(mask, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const value = mask[i];
    const idx = i * 4;
    data[idx] = value;
    data[idx + 1] = value;
    data[idx + 2] = value;
    data[idx + 3] = value;
  }
  return new ImageData(data, width, height);
}

function extractMaskEdges(mask, width, height) {
  const output = new Uint8Array(mask.length);
  const idx = (x, y) => y * width + x;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const current = mask[idx(x, y)];
      if (!current) continue;

      let hasBackgroundNeighbor = false;
      for (let ny = -1; ny <= 1 && !hasBackgroundNeighbor; ny += 1) {
        for (let nx = -1; nx <= 1 && !hasBackgroundNeighbor; nx += 1) {
          if (nx === 0 && ny === 0) continue;
          const px = x + nx;
          const py = y + ny;
          if (px < 0 || py < 0 || px >= width || py >= height) {
            hasBackgroundNeighbor = true;
            break;
          }
          if (mask[idx(px, py)] === 0) {
            hasBackgroundNeighbor = true;
          }
        }
      }

      if (hasBackgroundNeighbor) {
        output[idx(x, y)] = 255;
      }
    }
  }

  return output;
}

function analyzeMask(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const neighbors = [1, -1, width, -width];
  const totalPixels = width * height;
  let componentCount = 0;
  let largest = 0;
  let totalPerimeter = 0;
  let activePixels = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) continue;
    activePixels += 1;
    if (visited[i]) continue;

    componentCount += 1;
    const stack = [i];
    let area = 0;
    let perimeter = 0;
    visited[i] = 1;

    while (stack.length) {
      const idx = stack.pop();
      const y = Math.floor(idx / width);
      const x = idx - y * width;
      area += 1;

      for (let n = 0; n < neighbors.length; n += 1) {
        const offset = neighbors[n];
        const nx = x + (offset === 1 ? 1 : offset === -1 ? -1 : 0);
        const ny = y + (offset === width ? 1 : offset === -width ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          perimeter += 1;
          continue;
        }
        const neighborIndex = idx + offset;
        if (mask[neighborIndex] === 0) {
          perimeter += 1;
        } else if (!visited[neighborIndex]) {
          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        }
      }
    }

    if (area > largest) largest = area;
    totalPerimeter += perimeter;
  }

  return {
    components: componentCount,
    maxAreaRatio: totalPixels ? largest / totalPixels : 0,
    averagePerimeter: componentCount ? totalPerimeter / componentCount : 0,
    activeRatio: totalPixels ? activePixels / totalPixels : 0,
  };
}

function drawToCanvas(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (image instanceof ImageData || image?.data instanceof Uint8ClampedArray) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    tempCanvas.getContext('2d').putImageData(image, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  } else {
    ctx.drawImage(image, 0, 0, width, height);
  }
  return { canvas, ctx };
}

export function thresholdEdges(imageData, threshold = 128) {
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

export function generateOutlineMask(image, targetWidth, targetHeight, options = {}) {
  if (!image || !targetWidth || !targetHeight) return null;

  const { debugCallback, ...rest } = options || {};
  const opts = { ...DEFAULT_OUTLINE_OPTIONS, ...rest };
  const scale = Math.min(opts.maxSide / targetWidth, opts.maxSide / targetHeight, 1);
  const width = Math.max(1, Math.round(targetWidth * scale));
  const height = Math.max(1, Math.round(targetHeight * scale));
  const blurRadius = Math.max(0, Math.round(opts.blurRadius));
  const scaledMinComponent = Math.max(6, Math.round(opts.minComponentPixels * scale * scale));

  const { ctx, canvas } = drawToCanvas(image, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const grayImage = toGrayscale(imageData);
  const gray = grayscaleToFloatArray(grayImage);
  const blurred = boxBlurGrayChannel(gray, width, height, blurRadius);
  const { magnitude } = computeSobelMagnitude(blurred, width, height);
  const cleanedMask = thresholdAndClean(magnitude, width, height, {
    ...opts,
    minComponentPixels: scaledMinComponent,
  });

  const outlineEdges = extractMaskEdges(cleanedMask, width, height);
  let edgePixels = 0;
  for (let i = 0; i < outlineEdges.length; i += 1) {
    if (outlineEdges[i]) edgePixels += 1;
  }
  const maskStats = analyzeMask(cleanedMask, width, height);
  const edgeMask = edgePixels > 0 ? outlineEdges : cleanedMask;
  const maskImageData = maskToImageData(edgeMask, width, height);

  if (typeof debugCallback === 'function') {
    debugCallback({
      options: opts,
      maskImageData: maskToImageData(cleanedMask, width, height),
      edgeImageData: maskImageData,
      stats: maskStats,
    });
  }

  if (width === targetWidth && height === targetHeight) {
    return maskImageData;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCanvas.getContext('2d').putImageData(maskImageData, 0, 0);

  const upscaleCanvas = document.createElement('canvas');
  upscaleCanvas.width = targetWidth;
  upscaleCanvas.height = targetHeight;
  const upscaleCtx = upscaleCanvas.getContext('2d');
  upscaleCtx.imageSmoothingEnabled = false;
  upscaleCtx.drawImage(maskCanvas, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
  return upscaleCtx.getImageData(0, 0, targetWidth, targetHeight);
}

export function createOutline(imageData, threshold = 50) {
  return generateOutlineMask(imageData, imageData.width, imageData.height, { threshold });
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

function drawEdgePoints(points, width, height) {
  const output = new ImageData(width, height);
  for (let i = 0; i < points.length; i += 1) {
    const { x, y } = points[i];
    const idx = (y * width + x) * 4;
    output.data[idx] = 255;
    output.data[idx + 1] = 255;
    output.data[idx + 2] = 255;
    output.data[idx + 3] = 255;
  }
  return output;
}

export function simplifyEdges(imageData, threshold = 128, epsilon = 1.5) {
  const grayscale = toGrayscale(
    new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
  );
  const binary = thresholdEdges(grayscale, threshold);

  const edgePoints = extractEdgePoints(binary.data, imageData.width, imageData.height);
  const safeEpsilon = Math.max(0.5, epsilon);
  const simplifiedPoints = rdpSimplify(edgePoints, safeEpsilon);

  if (simplifiedPoints.length < 3) {
    return drawEdgePoints(edgePoints, imageData.width, imageData.height);
  }

  return drawSimplifiedEdges(simplifiedPoints, imageData.width, imageData.height);
}
