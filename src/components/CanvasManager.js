import { createOutline, simplifyEdges, posterizeImage } from '../utils/edgeDetection.js';

export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.brushCanvas = null;
    this.brushCtx = null;
    this.negativeSpaceEnabled = false;
    this.simplifiedViewEnabled = false;
    this.posterizedViewEnabled = false;
    this.simplifiedPlanesEnabled = false;
    this.posterizeLevels = 3;
    this.referenceImage = null;
    this.drawingImage = null;
    this.images = { reference: null, drawing: null };
    this.landmarkDetector = null;
    this.faceLandmarks = null;
    this.poseLandmarks = null;
    this.landmarkResults = null;
    this.landmarkScore = null;
    this.showPupils = false;
    this.showIrises = false;
    this.poseDensitySubdivisions = 0;
    this.showPoseSegmentation = false;
    this.overlayColor = 'rgba(64, 86, 148, 0.65)';
    this.sightSizeGridVisible = false;
    this.sightSizeBaseUnit = null;
    this.perspectiveMode = null;
    this.perspectiveGrid = [];
    this.vanishingPoints = [];
    this.isPlacingVanishingPoints = false;
    this.ghostModeEnabled = false;
    this.critiqueModeEnabled = false;
    this.traceModeEnabled = false;
    this.traceOpacity = 0.4;
    this.traceStrokes = [];
    this.activeTraceStroke = null;
    this.analysisSelection = null;
    this.analysisSelectionMode = false;
    this.analysisSelectionDraft = null;
    this.analysisSelectionChangeHandler = null;
    this.viewMode = 'normal';
    this.baseUnitAnchor = null;
    this.baseOutlineShowDrawing = true;
    this.assistModeEnabled = false;
    this.assistMaskStrokes = [];
    this.activeAssistStroke = null;
    this.drawingTransform = { offsetX: 0, offsetY: 0, scale: 1 };
    this.drawingResizeState = null;
    this.gridLayer = null;
    this.perspectiveLayer = null;
    this.maskLayer = null;
    this.negativeSpaceLayer = null;
    this.simplifiedPlanesLayer = null;
    this.trainingModeEnabled = false;
    this.sightSizeGridDivisions = 8;
    this.lastReferenceBounds = null;
    this.lastDrawingBounds = null;
    this.differenceLayer = null;
    this.differenceScore = null;
    this.drawingAdjustmentEnabled = true;
    this.drawingDragState = null;
    this.cloudAiEnabled = false;
    this.cloudVision = null;
    this.outlineAssistEnabled = false;
    this.outlineAssistAligned = false;
    this.outlineAssistThreshold = 0.78;
    this.outlineAssistLastScore = 0;
    this.outlineAssistLastComputedAt = 0;
    this.outlineAssistScoreListener = null;
    this.renderRaf = null;

    this.measurementTool = null;
    this.resizeObserver = null;
    this.resizeRaf = null;

    this.handlePerspectivePointer = this.handlePerspectivePointer.bind(this);
    this.handleOverlayPointerDown = this.handleOverlayPointerDown.bind(this);
    this.handleOverlayPointerMove = this.handleOverlayPointerMove.bind(this);
    this.handleOverlayPointerUp = this.handleOverlayPointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
  }

  init(canvasElement) {
    this.canvas = canvasElement || this.canvas || document.getElementById('overlayCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.createBrushLayer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const resizeTarget = this.canvas.parentElement || this.canvas;
    if (resizeTarget) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeRaf) {
          cancelAnimationFrame(this.resizeRaf);
        }
        this.resizeRaf = requestAnimationFrame(() => {
          this.resize();
          this.resizeRaf = null;
        });
      });
      this.resizeObserver.observe(resizeTarget);
    }
    this.canvas.addEventListener('pointerdown', this.handlePerspectivePointer, true);
    this.canvas.addEventListener('pointerdown', this.handleOverlayPointerDown, true);
    this.canvas.addEventListener('pointermove', this.handleOverlayPointerMove, true);
    this.canvas.addEventListener('pointerup', this.handleOverlayPointerUp, true);
    this.canvas.addEventListener('pointercancel', this.handleOverlayPointerUp, true);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.canvas.width = width;
    this.canvas.height = height;
    this.resetCaches();
    this.resizeBrushLayer(this.canvas.width, this.canvas.height);
    this.syncLayerSizes();
    if (this.sightSizeGridVisible) {
      this.drawSightSizeGrid(this.sightSizeBaseUnit, this.sightSizeGridDivisions);
    }
    if (this.vanishingPoints.length) {
      this.drawPerspectiveGrid();
    }
    this.render();
  }

  setImages({ reference = this.images.reference, drawing = this.images.drawing } = {}) {
    this.referenceImage = reference || null;
    this.drawingImage = drawing || null;
    this.images = { reference: this.referenceImage, drawing: this.drawingImage };
  }

  setReferenceImage(image) {
    this.setImages({ reference: image, drawing: this.drawingImage });
    this.faceLandmarks = null;
    this.poseLandmarks = null;
    this.resetCaches();
    this.clearDifferenceLayer();
    this.baseUnitAnchor = null;
    if (this.drawingImage) {
      this.autoAlignDrawing();
    }
    this.render();
  }

  setDrawingImage(image) {
    this.setImages({ reference: this.referenceImage, drawing: image });
    this.faceLandmarks = null;
    this.poseLandmarks = null;
    this.resetDrawingTransform();
    if (this.referenceImage) {
      this.autoAlignDrawing();
    }
    this.clearDifferenceLayer();
    this.baseUnitAnchor = null;
    this.render();
  }

  getBaseImage() {
    // Backwards-compatible: some code paths may set referenceImage/drawingImage directly.
    // Prefer the canonical properties first, then fall back to the internal images map.
    return this.referenceImage || this.drawingImage || this.images.reference || this.images.drawing;
  }

  setLandmarkDetector(detector) {
    this.landmarkDetector = detector;
  }

  setCloudVisionClient(client) {
    this.cloudVision = client || null;
  }

  setCloudAiEnabled(enabled) {
    this.cloudAiEnabled = !!enabled;
  }

  setMeasurementTool(tool) {
    this.measurementTool = tool || null;
  }

  setAnalysisSelectionListener(callback) {
    this.analysisSelectionChangeHandler = typeof callback === 'function' ? callback : null;
  }

  notifyAnalysisSelectionChange() {
    if (typeof this.analysisSelectionChangeHandler === 'function') {
      this.analysisSelectionChangeHandler(this.analysisSelection);
    }
  }

  beginAnalysisSelection() {
    this.analysisSelectionMode = true;
    this.analysisSelectionDraft = null;
    this.analysisSelection = null;
    this.notifyAnalysisSelectionChange();
    this.render();
  }

  cancelAnalysisSelection() {
    this.analysisSelectionMode = false;
    this.analysisSelectionDraft = null;
    this.notifyAnalysisSelectionChange();
    this.render();
  }

  clearAnalysisSelection() {
    this.analysisSelectionMode = false;
    this.analysisSelectionDraft = null;
    this.analysisSelection = null;
    this.notifyAnalysisSelectionChange();
    this.render();
  }

  isSelectingAnalysisArea() {
    return this.analysisSelectionMode;
  }

  hasAnalysisSelection() {
    return Boolean(this.analysisSelection?.radius);
  }

  setFaceLandmarks(referencePoints, drawingPoints, referenceDimensions, drawingDimensions) {
    this.faceLandmarks = {
      reference: { points: referencePoints || [], dimensions: referenceDimensions },
      drawing: { points: drawingPoints || [], dimensions: drawingDimensions },
    };
    this.render();
  }

  setPoseLandmarks(
    referencePoints,
    drawingPoints,
    referenceDimensions,
    drawingDimensions,
    referenceSegmentation,
    drawingSegmentation
  ) {
    this.poseLandmarks = {
      reference: {
        points: referencePoints || [],
        dimensions: referenceDimensions,
        segmentationMask: referenceSegmentation,
      },
      drawing: {
        points: drawingPoints || [],
        dimensions: drawingDimensions,
        segmentationMask: drawingSegmentation,
      },
    };
    this.render();
  }

  toggleGhostMode() {
    this.ghostModeEnabled = !this.ghostModeEnabled;
    this.render();
  }

  toggleTraceMode() {
    if (this.traceModeEnabled) {
      return this.disableTraceMode();
    }
    return this.enableTraceMode();
  }

  enableTraceMode() {
    this.traceModeEnabled = true;
    this.render();
    return this.traceModeEnabled;
  }

  disableTraceMode() {
    this.traceModeEnabled = false;
    this.render();
    return this.traceModeEnabled;
  }

  undoTraceStroke() {
    this.traceStrokes.pop();
    this.render();
  }

  clearTraceStrokes() {
    this.traceStrokes = [];
    this.render();
  }

  toggleAssistMode() {
    this.assistModeEnabled = !this.assistModeEnabled;
    if (this.assistModeEnabled && !this.maskLayer) {
      this.createMaskLayer();
    }
    this.render();
    return this.assistModeEnabled;
  }

  clearAssistMask() {
    this.assistMaskStrokes = [];
    if (this.maskLayer) {
      const mctx = this.maskLayer.getContext('2d');
      mctx.clearRect(0, 0, this.maskLayer.width, this.maskLayer.height);
    }
    this.render();
  }

  toggleCritiqueMode() {
    this.critiqueModeEnabled = !this.critiqueModeEnabled;
    if (this.critiqueModeEnabled) {
      this.updateLandmarks();
    } else {
      this.landmarkScore = null;
      this.render();
    }
  }

  toggleSightSizeGrid(baseUnit) {
    const hasGrid = this.sightSizeGridVisible;
    if (hasGrid) {
      this.clearSightSizeGrid();
      return;
    }
    this.drawSightSizeGrid(baseUnit || null, this.sightSizeGridDivisions);
  }

  getPointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return { x, y };
  }

  handlePerspectivePointer(event) {
    if (!this.isPlacingVanishingPoints) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    this.vanishingPoints.push({ x, y });
    const needed = this.getVanishingPointCount();
    if (this.vanishingPoints.length >= needed) {
      this.isPlacingVanishingPoints = false;
      this.setVanishingPoints(this.vanishingPoints);
      this.drawPerspectiveGrid();
    }
    event.stopPropagation();
  }

  handleOverlayPointerDown(event) {
    if (this.measurementTool?.gestureDrawingEnabled) {
      return;
    }

    if (this.isPlacingVanishingPoints) return;

    if (this.analysisSelectionMode) {
      const point = this.getPointerPosition(event);
      this.analysisSelectionDraft = { pointerId: event.pointerId, center: point };
      this.analysisSelection = { center: point, radius: 0 };
      this.notifyAnalysisSelectionChange();
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      this.render();
      return;
    }

    if (
      this.drawingAdjustmentEnabled &&
      this.drawingImage &&
      !this.traceModeEnabled &&
      !this.assistModeEnabled
    ) {
      const point = this.getPointerPosition(event);
      const drawingRect = this.getDrawingRect();
      const handleSize = 18;
      const nearCorner = this.isNearResizeHandle(point, drawingRect, handleSize);
      if (nearCorner) {
        const center = {
          x: drawingRect.x + drawingRect.width / 2,
          y: drawingRect.y + drawingRect.height / 2,
        };
        const startDistance = Math.max(
          6,
          Math.hypot(point.x - center.x, point.y - center.y)
        );
        this.drawingResizeState = {
          pointerId: event.pointerId,
          start: point,
          startTransform: { ...this.drawingTransform },
          center,
          startDistance,
        };
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const insideDrawing =
        point.x >= drawingRect.x &&
        point.x <= drawingRect.x + drawingRect.width &&
        point.y >= drawingRect.y &&
        point.y <= drawingRect.y + drawingRect.height;
      if (insideDrawing) {
        this.drawingDragState = {
          pointerId: event.pointerId,
          start: point,
          startTransform: { ...this.drawingTransform },
        };
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (this.traceModeEnabled || this.assistModeEnabled) {
      const point = this.getPointerPosition(event);
      if (this.traceModeEnabled) {
        this.activeTraceStroke = [point];
        this.traceStrokes.push(this.activeTraceStroke);
      }
      if (this.assistModeEnabled) {
        if (!this.maskLayer) {
          this.createMaskLayer();
        }
        this.activeAssistStroke = [point];
        this.assistMaskStrokes.push(this.activeAssistStroke);
      }
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      this.render();
    }
  }

  handleOverlayPointerMove(event) {
    if (this.measurementTool?.gestureDrawingEnabled) {
      return;
    }

    if (this.analysisSelectionDraft && event.pointerId === this.analysisSelectionDraft.pointerId) {
      const point = this.getPointerPosition(event);
      const center = this.analysisSelectionDraft.center;
      const radius = Math.max(4, Math.hypot(point.x - center.x, point.y - center.y));
      this.analysisSelection = { center, radius };
      this.notifyAnalysisSelectionChange();
      this.render();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.drawingResizeState && event.pointerId === this.drawingResizeState.pointerId) {
      const point = this.getPointerPosition(event);
      const baseRect = this.getDrawRect(this.drawingImage);
      const baseCenterX = baseRect.x + baseRect.width / 2;
      const baseCenterY = baseRect.y + baseRect.height / 2;
      const center = this.drawingResizeState.center;
      const distance = Math.max(
        4,
        Math.hypot(point.x - center.x, point.y - center.y)
      );
      const factor = distance / this.drawingResizeState.startDistance;
      const nextScale = Math.min(
        Math.max(this.drawingResizeState.startTransform.scale * factor, 0.1),
        8
      );
      this.drawingTransform = {
        scale: nextScale,
        offsetX: center.x - baseCenterX,
        offsetY: center.y - baseCenterY,
      };
      event.preventDefault();
      event.stopPropagation();
      this.render();
      return;
    }

    if (this.drawingDragState && event.pointerId === this.drawingDragState.pointerId) {
      const point = this.getPointerPosition(event);
      const dx = point.x - this.drawingDragState.start.x;
      const dy = point.y - this.drawingDragState.start.y;
      this.drawingTransform.offsetX = this.drawingDragState.startTransform.offsetX + dx;
      this.drawingTransform.offsetY = this.drawingDragState.startTransform.offsetY + dy;
      event.preventDefault();
      event.stopPropagation();
      this.render();
      return;
    }

    if (!this.activeTraceStroke && !this.activeAssistStroke) return;
    const point = this.getPointerPosition(event);
    if (this.activeTraceStroke) {
      this.activeTraceStroke.push(point);
    }
    if (this.activeAssistStroke) {
      this.activeAssistStroke.push(point);
    }
    event.preventDefault();
    event.stopPropagation();
    this.render();
  }

  handleOverlayPointerUp(event) {
    if (this.measurementTool?.gestureDrawingEnabled) {
      return;
    }

    if (this.analysisSelectionDraft && event.pointerId === this.analysisSelectionDraft.pointerId) {
      this.canvas.releasePointerCapture(event.pointerId);
      this.analysisSelectionMode = false;
      this.analysisSelectionDraft = null;
      this.notifyAnalysisSelectionChange();
      this.render();
      return;
    }

    if (this.drawingResizeState && event.pointerId === this.drawingResizeState.pointerId) {
      this.canvas.releasePointerCapture(event.pointerId);
      this.drawingResizeState = null;
      return;
    }

    if (this.drawingDragState && event.pointerId === this.drawingDragState.pointerId) {
      this.canvas.releasePointerCapture(event.pointerId);
      this.drawingDragState = null;
      return;
    }

    if (this.activeTraceStroke || this.activeAssistStroke) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.activeTraceStroke = null;
    this.activeAssistStroke = null;
    if (this.assistModeEnabled && this.maskLayer) {
      this.updateMaskLayer();
    }
  }

  handleWheel(event) {
    if (!this.drawingAdjustmentEnabled || !this.drawingImage) return;
    const origin = this.getPointerPosition(event);
    const factor = event.deltaY < 0 ? 1.05 : 0.95;
    this.scaleDrawing(factor, origin);
    event.preventDefault();
  }

  ensureLayer(layerName) {
    if (!this.canvas) return null;
    if (!this[layerName]) {
      this[layerName] = document.createElement('canvas');
    }
    this[layerName].width = this.canvas.width;
    this[layerName].height = this.canvas.height;
    return this[layerName];
  }

  createBrushLayer() {
    if (!this.canvas) return null;
    if (!this.brushCanvas) {
      this.brushCanvas = document.createElement('canvas');
      this.brushCanvas.id = 'brushCanvas';
      this.brushCanvas.style.position = 'absolute';
      this.brushCanvas.style.inset = '0';
      this.brushCanvas.style.width = '100%';
      this.brushCanvas.style.height = '100%';
      this.brushCanvas.style.zIndex = '2';
      this.brushCanvas.style.touchAction = 'none';
      this.brushCanvas.style.pointerEvents = 'none';
      const parent = this.canvas.parentElement;
      if (parent) {
        parent.appendChild(this.brushCanvas);
      }
    }
    this.brushCtx = this.brushCanvas.getContext('2d');
    this.resizeBrushLayer(this.canvas.width, this.canvas.height);
    return this.brushCanvas;
  }

  resizeBrushLayer(width, height) {
    if (!this.brushCanvas) return;
    const existingData =
      this.brushCanvas.width && this.brushCanvas.height
        ? this.brushCtx?.getImageData(0, 0, this.brushCanvas.width, this.brushCanvas.height)
        : null;
    this.brushCanvas.width = width;
    this.brushCanvas.height = height;
    if (existingData && width === existingData.width && height === existingData.height) {
      this.brushCtx.putImageData(existingData, 0, 0);
    }
  }

  clearBrushLayer() {
    if (this.brushCtx && this.brushCanvas) {
      this.brushCtx.clearRect(0, 0, this.brushCanvas.width, this.brushCanvas.height);
    }
  }

  getBrushContext() {
    if (!this.brushCtx && this.brushCanvas) {
      this.brushCtx = this.brushCanvas.getContext('2d');
    }
    return this.brushCtx;
  }

  getVanishingPointCount() {
    if (this.perspectiveMode === '2p') return 2;
    if (this.perspectiveMode === '3p') return 3;
    return 1;
  }

  startPerspectiveMode(mode) {
    this.perspectiveMode = mode;
    this.vanishingPoints = [];
    this.isPlacingVanishingPoints = true;
    if (this.perspectiveLayer) {
      const pctx = this.perspectiveLayer.getContext('2d');
      pctx.clearRect(0, 0, this.perspectiveLayer.width, this.perspectiveLayer.height);
    }
  }

  setVanishingPoints(pointsArray = []) {
    this.vanishingPoints = [...pointsArray];
  }

  getRayEndpoint(start, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const candidates = [];
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (Math.abs(dx) > 1e-6) {
      const tLeft = -start.x / dx;
      const yLeft = start.y + tLeft * dy;
      if (tLeft > 0 && yLeft >= 0 && yLeft <= height) candidates.push({ t: tLeft, x: 0, y: yLeft });

      const tRight = (width - start.x) / dx;
      const yRight = start.y + tRight * dy;
      if (tRight > 0 && yRight >= 0 && yRight <= height)
        candidates.push({ t: tRight, x: width, y: yRight });
    }

    if (Math.abs(dy) > 1e-6) {
      const tTop = -start.y / dy;
      const xTop = start.x + tTop * dx;
      if (tTop > 0 && xTop >= 0 && xTop <= width) candidates.push({ t: tTop, x: xTop, y: 0 });

      const tBottom = (height - start.y) / dy;
      const xBottom = start.x + tBottom * dx;
      if (tBottom > 0 && xBottom >= 0 && xBottom <= width)
        candidates.push({ t: tBottom, x: xBottom, y: height });
    }

    if (!candidates.length) {
      return { x: start.x + dx * 3000, y: start.y + dy * 3000 };
    }
    candidates.sort((a, b) => a.t - b.t);
    return { x: candidates[0].x, y: candidates[0].y };
  }

  drawRay(vp, angle, ctx, lineWidth = 1, color = 'rgba(255,255,255,0.15)') {
    const end = this.getRayEndpoint(vp, angle);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(vp.x, vp.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  drawPerspectiveGrid() {
    if (!this.canvas || !this.perspectiveMode || !this.vanishingPoints.length) return;
    const layer = this.ensureLayer('perspectiveLayer');
    if (!layer) return;
    const pctx = layer.getContext('2d');
    pctx.clearRect(0, 0, layer.width, layer.height);
    pctx.save();
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    pctx.lineWidth = 1;

    const drawVerticalSet = () => {
      const spacing = this.canvas.width / 10;
      for (let x = 0; x <= this.canvas.width; x += spacing) {
        pctx.beginPath();
        pctx.lineWidth = Math.abs(x - this.canvas.width / 2) < spacing / 2 ? 2 : 1;
        pctx.moveTo(x, 0);
        pctx.lineTo(x, this.canvas.height);
        pctx.stroke();
      }
    };

    const drawConvergingLines = (vp, samples = 14) => {
      for (let i = 0; i <= samples; i += 1) {
        const targetX = (this.canvas.width / samples) * i;
        const angleBottom = Math.atan2(this.canvas.height - vp.y, targetX - vp.x);
        this.drawRay(vp, angleBottom, pctx, i === samples / 2 ? 2 : 1);
        const angleTop = Math.atan2(-vp.y, targetX - vp.x);
        this.drawRay(vp, angleTop, pctx, i === samples / 2 ? 2 : 1);
      }
    };

    if (this.perspectiveMode === '1p') {
      drawVerticalSet();
      drawConvergingLines(this.vanishingPoints[0], 16);
    } else {
      const colors = ['rgba(40, 53, 147, 0.35)', 'rgba(0, 105, 92, 0.35)', 'rgba(156, 39, 176, 0.35)'];
      this.vanishingPoints.forEach((vp, index) => {
        const rayCount = this.perspectiveMode === '3p' ? 22 : 18;
        const baseAngle = (Math.PI * 2 * index) / Math.max(1, this.vanishingPoints.length);
        for (let i = 0; i < rayCount; i += 1) {
          const angle = baseAngle + (Math.PI * 2 * i) / rayCount;
          const isPrimary = i % (rayCount / 4) === 0;
          this.drawRay(vp, angle, pctx, isPrimary ? 2 : 1, colors[index] || colors[0]);
        }
        pctx.save();
        pctx.fillStyle = colors[index] || colors[0];
        pctx.beginPath();
        pctx.arc(vp.x, vp.y, 5, 0, Math.PI * 2);
        pctx.fill();
        pctx.restore();
      });
    }

    pctx.restore();
    this.render();
  }

  clearPerspectiveGrid() {
    if (this.perspectiveLayer) {
      const pctx = this.perspectiveLayer.getContext('2d');
      pctx.clearRect(0, 0, this.perspectiveLayer.width, this.perspectiveLayer.height);
    }
    this.perspectiveMode = null;
    this.vanishingPoints = [];
    this.isPlacingVanishingPoints = false;
    this.render();
  }

  drawSightSizeGrid(baseUnit = null, divisions = 8) {
    if (!this.canvas) return;
    const layer = this.ensureLayer('gridLayer');
    if (!layer) return;

    const gctx = layer.getContext('2d');
    gctx.clearRect(0, 0, layer.width, layer.height);

    const spacingX = baseUnit && baseUnit > 0 ? baseUnit : layer.width / Math.max(1, divisions);
    const spacingY = baseUnit && baseUnit > 0 ? baseUnit : layer.height / Math.max(1, divisions);
    const strokeColor = 'rgba(255, 255, 255, 0.15)';
    const axisColor = 'rgba(255, 255, 255, 0.3)';

    gctx.save();
    gctx.strokeStyle = strokeColor;
    gctx.lineWidth = 1;

    for (let x = 0; x <= layer.width; x += spacingX) {
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, layer.height);
      gctx.stroke();
    }

    for (let y = 0; y <= layer.height; y += spacingY) {
      gctx.beginPath();
      gctx.moveTo(0, y);
      gctx.lineTo(layer.width, y);
      gctx.stroke();
    }

    const centerX = layer.width / 2;
    const centerY = layer.height / 2;

    gctx.strokeStyle = axisColor;
    gctx.lineWidth = 2;
    gctx.beginPath();
    gctx.moveTo(centerX, 0);
    gctx.lineTo(centerX, layer.height);
    gctx.stroke();

    gctx.beginPath();
    gctx.moveTo(0, centerY);
    gctx.lineTo(layer.width, centerY);
    gctx.stroke();
    gctx.restore();

    this.sightSizeGridVisible = true;
    this.sightSizeBaseUnit = baseUnit;
    this.sightSizeGridDivisions = divisions;
    this.render();
  }

  clearSightSizeGrid() {
    if (this.gridLayer) {
      const gctx = this.gridLayer.getContext('2d');
      gctx.clearRect(0, 0, this.gridLayer.width, this.gridLayer.height);
    }
    this.sightSizeGridVisible = false;
    this.sightSizeBaseUnit = null;
    this.render();
  }

  resetCaches() {
    this.simplifiedLayer = null;
    this.posterizedLayer = null;
  }

  requestRender() {
    if (this.renderRaf) {
      cancelAnimationFrame(this.renderRaf);
    }
    this.renderRaf = requestAnimationFrame(() => {
      this.render();
      this.renderRaf = null;
    });
  }

  resetToNormalRender() {
    this.viewMode = 'normal';
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.render();
  }

  setViewMode(mode = 'normal') {
    this.viewMode = mode;
    this.render();
  }

  setOutlineAssistEnabled(on) {
    this.outlineAssistEnabled = !!on;
    if (!this.outlineAssistEnabled) {
      this.updateOutlineAssistState(0, false);
    }
    this.requestRender();
  }

  setOutlineAssistThreshold(value = this.outlineAssistThreshold) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;
    this.outlineAssistThreshold = Math.min(1, Math.max(0, numeric));
  }

  setOutlineAssistScoreListener(callback) {
    this.outlineAssistScoreListener = typeof callback === 'function' ? callback : null;
  }

  toggleBaseOutlineDrawing() {
    this.baseOutlineShowDrawing = !this.baseOutlineShowDrawing;
    if (this.viewMode === 'base-unit-outline') {
      this.render();
    }
  }

  getBaseOutlineDrawingVisible() {
    return this.baseOutlineShowDrawing;
  }

  syncLayerSizes() {
    const layers = ['maskLayer', 'gridLayer', 'perspectiveLayer'];
    layers.forEach((name) => {
      if (this[name]) {
        this[name].width = this.canvas.width;
        this[name].height = this.canvas.height;
      }
    });
    if (this.maskLayer) {
      this.updateMaskLayer();
    }
  }

  toggleNegativeSpace() {
    this.negativeSpaceEnabled = !this.negativeSpaceEnabled;
    if (this.negativeSpaceEnabled) {
      this.renderNegativeSpace(this.referenceImage);
    } else {
      this.clearNegativeSpace();
    }
  }

  toggleSimplifiedView() {
    this.simplifiedViewEnabled = !this.simplifiedViewEnabled;
    if (this.simplifiedViewEnabled) {
      this.posterizedViewEnabled = false;
    }
    this.render();
  }

  togglePosterizedView(levels = 3) {
    this.posterizedViewEnabled = !this.posterizedViewEnabled;
    this.posterizeLevels = levels;
    if (this.posterizedViewEnabled) {
      this.simplifiedViewEnabled = false;
    }
    this.render();
  }

  toggleTrainingMode() {
    this.trainingModeEnabled = !this.trainingModeEnabled;
    if (this.trainingModeEnabled) {
      if (this.referenceImage) {
        this.renderSimplifiedPlanes(this.referenceImage, 4);
        this.renderNegativeSpace(this.referenceImage);
      }
      this.startPerspectiveMode('1p');
      const defaultVp = {
        x: this.canvas?.width ? this.canvas.width / 2 : 0,
        y: this.canvas?.height ? this.canvas.height * 0.25 : 0,
      };
      this.setVanishingPoints([defaultVp]);
      this.isPlacingVanishingPoints = false;
      this.drawPerspectiveGrid();
    } else {
      this.resetToNormalRender();
      this.clearPerspectiveGrid();
      this.clearNegativeSpace();
      this.clearSimplifiedPlanes();
    }
    this.render();
    return this.trainingModeEnabled;
  }

  posterizeImage(imageData, levels = 3) {
    const step = 255 / Math.max(levels - 1, 1);
    const data = new Uint8ClampedArray(imageData.data);

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const bucket = Math.round(gray / step) * step;
      data[i] = bucket;
      data[i + 1] = bucket;
      data[i + 2] = bucket;
    }

    return new ImageData(data, imageData.width, imageData.height);
  }

  renderSimplifiedPlanes(image = this.referenceImage, levels = 4) {
    if (!image || !this.canvas) return;
    const rect = this.getDrawRect(image);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(image, 0, 0, rect.width, rect.height);
    const data = tctx.getImageData(0, 0, rect.width, rect.height);
    const posterized = posterizeImage(data, levels);

    const tinted = new Uint8ClampedArray(posterized.data);
    for (let i = 0; i < tinted.length; i += 4) {
      const value = tinted[i];
      const warmShift = value > 170 ? 10 : 0;
      const coolShift = value < 90 ? -10 : 0;
      tinted[i] = Math.min(255, value + warmShift);
      tinted[i + 1] = value;
      tinted[i + 2] = Math.max(0, value + coolShift);
    }

    tctx.putImageData(new ImageData(tinted, rect.width, rect.height), 0, 0);
    this.simplifiedPlanesLayer = { canvas: tempCanvas, rect, levels };
    this.simplifiedPlanesEnabled = true;
    this.render();
  }

  clearSimplifiedPlanes() {
    this.simplifiedPlanesLayer = null;
    this.simplifiedPlanesEnabled = false;
    this.render();
  }

  clearDifferenceLayer() {
    this.differenceLayer = null;
    this.differenceScore = null;
  }

  renderNegativeSpace(referenceImage = this.referenceImage) {
    if (!referenceImage || !this.canvas) return;
    const rect = this.getDrawRect(referenceImage);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(referenceImage, 0, 0, rect.width, rect.height);
    const imageData = tctx.getImageData(0, 0, rect.width, rect.height);
    const mask = new Uint8ClampedArray(imageData.data.length);
    const threshold = 0.25 * 255;

    for (let i = 0; i < imageData.data.length; i += 4) {
      const luminance =
        imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
      const isSubject = luminance > threshold;
      mask[i] = 0;
      mask[i + 1] = 0;
      mask[i + 2] = 0;
      mask[i + 3] = isSubject ? 255 : 0;
    }

    const overlay = document.createElement('canvas');
    overlay.width = rect.width;
    overlay.height = rect.height;
    const octx = overlay.getContext('2d');
    octx.fillStyle = 'rgba(0, 120, 255, 0.25)';
    octx.fillRect(0, 0, overlay.width, overlay.height);
    octx.globalCompositeOperation = 'destination-out';
    octx.putImageData(new ImageData(mask, rect.width, rect.height), 0, 0);

    this.negativeSpaceLayer = { canvas: overlay, rect };
    this.negativeSpaceEnabled = true;
    this.render();
  }

  clearNegativeSpace() {
    this.negativeSpaceLayer = null;
    this.negativeSpaceEnabled = false;
    this.render();
  }

  getDrawRect(image = this.referenceImage) {
    if (!this.canvas || !image) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const imgWidth = image.naturalWidth || image.width || 0;
    const imgHeight = image.naturalHeight || image.height || 0;
    if (!imgWidth || !imgHeight) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const scale = Math.min(
      this.canvas.width / imgWidth,
      this.canvas.height / imgHeight
    );

    const width = imgWidth * scale;
    const height = imgHeight * scale;
    const x = (this.canvas.width - width) / 2;
    const y = (this.canvas.height - height) / 2;

    return { x, y, width, height };
  }

  getDrawingRect(image = this.drawingImage, transform = this.drawingTransform) {
    if (!image) return this.getDrawRect(image);
    const baseRect = this.getDrawRect(image);
    const centerX = baseRect.x + baseRect.width / 2;
    const centerY = baseRect.y + baseRect.height / 2;
    const width = baseRect.width * transform.scale;
    const height = baseRect.height * transform.scale;
    const x = centerX - width / 2 + transform.offsetX;
    const y = centerY - height / 2 + transform.offsetY;
    return { x, y, width, height };
  }

  getAnalysisCrop(image, options = {}) {
    const { useDrawingRect = false } = options;
    if (!this.analysisSelection?.radius || !image) return null;

    const rect = useDrawingRect ? this.getDrawingRect(image) : this.getDrawRect(image);
    const dimensions = this.getImageDimensions(image);
    if (!rect?.width || !rect?.height || !dimensions.width || !dimensions.height) return null;

    const { center, radius } = this.analysisSelection;
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    const scaledRadius = Math.max(radius * scaleX, radius * scaleY);

    const mappedCenter = {
      x: (center.x - rect.x) * scaleX,
      y: (center.y - rect.y) * scaleY,
    };

    const x = Math.max(0, mappedCenter.x - scaledRadius);
    const y = Math.max(0, mappedCenter.y - scaledRadius);
    const width = Math.min(dimensions.width - x, scaledRadius * 2);
    const height = Math.min(dimensions.height - y, scaledRadius * 2);

    if (width <= 0 || height <= 0) return null;

    return {
      x: Math.floor(x),
      y: Math.floor(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  resetDrawingTransform() {
    this.drawingTransform = { offsetX: 0, offsetY: 0, scale: 1 };
  }

  getLandmarkBounds(landmarkSet) {
    if (!landmarkSet?.reference?.points?.length || !landmarkSet?.drawing?.points?.length) {
      return null;
    }

    const buildBounds = (points, image, dimensions) => {
      const projected = this.mapPointsToCanvas(points, image, dimensions);
      if (!projected.length) return null;
      const xs = projected.map((p) => p.x);
      const ys = projected.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;
      return {
        x: minX,
        y: minY,
        width,
        height,
        centerX: minX + width / 2,
        centerY: minY + height / 2,
      };
    };

    const referenceBounds = buildBounds(
      landmarkSet.reference.points,
      this.referenceImage,
      landmarkSet.reference.dimensions
    );
    const drawingBounds = buildBounds(
      landmarkSet.drawing.points,
      this.drawingImage,
      landmarkSet.drawing.dimensions
    );

    if (!referenceBounds || !drawingBounds) return null;
    return { reference: referenceBounds, drawing: drawingBounds };
  }

  getAlignmentBounds() {
    return this.getLandmarkBounds(this.faceLandmarks) || this.getLandmarkBounds(this.poseLandmarks);
  }

  getContentBounds(image) {
    if (!image) return null;
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (!width || !height) return null;

    const maxSize = 320;
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const temp = document.createElement('canvas');
    temp.width = targetWidth;
    temp.height = targetHeight;
    const tctx = temp.getContext('2d');
    tctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    const data = tctx.getImageData(0, 0, targetWidth, targetHeight).data;

    let minX = targetWidth;
    let minY = targetHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const idx = (y * targetWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const brightness = (r + g + b) / 3;
        const hasContent = a > 20 && brightness < 250;
        if (hasContent) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) return null;

    const scaleBack = 1 / scale;
    const contentWidth = (maxX - minX + 1) * scaleBack;
    const contentHeight = (maxY - minY + 1) * scaleBack;
    const centerX = (minX + maxX + 1) * 0.5 * scaleBack;
    const centerY = (minY + maxY + 1) * 0.5 * scaleBack;

    return {
      x: minX * scaleBack,
      y: minY * scaleBack,
      width: contentWidth,
      height: contentHeight,
      centerX,
      centerY,
    };
  }

  mapContentPointToCanvas(image, point, rect) {
    if (!image || !rect?.width || !rect?.height) return { x: 0, y: 0 };
    const dimensions = this.getImageDimensions(image);
    const scaleX = rect.width / Math.max(1, dimensions.width);
    const scaleY = rect.height / Math.max(1, dimensions.height);
    return {
      x: rect.x + point.x * scaleX,
      y: rect.y + point.y * scaleY,
    };
  }

  isNearResizeHandle(point, rect, size = 16) {
    if (!rect || !rect.width || !rect.height) return false;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];
    return corners.some((corner) => Math.abs(point.x - corner.x) <= size && Math.abs(point.y - corner.y) <= size);
  }

  autoAlignDrawing(options = {}) {
    if (!this.referenceImage || !this.drawingImage) return;

    const preferLandmarks = !!options.preferLandmarks;
    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.getDrawRect(this.drawingImage);
    const landmarkBounds = this.getAlignmentBounds();
    const referenceContent = this.getContentBounds(this.referenceImage);
    const drawingContent = this.getContentBounds(this.drawingImage);
    const referenceDimensions = this.getImageDimensions(this.referenceImage);
    const drawingDimensions = this.getImageDimensions(this.drawingImage);

    if (preferLandmarks) {
      if (this.autoAlignFromLandmarks(this.faceLandmarks) || this.autoAlignFromLandmarks(this.poseLandmarks)) {
        return;
      }

      if (landmarkBounds) {
        const { reference, drawing } = landmarkBounds;
        const scaleX = drawing.width ? reference.width / drawing.width : 1;
        const scaleY = drawing.height ? reference.height / drawing.height : 1;
        const scaleMatch = (scaleX + scaleY) / 2 || 1;
        this.drawingTransform = {
          offsetX: reference.centerX - drawing.centerX,
          offsetY: reference.centerY - drawing.centerY,
          scale: scaleMatch,
        };
        this.render();
        return;
      }
    }

    const isFullFrameContent = (content, dimensions) => {
      if (!content || !dimensions?.width || !dimensions?.height) return true;
      const widthRatio = content.width / dimensions.width;
      const heightRatio = content.height / dimensions.height;
      return widthRatio >= 0.9 && heightRatio >= 0.9;
    };

    if (
      referenceContent &&
      drawingContent &&
      !isFullFrameContent(referenceContent, referenceDimensions) &&
      !isFullFrameContent(drawingContent, drawingDimensions)
    ) {
      const refCenter = this.mapContentPointToCanvas(
        this.referenceImage,
        { x: referenceContent.centerX, y: referenceContent.centerY },
        referenceRect
      );
      const drawingCenter = this.mapContentPointToCanvas(
        this.drawingImage,
        { x: drawingContent.centerX, y: drawingContent.centerY },
        drawingRect
      );

      const scaleX = drawingContent.width ? referenceContent.width / drawingContent.width : 1;
      const scaleY = drawingContent.height ? referenceContent.height / drawingContent.height : 1;
      const scaleMatch = (scaleX + scaleY) / 2 || 1;

      const targetTransform = {
        scale: scaleMatch,
        offsetX: refCenter.x - this.canvas.width / 2,
        offsetY: refCenter.y - this.canvas.height / 2,
      };

      const nextRect = this.getDrawingRect(this.drawingImage, targetTransform);
      const centerAdjustment = {
        x: refCenter.x - (drawingCenter.x + (nextRect.width - drawingRect.width) / 2),
        y: refCenter.y - (drawingCenter.y + (nextRect.height - drawingRect.height) / 2),
      };

      this.drawingTransform = {
        scale: targetTransform.scale,
        offsetX: targetTransform.offsetX + centerAdjustment.x,
        offsetY: targetTransform.offsetY + centerAdjustment.y,
      };
      this.render();
      return;
    }

    if (landmarkBounds) {
      const { reference, drawing } = landmarkBounds;
      const scaleX = drawing.width ? reference.width / drawing.width : 1;
      const scaleY = drawing.height ? reference.height / drawing.height : 1;
      const scaleMatch = (scaleX + scaleY) / 2 || 1;
      this.drawingTransform = {
        offsetX: reference.centerX - drawing.centerX,
        offsetY: reference.centerY - drawing.centerY,
        scale: scaleMatch,
      };
      this.render();
      return;
    }

    const refCenterX = referenceRect.x + referenceRect.width / 2;
    const refCenterY = referenceRect.y + referenceRect.height / 2;
    const drawCenterX = drawingRect.x + drawingRect.width / 2;
    const drawCenterY = drawingRect.y + drawingRect.height / 2;
    const scaleMatch = drawingRect.height
      ? Math.min(referenceRect.width / drawingRect.width, referenceRect.height / drawingRect.height)
      : 1;
    this.drawingTransform = {
      offsetX: refCenterX - drawCenterX,
      offsetY: refCenterY - drawCenterY,
      scale: scaleMatch,
    };
    this.render();
  }

  nudgeDrawing(dx = 0, dy = 0) {
    if (!this.drawingImage) return;
    this.drawingTransform.offsetX += dx;
    this.drawingTransform.offsetY += dy;
    this.render();
  }

  scaleDrawing(factor = 1, origin = null) {
    if (!this.drawingImage || !factor) return;
    const currentRect = this.getDrawingRect(this.drawingImage);
    const nextScale = Math.min(Math.max(this.drawingTransform.scale * factor, 0.1), 8);
    const scaleRatio = nextScale / this.drawingTransform.scale;

    this.drawingTransform.scale = nextScale;

    if (origin && currentRect.width && currentRect.height) {
      const centerX = currentRect.x + currentRect.width / 2;
      const centerY = currentRect.y + currentRect.height / 2;
      const offsetFromCenterX = origin.x - centerX;
      const offsetFromCenterY = origin.y - centerY;
      const nextCenterX = origin.x - offsetFromCenterX * scaleRatio;
      const nextCenterY = origin.y - offsetFromCenterY * scaleRatio;
      this.drawingTransform.offsetX += nextCenterX - centerX;
      this.drawingTransform.offsetY += nextCenterY - centerY;
    }

    this.render();
  }

  buildDifferenceLayer() {
    if (!this.referenceImage || !this.drawingImage || !this.canvas) {
      return null;
    }

    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.getDrawingRect(this.drawingImage);
    const targetWidth = Math.round(Math.min(referenceRect.width, drawingRect.width));
    const targetHeight = Math.round(Math.min(referenceRect.height, drawingRect.height));

    if (!targetWidth || !targetHeight) return null;

    const temp = document.createElement('canvas');
    temp.width = targetWidth;
    temp.height = targetHeight;
    const tctx = temp.getContext('2d');

    tctx.drawImage(this.referenceImage, 0, 0, targetWidth, targetHeight);
    const refData = tctx.getImageData(0, 0, targetWidth, targetHeight);
    tctx.clearRect(0, 0, targetWidth, targetHeight);
    tctx.drawImage(this.drawingImage, 0, 0, targetWidth, targetHeight);
    const drawData = tctx.getImageData(0, 0, targetWidth, targetHeight);

    const diffData = tctx.createImageData(targetWidth, targetHeight);
    let diffAccumulator = 0;
    const totalPixels = targetWidth * targetHeight;

    for (let i = 0; i < refData.data.length; i += 4) {
      const rDiff = Math.abs(refData.data[i] - drawData.data[i]);
      const gDiff = Math.abs(refData.data[i + 1] - drawData.data[i + 1]);
      const bDiff = Math.abs(refData.data[i + 2] - drawData.data[i + 2]);
      const normalized = (rDiff + gDiff + bDiff) / (255 * 3);
      diffAccumulator += normalized;

      const intensity = Math.min(255, Math.round(normalized * 255 * 1.4));
      diffData.data[i] = 255;
      diffData.data[i + 1] = 64;
      diffData.data[i + 2] = 64;
      diffData.data[i + 3] = intensity;
    }

    const differenceCanvas = document.createElement('canvas');
    differenceCanvas.width = targetWidth;
    differenceCanvas.height = targetHeight;
    const dctx = differenceCanvas.getContext('2d');
    dctx.putImageData(diffData, 0, 0);

    const width = targetWidth;
    const height = targetHeight;
    const x = (this.canvas.width - width) / 2;
    const y = (this.canvas.height - height) / 2;

    const averageDifference = (diffAccumulator / totalPixels) * 100;
    return {
      canvas: differenceCanvas,
      rect: { x, y, width, height },
      averageDifference,
    };
  }

  analyzeDifference() {
    const differenceLayer = this.buildDifferenceLayer();
    if (!differenceLayer) return null;
    this.differenceLayer = differenceLayer;
    this.differenceScore = differenceLayer.averageDifference;
    this.render();
    return differenceLayer;
  }

  getImageDimensions(image) {
    return {
      width: image?.naturalWidth || image?.width || 0,
      height: image?.naturalHeight || image?.height || 0,
    };
  }

  drawTraceStrokes() {
    if (!this.traceStrokes.length) return;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = 3;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.traceStrokes.forEach((stroke) => {
      if (!stroke || stroke.length < 2) return;
      this.ctx.beginPath();
      this.ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) {
        this.ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawAnalysisSelection() {
    if (!this.ctx || !this.analysisSelection?.center || !this.analysisSelection?.radius) return;
    const { center, radius } = this.analysisSelection;
    if (radius <= 0) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 199, 190, 0.95)';
    this.ctx.fillStyle = 'rgba(0, 199, 190, 0.12)';
    this.ctx.lineWidth = 2.2;
    this.ctx.setLineDash([6, 6]);
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = 'rgba(0, 199, 190, 0.9)';
    this.ctx.font = '13px Arial';
    this.ctx.fillText('Analysis area', center.x + radius + 10, center.y + 4);
    this.ctx.restore();
  }

  createMaskLayer() {
    this.maskLayer = document.createElement('canvas');
    this.maskLayer.width = this.canvas.width;
    this.maskLayer.height = this.canvas.height;
    this.updateMaskLayer();
  }

  updateMaskLayer() {
    if (!this.maskLayer) return;
    const mctx = this.maskLayer.getContext('2d');
    mctx.clearRect(0, 0, this.maskLayer.width, this.maskLayer.height);
    mctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    mctx.fillRect(0, 0, this.maskLayer.width, this.maskLayer.height);
    mctx.globalCompositeOperation = 'destination-out';
    mctx.lineWidth = 30;
    mctx.lineJoin = 'round';
    mctx.lineCap = 'round';
    mctx.strokeStyle = '#ffffff';

    this.assistMaskStrokes.forEach((stroke) => {
      if (!stroke || stroke.length < 2) return;
      mctx.beginPath();
      mctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) {
        mctx.lineTo(stroke[i].x, stroke[i].y);
      }
      mctx.stroke();
    });
    mctx.globalCompositeOperation = 'source-over';
  }

  drawAssistMask() {
    if (!this.maskLayer || (!this.assistModeEnabled && !this.assistMaskStrokes.length)) return;
    this.updateMaskLayer();
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.maskLayer, 0, 0);
    this.ctx.restore();
  }

  getState() {
    return {
      ghostModeEnabled: this.ghostModeEnabled,
      critiqueModeEnabled: this.critiqueModeEnabled,
      sightSizeGridVisible: this.sightSizeGridVisible,
      sightSizeBaseUnit: this.sightSizeBaseUnit,
      traceModeEnabled: this.traceModeEnabled,
      traceStrokes: this.traceStrokes.map((stroke) => stroke.map((p) => ({ ...p }))),
      assistModeEnabled: this.assistModeEnabled,
      assistMaskStrokes: this.assistMaskStrokes.map((stroke) => stroke.map((p) => ({ ...p }))),
      lastReferenceBounds: this.lastReferenceBounds,
      lastDrawingBounds: this.lastDrawingBounds,
      drawingTransform: { ...this.drawingTransform },
      viewMode: this.viewMode,
      baseOutlineShowDrawing: this.baseOutlineShowDrawing,
      baseUnitAnchor: this.baseUnitAnchor
        ? {
            reference: { ...this.baseUnitAnchor.reference },
            drawing: { ...this.baseUnitAnchor.drawing },
          }
        : null,
    };
  }

  applyState(state = {}) {
    this.ghostModeEnabled = !!state.ghostModeEnabled;
    this.critiqueModeEnabled = !!state.critiqueModeEnabled;
    this.sightSizeGridVisible = !!state.sightSizeGridVisible;
    this.sightSizeBaseUnit = state.sightSizeBaseUnit || null;
    this.traceModeEnabled = !!state.traceModeEnabled;
    this.traceStrokes = (state.traceStrokes || []).map((stroke) => stroke.map((p) => ({ ...p })));
    this.assistModeEnabled = !!state.assistModeEnabled;
    this.assistMaskStrokes = (state.assistMaskStrokes || []).map((stroke) => stroke.map((p) => ({ ...p })));
    this.lastReferenceBounds = state.lastReferenceBounds || null;
    this.lastDrawingBounds = state.lastDrawingBounds || null;
    this.viewMode = state.viewMode || 'normal';
    this.baseOutlineShowDrawing = state.baseOutlineShowDrawing ?? this.baseOutlineShowDrawing;
    this.baseUnitAnchor = state.baseUnitAnchor
      ? { reference: { ...state.baseUnitAnchor.reference }, drawing: { ...state.baseUnitAnchor.drawing } }
      : null;
    this.drawingTransform = state.drawingTransform
      ? { ...this.drawingTransform, ...state.drawingTransform }
      : { ...this.drawingTransform };
    this.clearDifferenceLayer();
    if (this.assistModeEnabled || this.assistMaskStrokes.length) {
      this.createMaskLayer();
    }
    this.render();
  }

  getImageData(rect) {
    if (!this.referenceImage || !rect.width || !rect.height) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(this.referenceImage, 0, 0, rect.width, rect.height);
    return tctx.getImageData(0, 0, rect.width, rect.height);
  }

  createLayerFromImage(image, rect) {
    const layer = document.createElement('canvas');
    layer.width = rect.width;
    layer.height = rect.height;
    const lctx = layer.getContext('2d');
    lctx.drawImage(image, 0, 0, rect.width, rect.height);
    return layer;
  }

  getSimplifiedLayer(rect) {
    if (
      this.simplifiedLayer &&
      this.simplifiedLayer.width === rect.width &&
      this.simplifiedLayer.height === rect.height
    ) {
      return this.simplifiedLayer.canvas;
    }
    const imageData = this.getImageData(rect);
    if (!imageData) return null;
    const simplified = simplifyEdges(imageData);
    const layer = document.createElement('canvas');
    layer.width = rect.width;
    layer.height = rect.height;
    layer.getContext('2d').putImageData(simplified, 0, 0);
    this.simplifiedLayer = { canvas: layer, width: rect.width, height: rect.height };
    return layer;
  }

  getPosterizedLayer(rect) {
    if (
      this.posterizedLayer &&
      this.posterizedLayer.levels === this.posterizeLevels &&
      this.posterizedLayer.width === rect.width &&
      this.posterizedLayer.height === rect.height
    ) {
      return this.posterizedLayer.canvas;
    }
    const imageData = this.getImageData(rect);
    if (!imageData) return null;
    const posterized = this.posterizeImage(imageData, this.posterizeLevels);
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = rect.width;
    layerCanvas.height = rect.height;
    layerCanvas.getContext('2d').putImageData(posterized, 0, 0);
    this.posterizedLayer = {
      canvas: layerCanvas,
      levels: this.posterizeLevels,
      width: rect.width,
      height: rect.height,
    };
    return layerCanvas;
  }

  getActiveLayer(rect) {
    if (!this.referenceImage) return null;

    if (this.simplifiedViewEnabled) {
      return this.getSimplifiedLayer(rect);
    }

    if (this.posterizedViewEnabled) {
      return this.getPosterizedLayer(rect);
    }

    return this.createLayerFromImage(this.referenceImage, rect);
  }

  getOutlineDataForImage(image, rect, threshold = 50) {
    if (!image || !rect.width || !rect.height) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
    const imageData = ctx.getImageData(0, 0, rect.width, rect.height);
    return createOutline(imageData, threshold);
  }

  tintOutline(outlineData, color) {
    if (!outlineData) return null;
    const { width, height, data } = outlineData;
    const tinted = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const isEdge = data[i] > 0;
      tinted[i] = isEdge ? color.r : 0;
      tinted[i + 1] = isEdge ? color.g : 0;
      tinted[i + 2] = isEdge ? color.b : 0;
      tinted[i + 3] = isEdge ? 255 : 0;
    }
    return new ImageData(tinted, width, height);
  }

  createOutlineLayer(image, rect, color, threshold = 50) {
    const outline = this.getOutlineDataForImage(image, rect, threshold);
    if (!outline) return null;
    const tinted = this.tintOutline(outline, color);
    const layer = document.createElement('canvas');
    layer.width = rect.width;
    layer.height = rect.height;
    layer.getContext('2d').putImageData(tinted, 0, 0);
    return layer;
  }

  createOutlineCanvasFromData(outlineData, rect, color) {
    if (!outlineData || !rect) return null;
    const tinted = this.tintOutline(outlineData, color);
    const layer = document.createElement('canvas');
    layer.width = rect.width;
    layer.height = rect.height;
    layer.getContext('2d').putImageData(tinted, 0, 0);
    return layer;
  }

  createMaskFromOutline(outlineData) {
    if (!outlineData) return null;
    const { width, height, data } = outlineData;
    const mask = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i] > 0 ? 255 : 0;
      mask[i] = 0;
      mask[i + 1] = 0;
      mask[i + 2] = 0;
      mask[i + 3] = alpha;
    }
    return new ImageData(mask, width, height);
  }

  drawOutlineMask(ctx, outlineData, rect) {
    if (!ctx || !outlineData || !rect) return;
    const mask = this.createMaskFromOutline(outlineData);
    ctx.putImageData(mask, rect.x, rect.y);
  }

  updateOutlineAssistState(score = 0, aligned = false) {
    const clampedScore = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
    this.outlineAssistLastScore = clampedScore;
    this.outlineAssistAligned = aligned;
    if (typeof this.outlineAssistScoreListener === 'function') {
      this.outlineAssistScoreListener({ score: this.outlineAssistLastScore, aligned: this.outlineAssistAligned });
    }
  }

  computeOutlineAssistScore(referenceOutline, drawingOutline, referenceRect, drawingRect) {
    if (!this.outlineAssistEnabled || !this.canvas) return this.outlineAssistLastScore;
    const now = performance.now();
    if (this.outlineAssistLastComputedAt && now - this.outlineAssistLastComputedAt < 100) {
      return this.outlineAssistLastScore;
    }

    if (!referenceOutline || !drawingOutline || !referenceRect || !drawingRect) {
      this.outlineAssistLastComputedAt = now;
      this.updateOutlineAssistState(0, false);
      return 0;
    }

    const maxSide = 512;
    const scale = Math.min(maxSide / this.canvas.width, maxSide / this.canvas.height, 1);
    const width = Math.max(1, Math.round(this.canvas.width * scale));
    const height = Math.max(1, Math.round(this.canvas.height * scale));

    const refMaskCanvas = document.createElement('canvas');
    refMaskCanvas.width = width;
    refMaskCanvas.height = height;
    const refCtx = refMaskCanvas.getContext('2d');

    const drawMaskCanvas = document.createElement('canvas');
    drawMaskCanvas.width = width;
    drawMaskCanvas.height = height;
    const drawCtx = drawMaskCanvas.getContext('2d');

    refCtx.save();
    refCtx.scale(scale, scale);
    this.drawOutlineMask(refCtx, referenceOutline, referenceRect);
    refCtx.restore();

    drawCtx.save();
    drawCtx.scale(scale, scale);
    this.drawOutlineMask(drawCtx, drawingOutline, drawingRect);
    drawCtx.restore();

    const refData = refCtx.getImageData(0, 0, width, height).data;
    const drawData = drawCtx.getImageData(0, 0, width, height).data;

    let intersection = 0;
    let union = 0;
    for (let i = 3; i < refData.length; i += 4) {
      const refOn = refData[i] > 0;
      const drawOn = drawData[i] > 0;
      if (refOn && drawOn) intersection += 1;
      if (refOn || drawOn) union += 1;
    }

    const score = union > 0 ? intersection / union : 0;
    const aligned = score >= this.outlineAssistThreshold;
    this.outlineAssistLastComputedAt = now;
    this.updateOutlineAssistState(score, aligned);
    return score;
  }

  clearForOutlineMode() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  renderReferenceAsOutline() {
    this.setViewMode('reference-outline');
  }

  renderDrawingAsOutline() {
    this.setViewMode('drawing-outline');
  }

  renderBothAsOutlines() {
    this.setViewMode('both-outlines');
  }

  renderBaseUnitOutline() {
    if (!this.ctx || !this.referenceImage || this.viewMode !== 'base-unit-outline') return false;

    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.drawingImage ? this.getDrawingRect(this.drawingImage) : null;

    const referenceOutline =
      this.referenceImage && referenceRect
        ? this.createOutlineLayer(this.referenceImage, referenceRect, { r: 0, g: 200, b: 255 })
        : null;
    const drawingOutline =
      this.drawingImage && drawingRect && this.baseOutlineShowDrawing
        ? this.createOutlineLayer(this.drawingImage, drawingRect, { r: 255, g: 160, b: 120 })
        : null;

    if (!referenceOutline && !drawingOutline) return false;

    this.clearForOutlineMode();
    if (referenceOutline && referenceRect) {
      this.ctx.drawImage(referenceOutline, referenceRect.x, referenceRect.y, referenceRect.width, referenceRect.height);
    }
    if (this.baseOutlineShowDrawing && drawingOutline && drawingRect) {
      this.ctx.drawImage(drawingOutline, drawingRect.x, drawingRect.y, drawingRect.width, drawingRect.height);
    }

    const anchor = this.getBaseAnchorOnCanvas();
    if (anchor) {
      this.drawBaseTriangulation(anchor, referenceRect);
      this.drawBaseAnchorMarkers(anchor);
    }
    return true;
  }

  renderOutlineView() {
    if (!this.ctx || this.viewMode === 'normal') return false;

    const referenceRect = this.referenceImage ? this.getDrawRect(this.referenceImage) : null;
    const drawingRect = this.drawingImage ? this.getDrawingRect(this.drawingImage) : null;

    const usingOutlineAssist = this.outlineAssistEnabled && this.viewMode === 'both-outlines';

    const referenceOutlineData =
      this.referenceImage && referenceRect ? this.getOutlineDataForImage(this.referenceImage, referenceRect) : null;
    const drawingOutlineData =
      this.drawingImage && drawingRect ? this.getOutlineDataForImage(this.drawingImage, drawingRect) : null;

    if (usingOutlineAssist) {
      this.computeOutlineAssistScore(referenceOutlineData, drawingOutlineData, referenceRect, drawingRect);
    }

    const referenceColor = usingOutlineAssist
      ? this.outlineAssistAligned
        ? { r: 34, g: 197, b: 94 }
        : { r: 239, g: 68, b: 68 }
      : { r: 0, g: 160, b: 255 };
    const drawingColor = usingOutlineAssist
      ? this.outlineAssistAligned
        ? { r: 34, g: 197, b: 94 }
        : { r: 59, g: 130, b: 246 }
      : { r: 255, g: 80, b: 80 };

    const referenceOutline =
      this.referenceImage && referenceRect && referenceOutlineData
        ? this.createOutlineCanvasFromData(referenceOutlineData, referenceRect, referenceColor)
        : null;
    const drawingOutline =
      this.drawingImage && drawingRect && drawingOutlineData
        ? this.createOutlineCanvasFromData(drawingOutlineData, drawingRect, drawingColor)
        : null;

    const shouldRenderReference =
      this.viewMode === 'reference-outline' || this.viewMode === 'both-outlines';
    const shouldRenderDrawing = this.viewMode === 'drawing-outline' || this.viewMode === 'both-outlines';

    if ((shouldRenderReference && referenceOutline) || (shouldRenderDrawing && drawingOutline)) {
      this.clearForOutlineMode();
      if (shouldRenderReference && referenceOutline && referenceRect) {
        this.ctx.drawImage(
          referenceOutline,
          referenceRect.x,
          referenceRect.y,
          referenceRect.width,
          referenceRect.height
        );
      }
      if (shouldRenderDrawing && drawingOutline && drawingRect) {
        this.ctx.drawImage(drawingOutline, drawingRect.x, drawingRect.y, drawingRect.width, drawingRect.height);
      }
      return true;
    }

    return false;
  }

  async updateLandmarks() {
    if (!this.landmarkDetector || !this.referenceImage) return;
    this.landmarkResults = await this.landmarkDetector.detectPair(
      this.referenceImage,
      this.drawingImage
    );
    if (this.landmarkResults?.reference?.points && this.landmarkResults?.drawing?.points) {
      this.landmarkScore = this.landmarkDetector.scoreAccuracy(
        this.landmarkResults.reference,
        this.landmarkResults.drawing
      );
    }
    this.render();
  }

  projectPoint(point, rect, dimensions) {
    if (!rect.width || !rect.height || !dimensions.width || !dimensions.height) {
      return { x: 0, y: 0 };
    }
    const scaleX = rect.width / dimensions.width;
    const scaleY = rect.height / dimensions.height;
    return {
      x: rect.x + point[0] * scaleX,
      y: rect.y + point[1] * scaleY,
    };
  }

  projectPointObject(point, rect, dimensions) {
    if (!rect.width || !rect.height || !dimensions.width || !dimensions.height) {
      return { x: 0, y: 0 };
    }
    const scaleX = rect.width / dimensions.width;
    const scaleY = rect.height / dimensions.height;
    return {
      x: rect.x + point.x * scaleX,
      y: rect.y + point.y * scaleY,
    };
  }

  unprojectPointToImage(point, rect, dimensions) {
    if (!rect.width || !rect.height || !dimensions.width || !dimensions.height) {
      return { x: 0, y: 0 };
    }
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    return {
      x: (point.x - rect.x) * scaleX,
      y: (point.y - rect.y) * scaleY,
    };
  }

  mapPointsToCanvas(points, image, providedDimensions) {
    if (!points?.length) return [];
    const rect = image === this.drawingImage ? this.getDrawingRect(image) : this.getDrawRect(image);
    const dimensions = providedDimensions || this.getImageDimensions(image);
    return points.map((point) => this.projectPointObject(point, rect, dimensions));
  }

  getAlignmentKeypoints(type, landmarkSet, which = 'reference') {
    const indexMap = {
      face: [33, 263, 1, 13, 152],
      pose: [11, 12, 23, 24, 0],
    };
    const indices = indexMap[type] || [];
    const source = landmarkSet?.[which];
    if (!indices.length || !source?.points?.length) return [];

    const picked = indices.map((idx) => source.points[idx]).filter(Boolean);
    if (!picked.length) return [];

    const image = which === 'reference' ? this.referenceImage : this.drawingImage;
    return this.mapPointsToCanvas(picked, image, source.dimensions);
  }

  getAlignmentScaleAnchors(type, landmarkSet, which = 'reference') {
    const anchorMap = {
      face: [33, 263],
      pose: [11, 12],
    };
    const indices = anchorMap[type] || [];
    const source = landmarkSet?.[which];
    if (indices.length < 2 || !source?.points?.length) return [null, null];

    const anchors = indices.map((idx) => source.points[idx]);
    if (anchors.some((point) => !point)) return [null, null];

    const image = which === 'reference' ? this.referenceImage : this.drawingImage;
    const mappedAnchors = this.mapPointsToCanvas(anchors, image, source.dimensions);
    if (mappedAnchors.length < 2) return [null, null];
    return mappedAnchors;
  }

  computeCentroid(points = []) {
    if (!points.length) return null;
    const total = points.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 }
    );
    return { x: total.x / points.length, y: total.y / points.length };
  }

  computeDistance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
  }

  autoAlignFromLandmarks(landmarkSet) {
    if (
      !landmarkSet?.reference?.points?.length ||
      !landmarkSet?.drawing?.points?.length ||
      !this.referenceImage ||
      !this.drawingImage
    ) {
      return false;
    }

    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.getDrawRect(this.drawingImage);
    if (!referenceRect.width || !referenceRect.height || !drawingRect.width || !drawingRect.height) {
      return false;
    }

    const center = {
      x: drawingRect.x + drawingRect.width / 2,
      y: drawingRect.y + drawingRect.height / 2,
    };

    const mapLandmarks = (points, image, dimensions, rect) => {
      if (!points?.length) return [];
      return points.map((point) => this.projectPointObject(point, rect, dimensions));
    };

    const referenceProjected = mapLandmarks(
      landmarkSet.reference.points,
      this.referenceImage,
      landmarkSet.reference.dimensions,
      referenceRect
    );
    const drawingProjected = mapLandmarks(
      landmarkSet.drawing.points,
      this.drawingImage,
      landmarkSet.drawing.dimensions,
      drawingRect
    );

    const pairCount = Math.min(referenceProjected.length, drawingProjected.length);
    if (!pairCount) return false;

    const step = Math.max(1, Math.ceil(pairCount / 200));
    let used = 0;
    let sumPx = 0;
    let sumPy = 0;
    let sumQx = 0;
    let sumQy = 0;
    let sumCross = 0;
    let sumQQ = 0;

    for (let i = 0; i < pairCount; i += step) {
      const refPoint = referenceProjected[i];
      const drawPoint = drawingProjected[i];
      if (!refPoint || !drawPoint) continue;

      const qcX = drawPoint.x - center.x;
      const qcY = drawPoint.y - center.y;
      const pcX = refPoint.x - center.x;
      const pcY = refPoint.y - center.y;

      sumPx += pcX;
      sumPy += pcY;
      sumQx += qcX;
      sumQy += qcY;
      used += 1;
    }

    if (!used) return false;

    const meanPx = sumPx / used;
    const meanPy = sumPy / used;
    const meanQx = sumQx / used;
    const meanQy = sumQy / used;

    for (let i = 0; i < pairCount; i += step) {
      const refPoint = referenceProjected[i];
      const drawPoint = drawingProjected[i];
      if (!refPoint || !drawPoint) continue;

      const qcX = drawPoint.x - center.x - meanQx;
      const qcY = drawPoint.y - center.y - meanQy;
      const pcX = refPoint.x - center.x - meanPx;
      const pcY = refPoint.y - center.y - meanPy;

      sumCross += qcX * pcX + qcY * pcY;
      sumQQ += qcX * qcX + qcY * qcY;
    }

    if (!sumQQ) return false;

    const rawScale = sumCross / sumQQ;
    const scale = Math.min(Math.max(rawScale, 0.1), 8);
    if (!Number.isFinite(scale)) return false;

    const offsetX = meanPx - scale * meanQx;
    const offsetY = meanPy - scale * meanQy;

    this.drawingTransform = {
      scale,
      offsetX,
      offsetY,
    };
    this.render();
    return true;
  }

  setBaseUnitAnchor(anchor = null) {
    if (!anchor?.reference || !anchor?.drawing) {
      this.baseUnitAnchor = null;
      this.render();
      return;
    }

    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.getDrawingRect(this.drawingImage);
    const referenceDimensions = this.getImageDimensions(this.referenceImage);
    const drawingDimensions = this.getImageDimensions(this.drawingImage);

    this.baseUnitAnchor = {
      reference: {
        canvas: anchor.reference,
        image: referenceRect
          ? this.unprojectPointToImage(anchor.reference, referenceRect, referenceDimensions)
          : null,
      },
      drawing: {
        canvas: anchor.drawing,
        image: drawingRect
          ? this.unprojectPointToImage(anchor.drawing, drawingRect, drawingDimensions)
          : null,
      },
    };
    this.render();
  }

  getBaseAnchorOnCanvas() {
    if (!this.baseUnitAnchor) return null;
    const referenceRect = this.getDrawRect(this.referenceImage);
    const drawingRect = this.getDrawingRect(this.drawingImage);
    const referenceDimensions = this.getImageDimensions(this.referenceImage);
    const drawingDimensions = this.getImageDimensions(this.drawingImage);

    const projectWithFallback = (anchorPoint, rect, dimensions) => {
      if (!anchorPoint) return null;
      if (anchorPoint.canvas && typeof anchorPoint.canvas.x === 'number') {
        return anchorPoint.canvas;
      }
      if (anchorPoint.image && rect && dimensions?.width && dimensions?.height) {
        return this.projectPointObject(anchorPoint.image, rect, dimensions);
      }
      return null;
    };

    return {
      reference: projectWithFallback(this.baseUnitAnchor.reference, referenceRect, referenceDimensions),
      drawing: projectWithFallback(this.baseUnitAnchor.drawing, drawingRect, drawingDimensions),
    };
  }

  drawLandmarkSet(points, rect, dimensions, color) {
    if (!points || points.length === 0) return;
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 1.5;

    const projected = points.map((p) => this.projectPoint(p, rect, dimensions));

    for (let i = 0; i < projected.length; i += 5) {
      const current = projected[i];
      const next = projected[(i + 1) % projected.length];
      this.ctx.beginPath();
      this.ctx.moveTo(current.x, current.y);
      this.ctx.lineTo(next.x, next.y);
      this.ctx.stroke();
    }

    projected.forEach((p) => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.restore();
  }

  drawFaceLandmarks(points = [], sourceDimensions, options = {}, image = this.referenceImage) {
    if (!points?.length || !this.ctx) return;
    const ctx = this.ctx;
    const drawOptions = {
      strokeStyle: options.strokeStyle || 'rgba(0, 224, 255, 0.8)',
      fillStyle: options.fillStyle || 'rgba(0, 224, 255, 0.95)',
      pointRadius: options.pointRadius || 3,
    };

    const useRawPoints = !sourceDimensions && !image;
    const mappedPoints = useRawPoints
      ? points
      : this.mapPointsToCanvas(points, image, sourceDimensions || this.getImageDimensions(image));
    if (!mappedPoints.length) return;

    ctx.save();
    ctx.strokeStyle = drawOptions.strokeStyle;
    ctx.fillStyle = drawOptions.fillStyle;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    mappedPoints.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, drawOptions.pointRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    this.drawFaceFeatureHighlights(mappedPoints, drawOptions);

    if (this.showIrises && this.landmarkDetector) {
      const irisConnections = this.landmarkDetector.getIrisConnections();
      this.drawIrisConnections(mappedPoints, irisConnections, drawOptions);
    }

    if (this.showPupils && this.landmarkDetector) {
      const pupils = this.landmarkDetector.getPupilCenters(mappedPoints);
      if (pupils?.left) this.drawPupilMarker(pupils.left);
      if (pupils?.right) this.drawPupilMarker(pupils.right);
    }

    const drawRange = (start, end) => {
      if (mappedPoints.length <= end) return;
      ctx.beginPath();
      ctx.moveTo(mappedPoints[start].x, mappedPoints[start].y);
      for (let i = start + 1; i <= end; i += 1) {
        const point = mappedPoints[i];
        if (!point) continue;
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    };

    drawRange(0, Math.min(16, mappedPoints.length - 1));
    if (mappedPoints.length > 42) {
      drawRange(33, 42);
      drawRange(133, 144);
      drawRange(61, 80);
    }

    ctx.restore();
  }

  getFaceFeaturePoints(mappedPoints = []) {
    const featureIndices = [
      { key: 'rightEye', label: 'Right Eye', index: 33 },
      { key: 'leftEye', label: 'Left Eye', index: 263 },
      { key: 'nose', label: 'Nose', index: 1 },
      { key: 'mouth', label: 'Mouth', index: 13 },
      { key: 'leftEar', label: 'Left Ear', index: 234 },
      { key: 'rightEar', label: 'Right Ear', index: 454 },
    ];

    return featureIndices
      .map((feature) => ({ ...feature, point: mappedPoints[feature.index] }))
      .filter((feature) => Boolean(feature.point));
  }

  drawFaceFeatureHighlights(mappedPoints, drawOptions) {
    const ctx = this.ctx;
    const features = this.getFaceFeaturePoints(mappedPoints);
    if (!features.length) return;

    ctx.save();
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    features.forEach((feature) => {
      const { point, label } = feature;
      ctx.fillStyle = drawOptions.fillStyle;
      ctx.beginPath();
      ctx.arc(point.x, point.y, drawOptions.pointRadius + 2, 0, Math.PI * 2);
      ctx.fill();

      const padding = 6;
      const textWidth = ctx.measureText(label).width;
      const boxX = point.x + 10;
      const boxY = point.y - 10;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(boxX - padding, boxY - padding, textWidth + padding * 2, 20);

      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(label, boxX, boxY + 6);
    });

    ctx.restore();
  }

  drawIrisConnections(mappedPoints, irisConnections = {}, drawOptions = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { left = [], right = [] } = irisConnections;
    const stroke = drawOptions.strokeStyle || 'rgba(64, 86, 148, 0.85)';
    const drawSide = (connections, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      connections.forEach(([a, b]) => {
        const start = mappedPoints[a];
        const end = mappedPoints[b];
        if (!start || !end) return;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      });
      ctx.restore();
    };

    drawSide(left, stroke);
    drawSide(right, stroke);
  }

  drawPupilMarker(point) {
    if (!point || !this.ctx) return;
    const ctx = this.ctx;
    const radius = 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(point.x - radius - 1, point.y);
    ctx.lineTo(point.x + radius + 1, point.y);
    ctx.moveTo(point.x, point.y - radius - 1);
    ctx.lineTo(point.x, point.y + radius + 1);
    ctx.stroke();
    ctx.restore();
  }

  buildDensePosePoints(points = [], connections = [], subdivisions = 0) {
    if (!points.length || !connections.length || subdivisions <= 0) return [];
    const densePoints = [];
    connections.forEach(([a, b]) => {
      const start = points[a];
      const end = points[b];
      if (!start || !end) return;
      for (let i = 1; i <= subdivisions; i += 1) {
        const t = i / (subdivisions + 1);
        densePoints.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        });
      }
    });
    return densePoints;
  }

  drawSegmentationOutline(segmentationMask, image, dimensions = {}) {
    if (!segmentationMask?.data || !segmentationMask.width || !segmentationMask.height || !this.ctx) return;
    const ctx = this.ctx;
    const rect = image === this.drawingImage ? this.getDrawingRect(image) : this.getDrawRect(image);
    if (!rect?.width || !rect?.height) return;

    const step = Math.max(2, Math.floor(Math.min(segmentationMask.width, segmentationMask.height) / 120));
    const threshold = 0.5;
    const edgePoints = [];
    const {
      data,
      width,
      height,
      offsetX = 0,
      offsetY = 0,
      fullWidth = dimensions?.width || segmentationMask.fullWidth || segmentationMask.width,
      fullHeight = dimensions?.height || segmentationMask.fullHeight || segmentationMask.height,
    } = segmentationMask;

    for (let y = 0; y < height - step; y += step) {
      for (let x = 0; x < width - step; x += step) {
        const idx = y * width + x;
        const value = data[idx];
        const rightValue = data[idx + step] ?? value;
        const bottomValue = data[idx + step * width] ?? value;
        const isInside = value >= threshold;
        const hasEdge = (rightValue >= threshold) !== isInside || (bottomValue >= threshold) !== isInside;
        if (hasEdge) {
          const canvasX = rect.x + ((x + offsetX) / fullWidth) * rect.width;
          const canvasY = rect.y + ((y + offsetY) / fullHeight) * rect.height;
          edgePoints.push({ x: canvasX, y: canvasY });
        }
      }
    }

    if (!edgePoints.length) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    edgePoints.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    edgePoints.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawPoseLandmarks(
    points = [],
    sourceDimensions,
    options = {},
    image = this.referenceImage,
    providedDimensions,
    segmentationMask
  ) {
    if (!points?.length || !this.ctx) return;

    const ctx = this.ctx;
    const dimensions = providedDimensions || sourceDimensions || this.getImageDimensions(image);
    const useRawPoints = !dimensions.width && !dimensions.height && !image;
    const projected = useRawPoints ? points : this.mapPointsToCanvas(points, image, dimensions);
    if (!projected.length) return;

    const jointColor = options.jointColor || 'rgba(255, 99, 212, 0.95)';
    const skeletonColor = options.skeletonColor || 'rgba(255, 99, 212, 0.6)';

    const defaultConnections = [
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
      [11, 12],
      [11, 23],
      [12, 24],
      [23, 24],
      [23, 25],
      [25, 27],
      [24, 26],
      [26, 28],
      [27, 29],
      [28, 30],
      [23, 27],
      [24, 28],
    ];
    const poseConnections = this.landmarkDetector?.getPoseConnections?.() || defaultConnections;

    ctx.save();
    ctx.strokeStyle = skeletonColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    poseConnections.forEach(([startIdx, endIdx]) => {
      const start = projected[startIdx];
      const end = projected[endIdx];
      if (!start || !end) return;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    ctx.fillStyle = jointColor;
    projected.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    if (this.poseDensitySubdivisions > 0) {
      const densePoints = this.buildDensePosePoints(projected, poseConnections, this.poseDensitySubdivisions);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      densePoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.25, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (this.showPoseSegmentation && segmentationMask) {
      this.drawSegmentationOutline(segmentationMask, image, dimensions);
    }

    ctx.restore();
  }

  drawLandmarkComparison(referencePoints, drawingPoints, referenceDimensions, drawingDimensions) {
    if (!referencePoints?.length || !drawingPoints?.length) return;
    const mappedReference = this.mapPointsToCanvas(referencePoints, this.referenceImage, referenceDimensions);
    const mappedDrawing = this.mapPointsToCanvas(
      drawingPoints,
      this.drawingImage || this.referenceImage,
      drawingDimensions
    );

    if (!mappedReference.length || !mappedDrawing.length) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0, 163, 255, 0.9)';
    mappedReference.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = 'rgba(255, 82, 82, 0.9)';
    mappedDrawing.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    const count = Math.min(mappedReference.length, mappedDrawing.length);
    const distances = [];
    for (let i = 0; i < count; i += 1) {
      const refPoint = mappedReference[i];
      const drawPoint = mappedDrawing[i];
      ctx.beginPath();
      ctx.moveTo(refPoint.x, refPoint.y);
      ctx.lineTo(drawPoint.x, drawPoint.y);
      ctx.stroke();
      distances.push(Math.hypot(drawPoint.x - refPoint.x, drawPoint.y - refPoint.y));
    }

    if (distances.length) {
      const avgDeviation = distances.reduce((sum, value) => sum + value, 0) / distances.length;
      console.log(`Average landmark deviation: ${avgDeviation.toFixed(2)}px`);
    }

    ctx.restore();
  }

  drawDetectedLandmarks() {
    if (this.faceLandmarks) {
      const { reference, drawing } = this.faceLandmarks;
      this.drawFaceLandmarks(reference?.points, reference?.dimensions);
      if (drawing?.points?.length) {
        this.drawFaceLandmarks(
          drawing.points,
          drawing.dimensions,
          'rgba(255, 82, 82, 0.9)',
          this.drawingImage || this.referenceImage
        );
        this.drawLandmarkComparison(
          reference?.points,
          drawing.points,
          reference?.dimensions,
          drawing.dimensions
        );
      }
    }

    if (this.poseLandmarks) {
      const { reference, drawing } = this.poseLandmarks;
      this.drawPoseLandmarks(reference?.points, reference?.dimensions, {}, this.referenceImage, undefined, reference?.segmentationMask);
      if (drawing?.points?.length) {
        this.drawPoseLandmarks(
          drawing.points,
          drawing.dimensions,
          {
            jointColor: 'rgba(255, 99, 71, 0.95)',
            skeletonColor: 'rgba(255, 99, 71, 0.5)',
          },
          this.drawingImage || this.referenceImage,
          undefined,
          drawing?.segmentationMask
        );
        this.drawLandmarkComparison(
          reference?.points,
          drawing.points,
          reference?.dimensions,
          drawing.dimensions
        );
      }
    }
  }

  drawLandmarkComparisons(rect) {
    if (!this.landmarkResults) return;
    const { reference, drawing } = this.landmarkResults;
    const referencePoints = reference?.points || [];
    const drawingPoints = drawing?.points || [];
    if (!referencePoints.length && !drawingPoints.length) return;

    this.drawLandmarkSet(referencePoints, rect, reference?.dimensions || {}, '#00c4ff');
    this.drawLandmarkSet(drawingPoints, rect, drawing?.dimensions || {}, '#ff8c00');

    const count = Math.min(referencePoints.length, drawingPoints.length);
    this.ctx.save();
    this.ctx.strokeStyle = '#ff4d4f';
    this.ctx.fillStyle = '#ff4d4f';
    this.ctx.lineWidth = 1;

    for (let i = 0; i < count; i += 10) {
      const refPoint = this.projectPoint(referencePoints[i], rect, reference?.dimensions || {});
      const drawPoint = this.projectPoint(drawingPoints[i], rect, drawing?.dimensions || {});
      this.ctx.beginPath();
      this.ctx.moveTo(refPoint.x, refPoint.y);
      this.ctx.lineTo(drawPoint.x, drawPoint.y);
      this.ctx.stroke();

      const dx = drawPoint.x - refPoint.x;
      const dy = drawPoint.y - refPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy).toFixed(1);
      const midX = (refPoint.x + drawPoint.x) / 2;
      const midY = (refPoint.y + drawPoint.y) / 2;
      this.ctx.fillText(`${distance}px`, midX + 4, midY - 4);
    }

    this.ctx.restore();
  }

  drawGestureLine(rect) {
    if (!this.landmarkResults) return;
    const referenceLine = this.landmarkResults.reference?.gestureLine;
    if (!referenceLine || referenceLine.length < 2) return;

    const dimensions = this.landmarkResults.reference.dimensions || {};
    const projected = referenceLine.map((point) => this.projectPoint(point, rect, dimensions));
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i += 1) {
      this.ctx.lineTo(projected[i].x, projected[i].y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  getReferenceKeyPoints(rect) {
    if (!rect) return [];
    const { x, y, width, height } = rect;
    const cx = x + width / 2;
    const cy = y + height / 2;
    return [
      { x, y },
      { x: cx, y },
      { x: x + width, y },
      { x: x + width, y: cy },
      { x: x + width, y: y + height },
      { x: cx, y: y + height },
      { x, y: y + height },
      { x, y: cy },
      { x: cx, y: cy },
    ];
  }

  drawBaseAnchorMarkers(anchor) {
    if (!anchor?.reference) return;
    this.ctx.save();
    const drawAnchor = (point, color, label) => {
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = '12px Inter, system-ui, sans-serif';
      this.ctx.fillText(label, point.x + 12, point.y + 4);
    };
    drawAnchor(anchor.reference, 'rgba(244, 114, 182, 0.9)', 'Base: Ref');
    if (anchor.drawing) {
      drawAnchor(anchor.drawing, 'rgba(52, 211, 153, 0.9)', 'Base: Drawing');
      this.ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)';
      this.ctx.setLineDash([6, 6]);
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(anchor.reference.x, anchor.reference.y);
      this.ctx.lineTo(anchor.drawing.x, anchor.drawing.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
    this.ctx.restore();
  }

  drawBaseTriangulation(anchor, rect) {
    if (!anchor?.reference || !rect) return;
    const keyPoints = this.getReferenceKeyPoints(rect);
    if (!keyPoints.length) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 6]);
    for (let i = 0; i < keyPoints.length; i += 1) {
      const point = keyPoints[i];
      this.ctx.beginPath();
      this.ctx.moveTo(anchor.reference.x, anchor.reference.y);
      this.ctx.lineTo(point.x, point.y);
      this.ctx.stroke();

      const next = keyPoints[(i + 1) % keyPoints.length];
      this.ctx.beginPath();
      this.ctx.moveTo(point.x, point.y);
      this.ctx.lineTo(next.x, next.y);
      this.ctx.lineTo(anchor.reference.x, anchor.reference.y);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = 'rgba(94, 234, 212, 0.9)';
    keyPoints.forEach((point) => {
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  drawGhostCorrections(rect) {
    if (!this.ghostModeEnabled || !this.landmarkResults) return;
    const { reference, drawing } = this.landmarkResults;
    const referencePoints = reference?.points || [];
    const drawingPoints = drawing?.points || [];
    const dimensionsRef = reference?.dimensions || {};
    const dimensionsDraw = drawing?.dimensions || {};
    const count = Math.min(referencePoints.length, drawingPoints.length);
    if (!count) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(128, 0, 128, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 6]);
    for (let i = 0; i < count; i += 1) {
      const refPoint = this.projectPoint(referencePoints[i], rect, dimensionsRef);
      const drawPoint = this.projectPoint(drawingPoints[i], rect, dimensionsDraw);
      const dx = drawPoint.x - refPoint.x;
      const dy = drawPoint.y - refPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 20) {
        this.ctx.beginPath();
        this.ctx.moveTo(drawPoint.x, drawPoint.y);
        this.ctx.lineTo(refPoint.x, refPoint.y);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  drawCritiqueOverlay(rect) {
    if (!this.critiqueModeEnabled || !this.landmarkScore) return;
    const { averageError, topInaccurate } = this.landmarkScore;
    this.ctx.save();
    this.ctx.fillStyle = '#1b5e20';
    this.ctx.font = '16px Arial';
    this.ctx.fillText(`Accuracy Score: ${(averageError || 0).toFixed(2)}px avg error`, 16, 24);

    if (topInaccurate?.length) {
      this.ctx.fillStyle = '#b71c1c';
      this.ctx.font = '14px Arial';
      topInaccurate.forEach((item, idx) => {
        const projected = this.projectPoint(
          item.referencePoint,
          rect,
          this.landmarkResults.reference?.dimensions || {}
        );
        this.ctx.beginPath();
        this.ctx.arc(projected.x, projected.y, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillText(`#${idx + 1}: ${item.error.toFixed(1)}px`, projected.x + 10, projected.y);
      });
    }
    this.ctx.restore();
  }

  drawResizeHandles(rect) {
    if (!this.ctx || !rect?.width || !rect?.height) return;
    const handleSize = 10;
    const half = handleSize / 2;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.lineWidth = 1.5;
    corners.forEach((corner) => {
      this.ctx.beginPath();
      this.ctx.rect(corner.x - half, corner.y - half, handleSize, handleSize);
      this.ctx.fill();
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const baseImage = this.getBaseImage();
    if (!baseImage) return;

    if (this.viewMode !== 'normal') {
      const rendered =
        this.viewMode === 'base-unit-outline' ? this.renderBaseUnitOutline() : this.renderOutlineView();
      if (rendered) return;
      this.viewMode = 'normal';
    }

    const rect = this.getDrawRect(baseImage);
    const drawingRect = this.getDrawingRect(this.drawingImage);
    this.lastReferenceBounds = this.referenceImage ? rect : null;
    this.lastDrawingBounds = drawingRect;
    const simplifiedRect = this.simplifiedPlanesLayer?.rect || rect;
    const layer =
      this.simplifiedPlanesEnabled && this.simplifiedPlanesLayer
        ? this.simplifiedPlanesLayer.canvas
        : this.referenceImage
          ? this.getActiveLayer(rect)
          : this.createLayerFromImage(baseImage, rect);
    const maskLayer = this.referenceImage
      ? this.createLayerFromImage(this.referenceImage, rect)
      : null;

    if (!layer) return;
    const drawingLayer = this.drawingImage
      ? this.createLayerFromImage(this.drawingImage, drawingRect)
      : null;

    const traceAlpha = this.traceModeEnabled ? this.traceOpacity : 1;
    const baseAlpha = traceAlpha * (this.trainingModeEnabled ? 0.7 : 1);

    if (this.negativeSpaceEnabled && this.negativeSpaceLayer) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.35 * baseAlpha;
      this.ctx.drawImage(layer, simplifiedRect.x, simplifiedRect.y, simplifiedRect.width, simplifiedRect.height);
      this.ctx.restore();
      this.ctx.drawImage(
        this.negativeSpaceLayer.canvas,
        this.negativeSpaceLayer.rect.x,
        this.negativeSpaceLayer.rect.y
      );
    } else {
      this.ctx.save();
      this.ctx.globalAlpha = baseAlpha;
      this.ctx.drawImage(layer, simplifiedRect.x, simplifiedRect.y, simplifiedRect.width, simplifiedRect.height);
      this.ctx.restore();
    }

    if (drawingLayer) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.5 * baseAlpha;
      this.ctx.drawImage(drawingLayer, drawingRect.x, drawingRect.y, drawingRect.width, drawingRect.height);
      this.ctx.globalCompositeOperation = 'source-atop';
      this.ctx.fillStyle = this.overlayColor;
      this.ctx.fillRect(drawingRect.x, drawingRect.y, drawingRect.width, drawingRect.height);
      this.ctx.restore();
    }

    if (this.drawingImage && this.drawingAdjustmentEnabled) {
      this.drawResizeHandles(drawingRect);
    }

    if (this.gridLayer && this.sightSizeGridVisible) {
      this.ctx.drawImage(this.gridLayer, 0, 0);
    }
    if (this.perspectiveLayer && this.vanishingPoints.length) {
      this.ctx.drawImage(this.perspectiveLayer, 0, 0);
    }
    if (this.differenceLayer) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.85;
      this.ctx.drawImage(
        this.differenceLayer.canvas,
        this.differenceLayer.rect.x,
        this.differenceLayer.rect.y,
        this.differenceLayer.rect.width,
        this.differenceLayer.rect.height
      );
      this.ctx.restore();
    }
    this.drawAnalysisSelection();
    this.drawGestureLine(rect);
    this.drawLandmarkComparisons(rect);
    this.drawDetectedLandmarks();
    this.drawGhostCorrections(rect);
    this.drawCritiqueOverlay(rect);
    this.drawTraceStrokes();
    this.drawAssistMask();
  }
}
