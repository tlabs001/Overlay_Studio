import { calculateAngle, calculateDistance } from '../utils/geometry.js';

export class MeasurementTool {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx || this.canvas.getContext('2d');

    this.backgroundRenderer = null;

    this.points = [];
    this.lines = [];
    this.angleTriples = [];

    this.baseUnitLine = null;
    this.baseUnitLength = null;

    this.baseObjectSelection = null;
    this.baseObjectAnchor = null;
    this.baseObjectCallback = null;

    this.unitRuler = {
      position: { x: (canvas?.width || 0) / 2, y: (canvas?.height || 0) / 2 },
      angle: 0,
      lengthInUnits: 6,
    };
    this.rulerInteraction = null;

    this.draggingPointIndex = null;
    this.dragStartTime = null;
    this.pointerDownPosition = null;
    this.longPressThreshold = 150;

    this.snapshots = [];
    this.activeSnapshotIndex = -1;

    this.gestureDrawingEnabled = false;

    this.attachEvents();
  }

  setBackgroundRenderer(renderer) {
    this.backgroundRenderer = renderer;
  }

  setBaseObjectCallback(callback) {
    this.baseObjectCallback = callback;
  }

  startBaseObjectSelection() {
    this.baseObjectSelection = {
      stage: 'reference',
      referencePoint: null,
      drawingPoint: null,
    };
    this.baseObjectAnchor = null;
    if (typeof this.baseObjectCallback === 'function') {
      this.baseObjectCallback(null);
    }
    this.setGestureDrawingEnabled(false);
    this.render();
  }

  clearBaseObjectSelection() {
    this.baseObjectSelection = null;
    this.setGestureDrawingEnabled(true);
  }

  attachEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
  }

  normalizeEventPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  getRulerGeometry() {
    const totalLength = (this.baseUnitLength || 0) * (this.unitRuler.lengthInUnits || 6);
    const direction = { x: Math.cos(this.unitRuler.angle), y: Math.sin(this.unitRuler.angle) };
    const start = {
      x: this.unitRuler.position.x - direction.x * (totalLength / 2),
      y: this.unitRuler.position.y - direction.y * (totalLength / 2),
    };
    const end = {
      x: this.unitRuler.position.x + direction.x * (totalLength / 2),
      y: this.unitRuler.position.y + direction.y * (totalLength / 2),
    };
    const normal = { x: -direction.y, y: direction.x };
    return { start, end, normal, direction, totalLength };
  }

  getRotateHandle() {
    const { start, normal } = this.getRulerGeometry();
    const offset = 28;
    return { x: start.x - normal.x * offset, y: start.y - normal.y * offset };
  }

  hitTestRuler(position) {
    if (!this.baseUnitLength) return null;
    const { start, end } = this.getRulerGeometry();
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return null;

    const t = ((position.x - start.x) * dx + (position.y - start.y) * dy) / lengthSquared;
    const clampedT = Math.max(0, Math.min(1, t));
    const closest = { x: start.x + clampedT * dx, y: start.y + clampedT * dy };
    const distanceToLine = Math.hypot(position.x - closest.x, position.y - closest.y);
    if (distanceToLine <= 14) {
      return 'move';
    }

    const rotateHandle = this.getRotateHandle();
    if (Math.hypot(position.x - rotateHandle.x, position.y - rotateHandle.y) <= 16) {
      return 'rotate';
    }
    return null;
  }

  handlePointerDown(event) {
    const position = this.normalizeEventPosition(event);
    if (this.baseObjectSelection) {
      this.pointerDownPosition = position;
      this.dragStartTime = Date.now();
    }
    if (this.baseUnitLength) {
      const hit = this.hitTestRuler(position);
      if (hit) {
        this.rulerInteraction = {
          mode: hit,
          pointerStart: position,
          angleStart: this.unitRuler.angle,
          offset: { x: position.x - this.unitRuler.position.x, y: position.y - this.unitRuler.position.y },
        };
        return;
      }
    }
    if (!this.gestureDrawingEnabled && !this.baseObjectSelection) return;
    this.pointerDownPosition = position;
    this.dragStartTime = Date.now();
    this.draggingPointIndex = this.findPointIndex(position);
  }

  handlePointerMove(event) {
    if (this.rulerInteraction) {
      const position = this.normalizeEventPosition(event);
      if (this.rulerInteraction.mode === 'move') {
        this.unitRuler.position = {
          x: position.x - this.rulerInteraction.offset.x,
          y: position.y - this.rulerInteraction.offset.y,
        };
      } else if (this.rulerInteraction.mode === 'rotate') {
        this.unitRuler.angle = Math.atan2(
          position.y - this.unitRuler.position.y,
          position.x - this.unitRuler.position.x
        );
      }
      this.render();
      return;
    }

    if (this.draggingPointIndex === null) return;
    if (Date.now() - (this.dragStartTime || 0) < this.longPressThreshold) return;

    const position = this.normalizeEventPosition(event);
    this.points[this.draggingPointIndex] = position;
    this.render();
  }

  handlePointerUp(event) {
    if (this.rulerInteraction) {
      this.rulerInteraction = null;
      return;
    }

    if (this.baseObjectSelection && this.pointerDownPosition) {
      const position = this.normalizeEventPosition(event);
      if (this.baseObjectSelection.stage === 'reference') {
        this.baseObjectSelection.referencePoint = position;
        this.baseObjectSelection.stage = 'drawing';
        this.render();
        this.pointerDownPosition = null;
        return;
      }
      if (this.baseObjectSelection.stage === 'drawing') {
        this.baseObjectSelection.drawingPoint = position;
        this.commitBaseObjectSelection();
        this.pointerDownPosition = null;
        return;
      }
    }
    const wasDragging =
      this.draggingPointIndex !== null && Date.now() - (this.dragStartTime || 0) >= this.longPressThreshold;

    if (!wasDragging && this.pointerDownPosition) {
      const position = this.normalizeEventPosition(event);
      this.addPoint(position.x, position.y);
    }

    this.draggingPointIndex = null;
    this.dragStartTime = null;
    this.pointerDownPosition = null;
  }

  findPointIndex(position) {
    const hitRadius = 10;
    for (let i = 0; i < this.points.length; i += 1) {
      const point = this.points[i];
      if (Math.hypot(point.x - position.x, point.y - position.y) <= hitRadius) {
        return i;
      }
    }
    return null;
  }

  addPoint(x, y) {
    this.points.push({ x, y });

    if (this.points.length >= 2) {
      const lastIndex = this.points.length - 1;
      this.lines.push({ fromIndex: lastIndex - 1, toIndex: lastIndex });
    }

    if (this.points.length >= 3) {
      const lastIndex = this.points.length - 1;
      this.angleTriples.push({ a: lastIndex - 2, b: lastIndex - 1, c: lastIndex });
    }

    this.render();
  }

  commitBaseObjectSelection() {
    const referencePoint = this.baseObjectSelection?.referencePoint || null;
    const drawingPoint = this.baseObjectSelection?.drawingPoint || null;
    this.baseObjectSelection = null;
    this.setGestureDrawingEnabled(true);

    if (!referencePoint || !drawingPoint) {
      this.render();
      return;
    }

    const startIndex = this.points.length;
    this.points.push(referencePoint, drawingPoint);
    this.lines.push({ fromIndex: startIndex, toIndex: startIndex + 1 });
    this.baseObjectAnchor = { reference: referencePoint, drawing: drawingPoint };
    this.setBaseUnit(startIndex, startIndex + 1);
    if (typeof this.baseObjectCallback === 'function') {
      this.baseObjectCallback(this.baseObjectAnchor);
    }
    this.render();
  }

  setBaseUnit(fromIndex, toIndex) {
    if (!this.points[fromIndex] || !this.points[toIndex]) return;
    const distance = calculateDistance(this.points[fromIndex], this.points[toIndex]);
    this.baseUnitLine = { fromIndex, toIndex };
    this.baseUnitLength = distance || null;
    if (this.baseUnitLength && this.canvas) {
      this.unitRuler.position = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
      this.unitRuler.angle = 0;
    }
    this.render();
  }

  setPointsFromLandmarks(landmarkPoints = []) {
    this.points = landmarkPoints.map((p) => ({ ...p }));
    this.lines = [];
    this.angleTriples = [];
    for (let i = 0; i < this.points.length - 1; i += 1) {
      this.lines.push({ fromIndex: i, toIndex: i + 1 });
    }
    for (let i = 0; i < this.points.length - 2; i += 1) {
      this.angleTriples.push({ a: i, b: i + 1, c: i + 2 });
    }
    this.baseUnitLine = null;
    this.baseUnitLength = null;
    this.render();
  }

  undoPoint() {
    if (!this.points.length) return;
    this.points.pop();
    const maxIndex = this.points.length - 1;
    this.lines = this.lines.filter((line) => line.fromIndex <= maxIndex && line.toIndex <= maxIndex);
    this.angleTriples = this.angleTriples.filter(
      (triple) => triple.a <= maxIndex && triple.b <= maxIndex && triple.c <= maxIndex
    );

    if (
      this.baseUnitLine &&
      (this.baseUnitLine.fromIndex > maxIndex || this.baseUnitLine.toIndex > maxIndex)
    ) {
      this.baseUnitLine = null;
      this.baseUnitLength = null;
    }

    const baseRefIndex = this.points.indexOf(this.baseObjectAnchor?.reference);
    const baseDrawIndex = this.points.indexOf(this.baseObjectAnchor?.drawing);
    if (baseRefIndex === -1 || baseDrawIndex === -1) {
      this.baseObjectAnchor = null;
      if (typeof this.baseObjectCallback === 'function') {
        this.baseObjectCallback(null);
      }
    }

    this.render();
  }

  clearAll() {
    this.points = [];
    this.lines = [];
    this.angleTriples = [];
    this.baseUnitLine = null;
    this.baseUnitLength = null;
    this.baseObjectSelection = null;
    this.baseObjectAnchor = null;
    if (typeof this.baseObjectCallback === 'function') {
      this.baseObjectCallback(null);
    }
    this.unitRuler = {
      ...this.unitRuler,
      angle: 0,
      position: { x: (this.canvas?.width || 0) / 2, y: (this.canvas?.height || 0) / 2 },
    };
    this.render();
  }

  getBaseDistance() {
    return this.baseUnitLength || null;
  }

  setGestureDrawingEnabled(enabled) {
    this.gestureDrawingEnabled = enabled;
  }

  drawBaseObjectOverlay() {
    if (!this.ctx) return;
    this.ctx.save();

    if (this.baseObjectSelection) {
      this.ctx.fillStyle = 'rgba(244, 63, 94, 0.85)';
      this.ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      const { referencePoint, drawingPoint, stage } = this.baseObjectSelection;
      const drawMarker = (point, label) => {
        if (!point) return;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '11px Inter, system-ui, sans-serif';
        this.ctx.fillText(label, point.x + 12, point.y - 2);
        this.ctx.fillStyle = 'rgba(244, 63, 94, 0.85)';
      };
      drawMarker(referencePoint, 'Reference base');
      drawMarker(drawingPoint, 'Drawing base');

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      this.ctx.fillRect(12, this.canvas.height - 36, 260, 26);
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.font = '13px Inter, system-ui, sans-serif';
      const text = stage === 'reference' ? 'Tap the reference anchor point' : 'Tap the matching spot on the drawing';
      this.ctx.fillText(text, 18, this.canvas.height - 18);
    }

    if (this.baseObjectAnchor?.reference && this.baseObjectAnchor?.drawing) {
      this.ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)';
      this.ctx.setLineDash([6, 6]);
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(this.baseObjectAnchor.reference.x, this.baseObjectAnchor.reference.y);
      this.ctx.lineTo(this.baseObjectAnchor.drawing.x, this.baseObjectAnchor.drawing.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const drawAnchor = (point, label, color) => {
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#0f172a';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = '#0f172a';
        this.ctx.font = '12px Inter, system-ui, sans-serif';
        this.ctx.fillText(label, point.x + 12, point.y + 4);
      };

      drawAnchor(this.baseObjectAnchor.reference, 'Base: Ref', 'rgba(244, 114, 182, 0.9)');
      drawAnchor(this.baseObjectAnchor.drawing, 'Base: Drawing', 'rgba(52, 211, 153, 0.9)');
    }

    this.ctx.restore();
  }

  drawUnitRuler() {
    if (!this.baseUnitLength) return;
    const unit = this.baseUnitLength;
    const { start, end, normal, direction, totalLength } = this.getRulerGeometry();
    const ctx = this.ctx;

    const drawTick = (units, style = {}) => {
      const offset = unit * units;
      const basePoint = {
        x: start.x + direction.x * offset,
        y: start.y + direction.y * offset,
      };
      const halfLength = (style.length || 12) / 2;
      ctx.save();
      ctx.strokeStyle = style.color || '#e2e8f0';
      ctx.lineWidth = style.width || 2;
      ctx.beginPath();
      ctx.moveTo(basePoint.x - normal.x * halfLength, basePoint.y - normal.y * halfLength);
      ctx.lineTo(basePoint.x + normal.x * halfLength, basePoint.y + normal.y * halfLength);
      ctx.stroke();
      if (style.label) {
        ctx.fillStyle = '#0f172a';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillText(style.label, basePoint.x + normal.x * (halfLength + 6), basePoint.y + normal.y * (halfLength + 6));
      }
      ctx.restore();
    };

    ctx.save();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    const tickDefs = [
      { step: 0.25, color: '#60a5fa', width: 1.5, length: 10, label: '0.25' },
      { step: 1 / 3, color: '#a855f7', width: 1.6, length: 10, label: '0.33' },
      { step: 0.5, color: '#f59e0b', width: 2, length: 12, label: '0.5' },
      { step: 1, color: '#22c55e', width: 2.4, length: 14, label: '1' },
      { step: 2, color: '#38bdf8', width: 2.8, length: 16, label: '2' },
      { step: 3, color: '#f97316', width: 3, length: 16, label: '3' },
      { step: 4, color: '#e11d48', width: 3.2, length: 16, label: '4' },
      { step: 5, color: '#0ea5e9', width: 3.2, length: 16, label: '5' },
      { step: 6, color: '#94a3b8', width: 3.4, length: 16, label: '6' },
    ];

    drawTick(0, { color: '#e2e8f0', width: 3, length: 18, label: '0' });

    tickDefs.forEach((def) => {
      const maxUnits = this.unitRuler.lengthInUnits || 6;
      for (let u = def.step; u <= maxUnits + 0.001; u += def.step) {
        drawTick(u, def);
      }
    });

    const rotateHandle = this.getRotateHandle();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.beginPath();
    ctx.arc(rotateHandle.x, rotateHandle.y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText(`${(totalLength / unit).toFixed(1)} units`, end.x + normal.x * 16, end.y + normal.y * 16);
    ctx.restore();
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    if (typeof this.backgroundRenderer === 'function') {
      this.backgroundRenderer();
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.save();
    this.ctx.lineWidth = 2;
    this.ctx.font = '12px Arial';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = '#10b981';
    this.ctx.strokeStyle = '#10b981';

    // Draw lines and distance labels
    this.lines.forEach((line) => {
      const p1 = this.points[line.fromIndex];
      const p2 = this.points[line.toIndex];
      if (!p1 || !p2) return;

      const distance = calculateDistance(p1, p2);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const isBase =
        this.baseUnitLine &&
        line.fromIndex === this.baseUnitLine.fromIndex &&
        line.toIndex === this.baseUnitLine.toIndex;

      this.ctx.save();
      this.ctx.strokeStyle = isBase ? '#f59e0b' : '#10b981';
      this.ctx.lineWidth = isBase ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
      this.ctx.restore();

      let label = `${Math.round(distance)}px`;
      if (!isBase && this.baseUnitLength) {
        const ratio = distance / this.baseUnitLength;
        label = `${Math.round(distance)}px (${ratio.toFixed(2)}×)`;
      }

      const padding = 4;
      const textWidth = this.ctx.measureText(label).width;
      const boxX = midX + 8;
      const boxY = midY - 8;
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(boxX - padding, boxY - padding, textWidth + padding * 2, 16 + padding * 2);
      this.ctx.fillStyle = '#fff';
      this.ctx.fillText(label, boxX, midY);
      this.ctx.restore();
    });

    this.drawUnitRuler();

    this.drawBaseObjectOverlay();

    // Draw points
    this.points.forEach((point) => {
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      this.ctx.fillStyle = '#10b981';
      this.ctx.fill();
      this.ctx.strokeStyle = '#0f766e';
      this.ctx.stroke();
    });

    // Draw angles
    this.angleTriples.forEach((triple) => {
      const pA = this.points[triple.a];
      const pB = this.points[triple.b];
      const pC = this.points[triple.c];
      if (!pA || !pB || !pC) return;

      const angleValue = calculateAngle(pA, pB, pC);
      const angleDeg = Number(angleValue);

      const radius = 18;
      const startAngle = Math.atan2(pA.y - pB.y, pA.x - pB.x);
      const endAngle = Math.atan2(pC.y - pB.y, pC.x - pB.x);

      this.ctx.save();
      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.beginPath();
      this.ctx.arc(pB.x, pB.y, radius, startAngle, endAngle, false);
      this.ctx.stroke();

      const label = `${Math.round(angleDeg)}°`;
      const textWidth = this.ctx.measureText(label).width;
      const boxX = pB.x + radius + 4;
      const boxY = pB.y - radius - 8;
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(boxX - 4, boxY - 4, textWidth + 8, 16 + 8);
      this.ctx.fillStyle = '#fff';
      this.ctx.fillText(label, boxX, boxY + 8);
      this.ctx.restore();
    });

    this.ctx.restore();
  }

  snapshot() {
    const snap = this.getState();
    snap.timestamp = Date.now();
    this.snapshots = this.snapshots.slice(0, this.activeSnapshotIndex + 1);
    this.snapshots.push(snap);
    this.activeSnapshotIndex = this.snapshots.length - 1;
    return snap;
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;
    this.applyState(snapshot);
  }

  previousSnapshot() {
    if (this.activeSnapshotIndex <= 0) return;
    this.activeSnapshotIndex -= 1;
    this.applySnapshot(this.snapshots[this.activeSnapshotIndex]);
  }

  nextSnapshot() {
    if (this.activeSnapshotIndex >= this.snapshots.length - 1) return;
    this.activeSnapshotIndex += 1;
    this.applySnapshot(this.snapshots[this.activeSnapshotIndex]);
  }

  getState() {
    return {
      points: this.points.map((p) => ({ ...p })),
      lines: this.lines.map((l) => ({ ...l })),
      angleTriples: this.angleTriples.map((t) => ({ ...t })),
      baseUnitLine: this.baseUnitLine ? { ...this.baseUnitLine } : null,
      baseUnitLength: this.baseUnitLength,
      snapshots: this.snapshots.map((snap) => ({ ...snap })),
      activeSnapshotIndex: this.activeSnapshotIndex,
      unitRuler: { ...this.unitRuler },
      baseObjectAnchor: this.baseObjectAnchor
        ? { reference: { ...this.baseObjectAnchor.reference }, drawing: { ...this.baseObjectAnchor.drawing } }
        : null,
    };
  }

  applyState(state = {}) {
    this.points = (state.points || []).map((p) => ({ ...p }));
    this.lines = (state.lines || []).map((l) => ({ ...l }));
    this.angleTriples = (state.angleTriples || []).map((t) => ({ ...t }));
    this.baseUnitLine = state.baseUnitLine ? { ...state.baseUnitLine } : null;
    this.baseUnitLength = state.baseUnitLength || null;
    this.baseObjectAnchor = state.baseObjectAnchor
      ? { reference: { ...state.baseObjectAnchor.reference }, drawing: { ...state.baseObjectAnchor.drawing } }
      : null;
    this.snapshots = (state.snapshots || []).map((snap) => ({ ...snap }));
    this.activeSnapshotIndex =
      typeof state.activeSnapshotIndex === 'number' ? state.activeSnapshotIndex : this.snapshots.length - 1;
    this.unitRuler = state.unitRuler ? { ...state.unitRuler } : this.unitRuler;
    this.rulerInteraction = null;
    if (typeof this.baseObjectCallback === 'function') {
      this.baseObjectCallback(this.baseObjectAnchor);
    }
    this.render();
  }

  draw() {
    this.render();
  }
}
