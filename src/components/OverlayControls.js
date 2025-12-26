import { CritiqueTool } from './CritiqueTool.js';

export class OverlayControls {
  constructor(container, measurementTool, canvasManager, options = {}) {
    this.container = container;
    this.measurementTool = measurementTool;
    this.canvasManager = canvasManager;
    this.handlers = options;
    this.brushTool = options?.brushTool || null;
    this.critiqueTool = null;
    this.importInput = this.createImportInput();
    this.critiqueSummary = this.createCritiqueSummary();
    this.attachButtonHandlers(this.collectElements());
  }

  collectElements() {
    return {
      uploadBtn: document.getElementById('uploadTool'),
      alignBtn: document.getElementById('alignTool'),
      loadSessionBtn: document.getElementById('loadSessionTool'),
      measureBtn: document.getElementById('measureTool'),
      gridBtn: document.getElementById('gridTool'),
      sightSizeGridBtn: document.getElementById('sightSizeGridTool'),
      ghostBtn: document.getElementById('ghostTool'),
      faceBtn: document.getElementById('faceTool'),
      bodyBtn: document.getElementById('bodyTool'),
      refOutlineBtn: document.getElementById('refOutlineTool'),
      drawOutlineBtn: document.getElementById('drawOutlineTool'),
      bothOutlineBtn: document.getElementById('bothOutlineTool'),
      baseUnitOutlineBtn: document.getElementById('baseUnitOutlineTool'),
      baseUnitDrawingToggleBtn: document.getElementById('baseUnitDrawingToggleTool'),
      normalViewBtn: document.getElementById('normalViewTool'),
      critiqueBtn: document.getElementById('critiqueTool'),
      setBaseUnitBtn: document.getElementById('setBaseUnitTool'),
      baseUnitObjectBtn: document.getElementById('baseUnitObjectTool'),
      undoMeasureBtn: document.getElementById('undoMeasureTool'),
      clearMeasureBtn: document.getElementById('clearMeasureTool'),
      onePointBtn: document.getElementById('onePointTool'),
      twoPointBtn: document.getElementById('twoPointTool'),
      threePointBtn: document.getElementById('threePointTool'),
      clearPerspectiveBtn: document.getElementById('clearPerspectiveTool'),
      negativeSpaceBtn: document.getElementById('negativeSpaceTool'),
      simplifyShapesBtn: document.getElementById('simplifyShapesTool'),
      trainingModeBtn: document.getElementById('trainingModeTool'),
      brushBtn: document.getElementById('brushToolButton'),
      eraserBtn: document.getElementById('eraserToolButton'),
      brushSizeUpBtn: document.getElementById('brushSizeUpTool'),
      brushSizeDownBtn: document.getElementById('brushSizeDownTool'),
      undoBrushBtn: document.getElementById('undoBrushTool'),
      clearBrushBtn: document.getElementById('clearBrushTool'),
      traceBtn: document.getElementById('traceTool'),
      autoAlignBtn: document.getElementById('autoAlignTool'),
      resetAlignBtn: document.getElementById('resetAlignTool'),
      moveUpBtn: document.getElementById('moveUpTool'),
      moveDownBtn: document.getElementById('moveDownTool'),
      moveLeftBtn: document.getElementById('moveLeftTool'),
      moveRightBtn: document.getElementById('moveRightTool'),
      scaleUpBtn: document.getElementById('scaleUpTool'),
      scaleDownBtn: document.getElementById('scaleDownTool'),
    };
  }

  createImportInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    input.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      if (file && this.handlers?.onImportJSON) {
        this.handlers.onImportJSON(file);
      }
      input.value = '';
    });
    document.body.appendChild(input);
    return input;
  }

  createCritiqueSummary() {
    const summary = document.createElement('div');
    summary.className = 'critique-summary';
    summary.style.padding = '12px';
    summary.style.fontSize = '14px';
    summary.style.color = '#0f172a';
    summary.style.background = 'rgba(255, 255, 255, 0.85)';
    summary.style.borderRadius = '12px';
    summary.style.margin = '8px auto';
    summary.style.textAlign = 'center';
    summary.style.width = '90%';
    summary.style.display = 'none';
    if (this.container) {
      this.container.appendChild(summary);
    }
    return summary;
  }

  getCanvasSize() {
    const canvas = this.canvasManager?.canvas;
    return {
      width: canvas?.width || 0,
      height: canvas?.height || 0,
    };
  }

  getLandmarkSetForCritique() {
    const face = this.canvasManager?.faceLandmarks;
    const pose = this.canvasManager?.poseLandmarks;
    if (face?.reference?.points?.length && face?.drawing?.points?.length) {
      return { ...face, type: 'face' };
    }
    if (pose?.reference?.points?.length && pose?.drawing?.points?.length) {
      return { ...pose, type: 'pose' };
    }
    return null;
  }

  buildDefaultIndexPairs(refPoints = [], drawPoints = [], type = 'generic') {
    const pairs = [];
    const ensure = (a, b) => {
      if (refPoints[a] && refPoints[b] && drawPoints[a] && drawPoints[b]) {
        pairs.push({ a, b });
      }
    };

    if (type === 'face') {
      ensure(33, 263);
      ensure(1, 152);
      ensure(10, 152);
      ensure(234, 454);
      ensure(127, 356);
    }

    if (type === 'pose') {
      ensure(11, 12);
      ensure(11, 23);
      ensure(12, 24);
      ensure(23, 24);
      ensure(23, 27);
      ensure(24, 28);
    }

    if (!pairs.length) {
      for (let i = 0; i < Math.min(refPoints.length - 1, 5); i += 1) {
        ensure(i, i + 1);
      }
    }

    return pairs;
  }

  updateCritiqueSummary(summary = null) {
    if (!this.critiqueSummary) return;
    if (!summary) {
      this.critiqueSummary.style.display = 'none';
      this.critiqueSummary.textContent = '';
      return;
    }
    const { averageErrorPercent, maxErrorSegment } = summary;
    const avgText = averageErrorPercent !== null ? `${averageErrorPercent.toFixed(1)}%` : 'n/a';
    const maxText = maxErrorSegment
      ? ` | Worst segment: ${maxErrorSegment.a}–${maxErrorSegment.b} ${maxErrorSegment.diffPercent?.toFixed?.(1) ?? ''}%`
      : '';
    this.critiqueSummary.textContent = `Avg error: ${avgText}${maxText}`;
    this.critiqueSummary.style.display = 'block';
  }

  runCritiqueMode() {
    if (!this.canvasManager.referenceImage || !this.canvasManager.drawingImage) {
      window.alert('Load both reference and drawing images first.');
      return;
    }

    const landmarkSet = this.getLandmarkSetForCritique();
    if (!landmarkSet) {
      window.alert('Detect face or body landmarks for both reference and drawing first.');
      return;
    }

    const referencePoints = this.canvasManager.mapPointsToCanvas(
      landmarkSet.reference.points,
      this.canvasManager.referenceImage,
      landmarkSet.reference.dimensions
    );
    const drawingPoints = this.canvasManager.mapPointsToCanvas(
      landmarkSet.drawing.points,
      this.canvasManager.drawingImage,
      landmarkSet.drawing.dimensions
    );

    if (!referencePoints.length || !drawingPoints.length) {
      window.alert('Unable to map landmarks onto the canvas.');
      return;
    }

    const indexPairs = this.buildDefaultIndexPairs(referencePoints, drawingPoints, landmarkSet.type);
    if (!indexPairs.length) {
      window.alert('Not enough landmark points to compare.');
      return;
    }

    this.canvasManager.render();
    this.canvasManager.critiqueModeEnabled = true;
    this.critiqueTool = new CritiqueTool(
      this.canvasManager.canvas,
      this.canvasManager.ctx,
      referencePoints,
      drawingPoints
    );
    this.critiqueTool.runSegmentCritique(indexPairs);
    this.critiqueTool.renderGhostCorrections(indexPairs);
    this.updateCritiqueSummary(this.critiqueTool.getSummary());
  }

  closePanel() {
    if (this.container?.classList.contains('open')) {
      this.container.classList.remove('open');
    }
  }

  async toImageBitmap(imageSource) {
    if (!imageSource) return null;
    if (imageSource instanceof ImageBitmap) return imageSource;
    try {
      return await createImageBitmap(imageSource);
    } catch (error) {
      console.error('Failed to create ImageBitmap for landmarks', error);
      return null;
    }
  }

  attachButtonHandlers(els = {}) {
    const {
      uploadBtn,
      alignBtn,
      loadSessionBtn,
      measureBtn,
      gridBtn,
      sightSizeGridBtn,
      ghostBtn,
      faceBtn,
      bodyBtn,
      refOutlineBtn,
      drawOutlineBtn,
      bothOutlineBtn,
      baseUnitOutlineBtn,
      baseUnitDrawingToggleBtn,
      normalViewBtn,
      critiqueBtn,
      setBaseUnitBtn,
      baseUnitObjectBtn,
      undoMeasureBtn,
      clearMeasureBtn,
      onePointBtn,
      twoPointBtn,
      threePointBtn,
      clearPerspectiveBtn,
      negativeSpaceBtn,
      simplifyShapesBtn,
      trainingModeBtn,
      brushBtn,
      eraserBtn,
      brushSizeUpBtn,
      brushSizeDownBtn,
      undoBrushBtn,
      clearBrushBtn,
      traceBtn,
      autoAlignBtn,
      resetAlignBtn,
      moveUpBtn,
      moveDownBtn,
      moveLeftBtn,
      moveRightBtn,
      scaleUpBtn,
      scaleDownBtn,
    } = els;

    const warnMissing = (el, name) => {
      if (!el) {
        console.warn(`[OverlayControls] Missing ${name}; skipping bindings.`);
        return true;
      }
      return false;
    };

    const updateBaseUnitDrawingToggle = () => {
      if (warnMissing(baseUnitDrawingToggleBtn, 'base unit drawing toggle button')) return;
      baseUnitDrawingToggleBtn.textContent = this.canvasManager.getBaseOutlineDrawingVisible()
        ? 'Hide Drawing in Base Mode'
        : 'Show Drawing in Base Mode';
    };

    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        if (this.importInput) {
          this.importInput.click();
          return;
        }
        this.handlers?.onImportJSON?.();
        this.closePanel();
      });
    }

    if (alignBtn) {
      alignBtn.addEventListener('click', () => {
        this.handlers?.onSaveSession?.();
        this.closePanel();
      });
    }

    if (loadSessionBtn) {
      loadSessionBtn.addEventListener('click', async () => {
        await this.handlers?.onLoadSession?.();
        this.closePanel();
      });
    }

    if (measureBtn) {
      measureBtn.addEventListener('click', () => {
        const nextState = !this.measurementTool.gestureDrawingEnabled;
        this.measurementTool.setGestureDrawingEnabled(nextState);
        measureBtn.textContent = nextState ? 'Measure (On)' : 'Measure';
        this.closePanel();
      });
    }

    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        this.canvasManager.toggleSightSizeGrid(this.measurementTool.getBaseDistance());
        this.closePanel();
      });
    }

    if (sightSizeGridBtn) {
      sightSizeGridBtn.addEventListener('click', () => {
        if (this.canvasManager.sightSizeGridVisible) {
          this.canvasManager.clearSightSizeGrid();
          sightSizeGridBtn.textContent = 'Sight-Size Grid';
        } else {
          const baseUnit = this.measurementTool?.getBaseDistance?.();
          this.canvasManager.drawSightSizeGrid(baseUnit || null);
          sightSizeGridBtn.textContent = 'Sight-Size Grid (On)';
        }
        this.closePanel();
      });

      sightSizeGridBtn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const choice = window.prompt('Divisions (8/12/16)', '8');
        const divisions = Number.parseInt(choice, 10) || 8;
        const baseUnit = this.measurementTool?.getBaseDistance?.();
        this.canvasManager.drawSightSizeGrid(baseUnit || null, divisions);
        sightSizeGridBtn.textContent = 'Sight-Size Grid (On)';
      });
    }

    if (ghostBtn) {
      ghostBtn.addEventListener('click', () => {
        this.canvasManager.toggleGhostMode();
        this.closePanel();
      });
    }

    const setBrushMode = (mode) => {
      if (!this.brushTool) return;
      if (this.brushTool.isEnabled && this.brushTool.mode === mode) {
        this.brushTool.setActive(false);
        if (brushBtn) brushBtn.classList.remove('active');
        if (eraserBtn) eraserBtn.classList.remove('active');
        return;
      }
      this.brushTool.setActive(true);
      this.brushTool.setMode(mode);
      if (brushBtn) {
        brushBtn.classList.toggle('active', mode === 'draw');
      }
      if (eraserBtn) {
        eraserBtn.classList.toggle('active', mode === 'erase');
      }
    };

    if (brushBtn) {
      brushBtn.addEventListener('click', () => {
        setBrushMode('draw');
        this.closePanel();
      });
    }

    if (eraserBtn) {
      eraserBtn.addEventListener('click', () => {
        setBrushMode('erase');
        this.closePanel();
      });
    }

    if (brushSizeUpBtn) {
      brushSizeUpBtn.addEventListener('click', () => {
        if (!this.brushTool) return;
        this.brushTool.setBrushSize(this.brushTool.brushSize + 2);
      });
    }

    if (brushSizeDownBtn) {
      brushSizeDownBtn.addEventListener('click', () => {
        if (!this.brushTool) return;
        this.brushTool.setBrushSize(Math.max(2, this.brushTool.brushSize - 2));
      });
    }

    if (undoBrushBtn) {
      undoBrushBtn.addEventListener('click', () => {
        this.brushTool?.undo();
        this.closePanel();
      });
    }

    if (clearBrushBtn) {
      clearBrushBtn.addEventListener('click', () => {
        this.brushTool?.clear();
        if (this.canvasManager) {
          this.canvasManager.clearBrushLayer();
        }
        this.closePanel();
      });
    }

    if (refOutlineBtn) {
      refOutlineBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage) {
          window.alert('Load reference image first.');
          return;
        }
        this.canvasManager.renderReferenceAsOutline();
        this.closePanel();
      });
    }

    if (drawOutlineBtn) {
      drawOutlineBtn.addEventListener('click', () => {
        if (!this.canvasManager.drawingImage) {
          window.alert('Load drawing image first.');
          return;
        }
        this.canvasManager.renderDrawingAsOutline();
        this.closePanel();
      });
    }

    if (bothOutlineBtn) {
      bothOutlineBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage || !this.canvasManager.drawingImage) {
          window.alert('Load both reference and drawing images first.');
          return;
        }
        this.canvasManager.renderBothAsOutlines();
        this.closePanel();
      });
    }

    if (baseUnitOutlineBtn) {
      baseUnitOutlineBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage) {
          window.alert('Load a reference image first.');
          return;
        }
        this.canvasManager.setViewMode('base-unit-outline');
        updateBaseUnitDrawingToggle();
        this.closePanel();
      });
    }

    if (baseUnitDrawingToggleBtn) {
      baseUnitDrawingToggleBtn.addEventListener('click', () => {
        this.canvasManager.toggleBaseOutlineDrawing();
        updateBaseUnitDrawingToggle();
        this.closePanel();
      });
      updateBaseUnitDrawingToggle();
    }

    if (normalViewBtn) {
      normalViewBtn.addEventListener('click', () => {
        this.canvasManager.resetToNormalRender();
        this.canvasManager.clearDifferenceLayer();
        this.updateCritiqueSummary(null);
        this.closePanel();
      });
    }

    if (traceBtn) {
      traceBtn.addEventListener('click', () => {
        const enabled = this.canvasManager.traceModeEnabled
          ? this.canvasManager.disableTraceMode()
          : this.canvasManager.enableTraceMode();
        if (enabled) {
          this.brushTool?.setActive(true);
          this.brushTool?.setMode('draw');
          if (brushBtn) {
            brushBtn.classList.add('active');
          }
          if (eraserBtn) {
            eraserBtn.classList.remove('active');
          }
        }
        traceBtn.textContent = enabled ? 'Trace (On)' : 'Trace';
        this.closePanel();
      });
    }

    if (faceBtn) {
      faceBtn.addEventListener('click', async () => {
        await this.handleFaceDetection();
        this.closePanel();
      });
    }

    if (bodyBtn) {
      bodyBtn.addEventListener('click', async () => {
        await this.handlePoseDetection();
        this.closePanel();
      });
    }

    if (critiqueBtn) {
      critiqueBtn.addEventListener('click', () => {
        this.runCritiqueMode();
        this.closePanel();
      });
    }

    if (setBaseUnitBtn) {
      setBaseUnitBtn.addEventListener('click', () => {
        if (this.measurementTool.points.length < 2) {
          window.alert('Add at least two points to set a base unit.');
          return;
        }
        const lastIndex = this.measurementTool.points.length - 1;
        this.measurementTool.setBaseUnit(lastIndex - 1, lastIndex);
        this.closePanel();
      });
    }

    if (baseUnitObjectBtn) {
      baseUnitObjectBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage) {
          window.alert('Load a reference image before selecting a base object.');
          return;
        }
        this.measurementTool.startBaseObjectSelection();
        this.closePanel();
      });
    }

    if (undoMeasureBtn) {
      undoMeasureBtn.addEventListener('click', () => {
        this.measurementTool.undoPoint();
        this.closePanel();
      });
    }

    if (clearMeasureBtn) {
      clearMeasureBtn.addEventListener('click', () => {
        this.measurementTool.clearAll();
        this.closePanel();
      });
    }

    const setPerspectiveMode = (mode) => {
      this.canvasManager.startPerspectiveMode(mode);
      this.canvasManager.isPlacingVanishingPoints = true;
      this.closePanel();
    };

    if (onePointBtn) {
      onePointBtn.addEventListener('click', () => setPerspectiveMode('1p'));
    }
    if (twoPointBtn) {
      twoPointBtn.addEventListener('click', () => setPerspectiveMode('2p'));
    }
    if (threePointBtn) {
      threePointBtn.addEventListener('click', () => setPerspectiveMode('3p'));
    }
    if (clearPerspectiveBtn) {
      clearPerspectiveBtn.addEventListener('click', () => {
        this.canvasManager.clearPerspectiveGrid();
        this.closePanel();
      });
    }

    if (negativeSpaceBtn) {
      negativeSpaceBtn.addEventListener('click', () => {
        if (this.canvasManager.negativeSpaceEnabled) {
          this.canvasManager.clearNegativeSpace();
          negativeSpaceBtn.textContent = 'Negative Space';
        } else {
          this.canvasManager.renderNegativeSpace(this.canvasManager.referenceImage);
          negativeSpaceBtn.textContent = 'Negative Space (On)';
        }
        this.closePanel();
      });
    }

    if (simplifyShapesBtn) {
      simplifyShapesBtn.addEventListener('click', () => {
        if (this.canvasManager.simplifiedPlanesEnabled) {
          this.canvasManager.clearSimplifiedPlanes();
          simplifyShapesBtn.textContent = 'Simplify Shapes';
        } else {
          this.canvasManager.renderSimplifiedPlanes(this.canvasManager.referenceImage, 4);
          simplifyShapesBtn.textContent = 'Simplify Shapes (On)';
        }
        this.closePanel();
      });
    }

    const nudgeAmount = 24;
    const scaleStep = 1.05;

    if (autoAlignBtn) {
      autoAlignBtn.addEventListener('click', async () => {
        await this.handleAutoAlignAI();
        this.closePanel();
      });
    }

    if (resetAlignBtn) {
      resetAlignBtn.addEventListener('click', () => {
        this.canvasManager.resetDrawingTransform();
        this.canvasManager.render();
        this.closePanel();
      });
    }

    if (moveUpBtn) {
      moveUpBtn.addEventListener('click', () => {
        this.canvasManager.nudgeDrawing(0, -nudgeAmount);
        this.closePanel();
      });
    }

    if (moveDownBtn) {
      moveDownBtn.addEventListener('click', () => {
        this.canvasManager.nudgeDrawing(0, nudgeAmount);
        this.closePanel();
      });
    }

    if (moveLeftBtn) {
      moveLeftBtn.addEventListener('click', () => {
        this.canvasManager.nudgeDrawing(-nudgeAmount, 0);
        this.closePanel();
      });
    }

    if (moveRightBtn) {
      moveRightBtn.addEventListener('click', () => {
        this.canvasManager.nudgeDrawing(nudgeAmount, 0);
        this.closePanel();
      });
    }

    if (scaleUpBtn) {
      scaleUpBtn.addEventListener('click', () => {
        this.canvasManager.scaleDrawing(scaleStep);
        this.closePanel();
      });
    }

    if (scaleDownBtn) {
      scaleDownBtn.addEventListener('click', () => {
        this.canvasManager.scaleDrawing(1 / scaleStep);
        this.closePanel();
      });
    }

    if (trainingModeBtn) {
      trainingModeBtn.addEventListener('click', () => {
        const enabled = this.canvasManager.toggleTrainingMode();
        trainingModeBtn.textContent = enabled ? 'Training Mode (On)' : 'Training Mode';
        this.closePanel();
      });
    }
  }

  async handleFaceDetection() {
    if (!this.canvasManager.landmarkDetector) return;
    if (!this.canvasManager.referenceImage && !this.canvasManager.drawingImage) {
      window.alert('Load a reference or drawing image first.');
      return;
    }

    const initialized = await this.canvasManager.landmarkDetector.init();
    if (!initialized) {
      const message =
        this.canvasManager.landmarkDetector.loadError?.message || 'Face analysis is unavailable right now.';
      window.alert(message);
      return;
    }

    const referenceBitmap = await this.toImageBitmap(this.canvasManager.referenceImage);
    const drawingBitmap = await this.toImageBitmap(this.canvasManager.drawingImage);
    const refDimensions = this.canvasManager.getImageDimensions(this.canvasManager.referenceImage);
    const drawingDimensions = this.canvasManager.getImageDimensions(this.canvasManager.drawingImage);
    const { refPoints, drawPoints } = await this.canvasManager.landmarkDetector.detectFacePairs(
      referenceBitmap,
      drawingBitmap,
      {
        refWidth: refDimensions.width,
        refHeight: refDimensions.height,
        drawWidth: drawingDimensions.width,
        drawHeight: drawingDimensions.height,
      }
    );

    if (!refPoints?.length && !drawPoints?.length) {
      window.alert('No face landmarks detected.');
      return;
    }

    if (!refPoints?.length) {
      console.warn('No face landmarks detected on the reference image.');
    }
    if (this.canvasManager.drawingImage && !drawPoints?.length) {
      console.warn('No face landmarks detected on the drawing image.');
    }

    this.canvasManager.setFaceLandmarks(refPoints, drawPoints, refDimensions, drawingDimensions);
    this.canvasManager.render();
    if (refPoints?.length && drawPoints?.length) {
      this.canvasManager.autoAlignDrawing();
    }
  }

  async handleAutoAlignAI() {
    if (!this.canvasManager.referenceImage || !this.canvasManager.drawingImage) {
      window.alert('Load both reference and drawing images first.');
      return;
    }

    const { landmarkDetector } = this.canvasManager;
    if (!landmarkDetector) {
      this.canvasManager.autoAlignDrawing();
      return;
    }

    const referenceBitmap = await this.toImageBitmap(this.canvasManager.referenceImage);
    const drawingBitmap = await this.toImageBitmap(this.canvasManager.drawingImage);
    const refDimensions = this.canvasManager.getImageDimensions(this.canvasManager.referenceImage);
    const drawingDimensions = this.canvasManager.getImageDimensions(this.canvasManager.drawingImage);

    const initialized = await landmarkDetector.init();
    if (!initialized) {
      console.warn('MediaPipe initialization failed; using fallback align.', landmarkDetector.loadError);
      this.canvasManager.autoAlignDrawing();
      return;
    }

    let usedLandmarks = false;

    try {
      const { refPoints, drawPoints } = await landmarkDetector.detectFacePairs(referenceBitmap, drawingBitmap, {
        refWidth: refDimensions.width,
        refHeight: refDimensions.height,
        drawWidth: drawingDimensions.width,
        drawHeight: drawingDimensions.height,
      });

      if (refPoints?.length && drawPoints?.length) {
        this.canvasManager.setFaceLandmarks(refPoints, drawPoints, refDimensions, drawingDimensions);
        usedLandmarks = true;
      } else {
        console.warn('Face landmarks not available for auto align.');
      }
    } catch (error) {
      console.warn('Face landmark detection failed for auto align.', error);
    }

    if (!usedLandmarks) {
      try {
        const { refPoints, drawPoints } = await landmarkDetector.detectPosePairs(
          referenceBitmap,
          drawingBitmap,
          {
            refWidth: refDimensions.width,
            refHeight: refDimensions.height,
            drawWidth: drawingDimensions.width,
            drawHeight: drawingDimensions.height,
          }
        );

        if (refPoints?.length && drawPoints?.length) {
          this.canvasManager.setPoseLandmarks(refPoints, drawPoints, refDimensions, drawingDimensions);
          usedLandmarks = true;
        } else {
          console.warn('Pose landmarks not available for auto align.');
        }
      } catch (error) {
        console.warn('Pose landmark detection failed for auto align.', error);
      }
    }

    this.canvasManager.autoAlignDrawing();
  }

  async handlePoseDetection() {
    if (!this.canvasManager.landmarkDetector) return;
    if (!this.canvasManager.referenceImage && !this.canvasManager.drawingImage) {
      window.alert('Load a reference or drawing image first.');
      return;
    }

    const initialized = await this.canvasManager.landmarkDetector.init();
    if (!initialized) {
      const message =
        this.canvasManager.landmarkDetector.loadError?.message || 'Body analysis is unavailable right now.';
      window.alert(message);
      return;
    }

    const referenceBitmap = await this.toImageBitmap(this.canvasManager.referenceImage);
    const drawingBitmap = await this.toImageBitmap(this.canvasManager.drawingImage);
    const refDimensions = this.canvasManager.getImageDimensions(this.canvasManager.referenceImage);
    const drawingDimensions = this.canvasManager.getImageDimensions(this.canvasManager.drawingImage);
    const { refPoints, drawPoints } = await this.canvasManager.landmarkDetector.detectPosePairs(
      referenceBitmap,
      drawingBitmap,
      {
        refWidth: refDimensions.width,
        refHeight: refDimensions.height,
        drawWidth: drawingDimensions.width,
        drawHeight: drawingDimensions.height,
      }
    );

    if (!refPoints?.length && !drawPoints?.length) {
      window.alert('No body landmarks detected.');
      return;
    }

    if (!refPoints?.length) {
      console.warn('No body landmarks detected on the reference image.');
    }
    if (this.canvasManager.drawingImage && !drawPoints?.length) {
      console.warn('No body landmarks detected on the drawing image.');
    }

    this.canvasManager.setPoseLandmarks(refPoints, drawPoints, refDimensions, drawingDimensions);
    this.canvasManager.render();
    if (refPoints?.length && drawPoints?.length) {
      this.canvasManager.autoAlignDrawing();
    }
  }
}
