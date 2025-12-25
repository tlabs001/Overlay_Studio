export class BrushTool {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.isDrawing = false;
    this.lastPoint = null;
    this.brushSize = 6;
    this.brushColor = 'rgba(255,255,255,0.9)';
    this.brushOpacity = 0.9;
    this.mode = 'draw';
    this.strokeHistory = [];
    this.currentStroke = [];
    this.snapshotHistory = [];
    this.isEnabled = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  attachEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.style.pointerEvents = this.isEnabled ? 'auto' : 'none';
  }

  setBrushSize(size) {
    this.brushSize = Math.max(1, size);
  }

  setBrushColor(color) {
    this.brushColor = color;
  }

  setMode(mode) {
    this.mode = mode === 'erase' ? 'erase' : 'draw';
  }

  setActive(active = true) {
    this.isEnabled = !!active;
    if (this.canvas) {
      this.canvas.style.pointerEvents = this.isEnabled ? 'auto' : 'none';
    }
  }

  saveSnapshot() {
    if (!this.ctx || !this.canvas) return;
    try {
      const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.snapshotHistory.push(snapshot);
      if (this.snapshotHistory.length > 20) {
        this.snapshotHistory.shift();
      }
    } catch (error) {
      console.warn('Unable to capture brush snapshot', error);
    }
  }

  startStroke(x, y) {
    if (!this.ctx) return;
    this.isDrawing = true;
    this.lastPoint = { x, y };
    this.currentStroke = [{ x, y }];

    this.ctx.save();
    this.ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalAlpha = this.brushOpacity;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  continueStroke(x, y) {
    if (!this.isDrawing || !this.ctx || !this.lastPoint) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalAlpha = this.brushOpacity;
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.ctx.restore();

    this.lastPoint = { x, y };
    this.currentStroke.push({ x, y });
  }

  endStroke() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.strokeHistory.push({
      points: [...this.currentStroke],
      color: this.brushColor,
      size: this.brushSize,
      mode: this.mode,
    });
    this.currentStroke = [];
    this.lastPoint = null;
  }

  undo() {
    if (!this.ctx || !this.snapshotHistory.length) return;
    const snapshot = this.snapshotHistory.pop();
    this.ctx.putImageData(snapshot, 0, 0);
    this.strokeHistory.pop();
  }

  clear() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokeHistory = [];
    this.snapshotHistory = [];
    this.currentStroke = [];
    this.lastPoint = null;
  }

  translateEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  handlePointerDown(event) {
    if (!this.canvas || !this.isEnabled) return;
    this.canvas.setPointerCapture(event.pointerId);
    const { x, y } = this.translateEvent(event);
    this.saveSnapshot();
    this.startStroke(x, y);
  }

  handlePointerMove(event) {
    if (!this.isDrawing) return;
    const { x, y } = this.translateEvent(event);
    this.continueStroke(x, y);
  }

  handlePointerUp(event) {
    if (this.isDrawing && this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.endStroke();
  }
}
