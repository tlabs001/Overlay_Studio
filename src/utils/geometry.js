export function calculateDistance(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function calculateAngle(p1, p2, p3) {
  const a = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const b = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  return ((b - a) * 180) / Math.PI;
}

export function compareSegments(refPoints = [], drawPoints = [], indexPairs = []) {
  const segments = indexPairs.map(({ a, b }) => {
    const refA = refPoints[a];
    const refB = refPoints[b];
    const drawA = drawPoints[a];
    const drawB = drawPoints[b];

    const refLen = refA && refB ? calculateDistance(refA, refB) : 0;
    const drawLen = drawA && drawB ? calculateDistance(drawA, drawB) : 0;

    const ratio = refLen > 0 ? drawLen / refLen : null;
    const diffPercent = ratio !== null ? (ratio - 1) * 100 : null;

    return { a, b, refLen, drawLen, ratio, diffPercent };
  });

  const validDiffs = segments.filter((seg) => seg.diffPercent !== null);
  const averageErrorPercent =
    validDiffs.length > 0
      ? validDiffs.reduce((sum, seg) => sum + Math.abs(seg.diffPercent), 0) / validDiffs.length
      : null;

  let maxErrorSegment = null;
  validDiffs.forEach((seg) => {
    if (!maxErrorSegment || Math.abs(seg.diffPercent) > Math.abs(maxErrorSegment.diffPercent)) {
      maxErrorSegment = seg;
    }
  });

  return { segments, averageErrorPercent, maxErrorSegment };
}
