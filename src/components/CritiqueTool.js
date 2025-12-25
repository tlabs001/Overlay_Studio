import { compareSegments } from '../utils/geometry.js';

export class CritiqueTool {
  constructor(canvas, ctx, refPoints = [], drawPoints = []) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.refPoints = refPoints;
    this.drawPoints = drawPoints;
    this.results = null;
  }

  setPoints(refPoints = [], drawPoints = []) {
    this.refPoints = refPoints;
    this.drawPoints = drawPoints;
  }

  getColorForError(diffPercent) {
    const abs = Math.abs(diffPercent || 0);
    if (abs < 8) return 'rgba(46, 204, 113, 0.85)';
    if (abs < 20) return 'rgba(255, 193, 7, 0.9)';
    return 'rgba(244, 67, 54, 0.9)';
  }

  runSegmentCritique(indexPairs = []) {
    if (!this.ctx || !this.canvas) return null;
    this.results = compareSegments(this.refPoints, this.drawPoints, indexPairs);
    this.renderSegmentErrors();
    return this.results;
  }

  renderSegmentErrors() {
    if (!this.results?.segments?.length || !this.ctx) return;
    this.ctx.save();
    this.ctx.lineWidth = 2;
    this.ctx.font = '14px Arial';

    this.results.segments.forEach((segment) => {
      const refA = this.refPoints[segment.a];
      const refB = this.refPoints[segment.b];
      const drawA = this.drawPoints[segment.a];
      const drawB = this.drawPoints[segment.b];
      if (!refA || !refB || !drawA || !drawB) return;

      this.ctx.strokeStyle = 'rgba(96, 125, 139, 0.9)';
      this.ctx.beginPath();
      this.ctx.moveTo(refA.x, refA.y);
      this.ctx.lineTo(refB.x, refB.y);
      this.ctx.stroke();

      this.ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)';
      this.ctx.beginPath();
      this.ctx.moveTo(drawA.x, drawA.y);
      this.ctx.lineTo(drawB.x, drawB.y);
      this.ctx.stroke();

      if (segment.diffPercent !== null) {
        const midX = (drawA.x + drawB.x) / 2;
        const midY = (drawA.y + drawB.y) / 2;
        this.ctx.fillStyle = this.getColorForError(segment.diffPercent);
        const label = `${segment.diffPercent >= 0 ? '+' : ''}${segment.diffPercent.toFixed(1)}%`;
        this.ctx.fillText(label, midX + 6, midY - 6);
      }
    });

    this.ctx.restore();
  }

  renderGhostCorrections(indexPairs = []) {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.lineWidth = 2;

    indexPairs.forEach(({ a, b }) => {
      const refA = this.refPoints[a];
      const refB = this.refPoints[b];
      const drawA = this.drawPoints[a];
      const drawB = this.drawPoints[b];
      if (!refA || !refB || !drawA || !drawB) return;

      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = 'rgba(239, 83, 80, 0.9)';
      this.ctx.beginPath();
      this.ctx.moveTo(drawA.x, drawA.y);
      this.ctx.lineTo(drawB.x, drawB.y);
      this.ctx.stroke();

      this.ctx.setLineDash([6, 8]);
      this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
      this.ctx.beginPath();
      this.ctx.moveTo(refA.x, refA.y);
      this.ctx.lineTo(refB.x, refB.y);
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  getSummary() {
    if (!this.results) return null;
    const { averageErrorPercent, maxErrorSegment } = this.results;
    return { averageErrorPercent, maxErrorSegment };
  }
}
