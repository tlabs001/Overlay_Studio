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
      analysisSelectBtn: document.getElementById('analysisSelectTool'),
      faceBtn: document.getElementById('faceTool'),
      bodyBtn: document.getElementById('bodyTool'),
      poseModelSelect: document.getElementById('poseModelQuality'),
      poseModelStatus: document.getElementById('poseModelStatus'),
      togglePupils: document.getElementById('togglePupils'),
      toggleIrises: document.getElementById('toggleIrises'),
      poseDensity: document.getElementById('poseDensity'),
      toggleSegmentation: document.getElementById('toggleSegmentation'),
      refOutlineBtn: document.getElementById('refOutlineTool'),
      drawOutlineBtn: document.getElementById('drawOutlineTool'),
      bothOutlineBtn: document.getElementById('bothOutlineTool'),
      outlineAssistBtn: document.getElementById('outlineAssistTool'),
      outlineAssistReadout: document.getElementById('outlineAssistReadout'),
      outlineRefinementSlider: document.getElementById('outlineRefinement'),
      outlineRefinementValue: document.getElementById('outlineRefinementValue'),
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

  isCloudEnabled() {
    return !!this.canvasManager?.cloudAiEnabled && !!this.canvasManager?.cloudVision;
  }

  mapNormalizedKeypoints(keypoints, dimensions) {
    if (!keypoints || !dimensions?.width || !dimensions?.height) return [];
    const order = ['left_eye', 'right_eye', 'nose_tip', 'mouth_left', 'mouth_right'];
    return order
      .map((key) => keypoints?.[key])
      .filter(Boolean)
      .map((point) => ({
        x: point.x * dimensions.width,
        y: point.y * dimensions.height,
      }));
  }

  async detectCloudFacePairs() {
    if (!this.canvasManager?.cloudVision) {
      throw new Error('Cloud vision client is unavailable.');
    }
    const { referenceImage, drawingImage } = this.canvasManager;
    if (!referenceImage || !drawingImage) {
      throw new Error('Load both reference and drawing images.');
    }

    const response = await this.canvasManager.cloudVision.detectFaceKeypoints(referenceImage, drawingImage);
    const refDimensions = this.canvasManager.getImageDimensions(referenceImage);
    const drawDimensions = this.canvasManager.getImageDimensions(drawingImage);
    const refPoints = this.mapNormalizedKeypoints(response?.reference?.keypoints, refDimensions);
    const drawPoints = this.mapNormalizedKeypoints(response?.drawing?.keypoints, drawDimensions);

    return { refPoints, drawPoints, refDimensions, drawDimensions };
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
      console.warn('Failed to create ImageBitmap for landmarks; using image element instead.', error);
      return imageSource;
    }
  }

  async cropBitmap(bitmap, crop) {
    if (!bitmap || !crop) return bitmap;
    const x = Math.max(0, Math.floor(crop.x || 0));
    const y = Math.max(0, Math.floor(crop.y || 0));
    const width = Math.max(1, Math.floor(crop.width || 0));
    const height = Math.max(1, Math.floor(crop.height || 0));

    try {
      return await createImageBitmap(bitmap, x, y, width, height);
    } catch (error) {
      console.warn('Bitmap crop failed; falling back to canvas.', error);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);

    try {
      return await createImageBitmap(canvas);
    } catch (error) {
      console.warn('createImageBitmap unavailable on cropped canvas; returning image element.', error);
      const image = new Image();
      image.src = canvas.toDataURL('image/png');
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      return image;
    }
  }

  applyAnalysisOffset(points = [], offset = { x: 0, y: 0 }) {
    if (!points?.length || (!offset.x && !offset.y)) return points || [];
    return points.map((point) => ({ ...point, x: point.x + offset.x, y: point.y + offset.y }));
  }

  normalizeSegmentationMask(mask, offset = { x: 0, y: 0 }, dimensions = { width: 0, height: 0 }) {
    if (!mask) return null;
    const { width: fullWidth, height: fullHeight } = dimensions;
    return {
      ...mask,
      offsetX: offset.x || 0,
      offsetY: offset.y || 0,
      fullWidth: fullWidth || mask.fullWidth || mask.width,
      fullHeight: fullHeight || mask.fullHeight || mask.height,
    };
  }

  async getAnalysisInput(image, options = {}) {
    const { isDrawing = false } = options;
    const originalDimensions = this.canvasManager.getImageDimensions(image);
    const crop = this.canvasManager.getAnalysisCrop?.(image, { useDrawingRect: isDrawing });
    const baseBitmap = await this.toImageBitmap(image);

    if (!crop || !baseBitmap) {
      return {
        bitmap: baseBitmap,
        detectionDimensions: originalDimensions,
        originalDimensions,
        offset: { x: 0, y: 0 },
      };
    }

    const croppedBitmap = await this.cropBitmap(baseBitmap, crop);

    return {
      bitmap: croppedBitmap,
      detectionDimensions: { width: crop.width, height: crop.height },
      originalDimensions,
      offset: { x: crop.x, y: crop.y },
    };
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
      analysisSelectBtn,
      faceBtn,
      bodyBtn,
      poseModelSelect,
      poseModelStatus,
      togglePupils,
      toggleIrises,
      poseDensity,
      toggleSegmentation,
      refOutlineBtn,
      drawOutlineBtn,
      bothOutlineBtn,
      outlineAssistBtn,
      outlineAssistReadout,
      outlineRefinementSlider,
      outlineRefinementValue,
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

    const outlineButtons = [refOutlineBtn, drawOutlineBtn, bothOutlineBtn, outlineAssistBtn];
    const setActiveOutlineButton = (activeBtn) => {
      outlineButtons.forEach((btn) => {
        if (!btn) return;
        btn.classList.toggle('active', btn === activeBtn);
      });
    };

    const syncUIFromState = () => {
      const interactionMode = this.canvasManager?.interactionMode || 'none';
      const traceEnabled = !!this.canvasManager?.traceModeEnabled;

      if (measureBtn) {
        const measureActive = interactionMode === 'measure';
        measureBtn.textContent = measureActive ? 'Measure (On)' : 'Measure';
        measureBtn.classList.toggle('active', measureActive);
      }

      if (brushBtn) {
        brushBtn.classList.toggle(
          'active',
          interactionMode === 'brush' && this.brushTool?.mode === 'draw'
        );
      }

      if (eraserBtn) {
        eraserBtn.classList.toggle(
          'active',
          interactionMode === 'brush' && this.brushTool?.mode === 'erase'
        );
      }

      if (traceBtn) {
        traceBtn.textContent = traceEnabled ? 'Trace (On)' : 'Trace';
        traceBtn.classList.toggle('active', traceEnabled);
      }
    };

    const updateOutlineAssistReadout = () => {
      if (!outlineAssistReadout) return;
      const enabled = !!this.canvasManager?.outlineAssistEnabled;
      const aligned = !!this.canvasManager?.outlineAssistAligned;
      const score = enabled ? this.canvasManager?.outlineAssistLastScore ?? 0 : null;
      const scoreText = typeof score === 'number' && !Number.isNaN(score) ? score.toFixed(2) : '--';
      outlineAssistReadout.textContent = enabled
        ? `Alignment: ${scoreText}${aligned ? ' (Aligned)' : ''}`
        : 'Alignment: --';
      outlineAssistReadout.classList.toggle('aligned', enabled && aligned);
    };

    const setOutlineAssistMode = (activeBtn, enabled) => {
      this.canvasManager?.setOutlineAssistEnabled?.(enabled);
      setActiveOutlineButton(activeBtn || null);
      updateOutlineAssistReadout();
    };

    const attachAssistListener = () => {
      if (!this.canvasManager?.setOutlineAssistScoreListener) return;
      this.canvasManager.setOutlineAssistScoreListener(() => updateOutlineAssistReadout());
      updateOutlineAssistReadout();
    };

    attachAssistListener();

    const applyOutlineRefinement = (value) => {
      const numeric = Math.max(0, Math.min(100, Number(value) || 0));
      if (outlineRefinementSlider) outlineRefinementSlider.value = String(numeric);
      if (outlineRefinementValue) outlineRefinementValue.textContent = String(numeric);
      localStorage.setItem('overlay.outlineRefinement', String(numeric));
      this.canvasManager?.setOutlineRefinement?.(numeric);
    };

    const savedOutlineRefinement = parseInt(
      localStorage.getItem('overlay.outlineRefinement') || '0',
      10
    );
    applyOutlineRefinement(Number.isNaN(savedOutlineRefinement) ? 0 : savedOutlineRefinement);

    if (outlineRefinementSlider) {
      outlineRefinementSlider.addEventListener('input', (event) => {
        applyOutlineRefinement(event.target.value);
      });
    }

    const savedPoseModelQuality = localStorage.getItem('overlay.poseModelQuality') || 'full';
    if (poseModelSelect) {
      poseModelSelect.value = savedPoseModelQuality;
    }

    const applyPoseModelQuality = async (quality) => {
      localStorage.setItem('overlay.poseModelQuality', quality);

      if (!this.canvasManager?.landmarkDetector) return;

      if (poseModelStatus) poseModelStatus.textContent = 'Loading…';
      if (poseModelSelect) poseModelSelect.disabled = true;

      try {
        const ok = await this.canvasManager.landmarkDetector.setPoseModelQuality(quality);
        if (poseModelStatus) poseModelStatus.textContent = ok ? 'Ready' : 'Unavailable';
      } catch (e) {
        console.warn('Failed to set pose model quality', e);
        if (poseModelStatus) poseModelStatus.textContent = 'Error';
      } finally {
        if (poseModelSelect) poseModelSelect.disabled = false;
        setTimeout(() => {
          if (poseModelStatus) poseModelStatus.textContent = '';
        }, 2000);
      }
    };

    if (poseModelSelect) {
      poseModelSelect.addEventListener('change', async () => {
        const quality = poseModelSelect.value;
        await applyPoseModelQuality(quality);
      });
    }

    if (this.canvasManager?.landmarkDetector) {
      applyPoseModelQuality(savedPoseModelQuality);
    }

    const savedShowPupils = localStorage.getItem('overlay.showPupils') === 'true';
    const savedShowIrises = localStorage.getItem('overlay.showIrises') === 'true';
    const savedPoseDensity = Number(localStorage.getItem('overlay.poseDensity') || '0');
    const savedShowSegmentation = localStorage.getItem('overlay.showSegmentation') === 'true';

    if (togglePupils) {
      togglePupils.checked = savedShowPupils;
      this.canvasManager.showPupils = savedShowPupils;
      togglePupils.addEventListener('change', () => {
        const enabled = Boolean(togglePupils.checked);
        this.canvasManager.showPupils = enabled;
        localStorage.setItem('overlay.showPupils', enabled);
        this.canvasManager.render();
      });
    }

    if (toggleIrises) {
      toggleIrises.checked = savedShowIrises;
      this.canvasManager.showIrises = savedShowIrises;
      toggleIrises.addEventListener('change', () => {
        const enabled = Boolean(toggleIrises.checked);
        this.canvasManager.showIrises = enabled;
        localStorage.setItem('overlay.showIrises', enabled);
        this.canvasManager.render();
      });
    }

    if (poseDensity) {
      poseDensity.value = savedPoseDensity.toString();
      this.canvasManager.poseDensitySubdivisions = Number(poseDensity.value) || 0;
      poseDensity.addEventListener('change', () => {
        const density = Number(poseDensity.value) || 0;
        this.canvasManager.poseDensitySubdivisions = density;
        localStorage.setItem('overlay.poseDensity', density.toString());
        this.canvasManager.render();
      });
    }

    if (toggleSegmentation) {
      toggleSegmentation.checked = savedShowSegmentation;
      this.canvasManager.showPoseSegmentation = savedShowSegmentation;
      toggleSegmentation.addEventListener('change', async () => {
        const enabled = Boolean(toggleSegmentation.checked);
        this.canvasManager.showPoseSegmentation = enabled;
        localStorage.setItem('overlay.showSegmentation', enabled);
        if (this.canvasManager?.landmarkDetector) {
          await this.canvasManager.landmarkDetector.setOutputSegmentationMasks(enabled);
        }
        this.canvasManager.render();
      });
      if (this.canvasManager?.landmarkDetector && savedShowSegmentation) {
        this.canvasManager.landmarkDetector.setOutputSegmentationMasks(true);
      }
    }

    const updateAnalysisSelectBtn = () => {
      if (!analysisSelectBtn) return;
      if (this.canvasManager.isSelectingAnalysisArea()) {
        analysisSelectBtn.textContent = 'Selecting area…';
        analysisSelectBtn.classList.add('active');
        return;
      }
      if (this.canvasManager.hasAnalysisSelection()) {
        analysisSelectBtn.textContent = 'Clear selection';
        analysisSelectBtn.classList.add('active');
      } else {
        analysisSelectBtn.textContent = 'Select Area';
        analysisSelectBtn.classList.remove('active');
      }
    };

    this.canvasManager.setAnalysisSelectionListener?.(() => updateAnalysisSelectBtn());

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
        const nextMode = this.canvasManager?.interactionMode === 'measure' ? 'none' : 'measure';
        if (nextMode === 'measure') {
          this.canvasManager?.setTraceEnabled(false);
          this.canvasManager?.setInteractionMode('measure');
          this.brushTool?.setActive(false);
        } else {
          this.canvasManager?.setInteractionMode('none');
        }
        syncUIFromState();
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
      const interactionMode = this.canvasManager?.interactionMode || 'none';
      const isActiveMode = interactionMode === 'brush' && this.brushTool.isEnabled && this.brushTool.mode === mode;

      if (isActiveMode) {
        this.brushTool.setActive(false);
        this.canvasManager?.setTraceEnabled(false);
        this.canvasManager?.setInteractionMode('none');
        syncUIFromState();
        return;
      }

      this.canvasManager?.setTraceEnabled(false);
      this.canvasManager?.setInteractionMode('brush');
      this.brushTool.setActive(true);
      this.brushTool.setMode(mode);
      syncUIFromState();
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
        setOutlineAssistMode(refOutlineBtn, false);
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
        setOutlineAssistMode(drawOutlineBtn, false);
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
        setOutlineAssistMode(bothOutlineBtn, false);
        this.closePanel();
      });
    }

    if (outlineAssistBtn) {
      outlineAssistBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage || !this.canvasManager.drawingImage) {
          window.alert('Load both reference and drawing images first.');
          return;
        }
        this.canvasManager.renderBothAsOutlines();
        setOutlineAssistMode(outlineAssistBtn, true);
        this.closePanel();
      });
    }

    if (baseUnitOutlineBtn) {
      baseUnitOutlineBtn.addEventListener('click', () => {
        if (!this.canvasManager.referenceImage) {
          window.alert('Load a reference image first.');
          return;
        }
        setOutlineAssistMode(null, false);
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
        setOutlineAssistMode(null, false);
        this.canvasManager.resetToNormalRender();
        this.canvasManager.clearDifferenceLayer();
        this.updateCritiqueSummary(null);
        this.closePanel();
      });
    }

    if (traceBtn) {
      traceBtn.addEventListener('click', () => {
        const enabled = this.canvasManager.setTraceEnabled(!this.canvasManager.traceModeEnabled);
        if (enabled) {
          this.brushTool?.setActive(true);
          this.brushTool?.setMode('draw');
        } else {
          this.brushTool?.setActive(false);
        }
        syncUIFromState();
        this.closePanel();
      });
    }

    if (analysisSelectBtn) {
      analysisSelectBtn.addEventListener('click', () => {
        if (this.canvasManager.isSelectingAnalysisArea()) {
          this.canvasManager.cancelAnalysisSelection();
        } else if (this.canvasManager.hasAnalysisSelection()) {
          this.canvasManager.clearAnalysisSelection();
        } else {
          this.canvasManager.beginAnalysisSelection();
        }
        updateAnalysisSelectBtn();
        this.closePanel();
      });
      updateAnalysisSelectBtn();
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
        await this.handleSmartAutoAlign();
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

    syncUIFromState();
  }

  async handleFaceDetection() {
    const cloudActive = this.isCloudEnabled();
    if (!this.canvasManager.referenceImage && !this.canvasManager.drawingImage) {
      window.alert('Load a reference or drawing image first.');
      return;
    }

    if (cloudActive) {
      try {
        const { refPoints, drawPoints, refDimensions, drawDimensions } = await this.detectCloudFacePairs();
        this.canvasManager.setFaceLandmarks(refPoints, drawPoints, refDimensions, drawDimensions);
        this.canvasManager.render();
        if (refPoints?.length && drawPoints?.length) {
          this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
        }
        return;
      } catch (error) {
        console.warn('Cloud face detection failed; falling back to local.', error);
      }
    }

    if (!this.canvasManager.landmarkDetector) return;

    const initialized = await this.canvasManager.landmarkDetector.init();
    if (!initialized) {
      const message =
        this.canvasManager.landmarkDetector.loadError?.message || 'Face analysis is unavailable right now.';
      window.alert(message);
      return;
    }

    const referenceInput = await this.getAnalysisInput(this.canvasManager.referenceImage);
    const drawingInput = await this.getAnalysisInput(this.canvasManager.drawingImage, { isDrawing: true });

    const { refPoints, drawPoints } = await this.canvasManager.landmarkDetector.detectFacePairs(
      referenceInput.bitmap,
      drawingInput.bitmap,
      {
        refWidth: referenceInput.detectionDimensions.width,
        refHeight: referenceInput.detectionDimensions.height,
        drawWidth: drawingInput.detectionDimensions.width,
        drawHeight: drawingInput.detectionDimensions.height,
      }
    );

    const adjustedRefPoints = this.applyAnalysisOffset(refPoints, referenceInput.offset);
    const adjustedDrawPoints = this.applyAnalysisOffset(drawPoints, drawingInput.offset);

    if (!adjustedRefPoints?.length && !adjustedDrawPoints?.length) {
      window.alert('No face landmarks detected.');
      return;
    }

    if (!adjustedRefPoints?.length) {
      console.warn('No face landmarks detected on the reference image.');
    }
    if (this.canvasManager.drawingImage && !adjustedDrawPoints?.length) {
      console.warn('No face landmarks detected on the drawing image.');
    }

    this.canvasManager.setFaceLandmarks(
      adjustedRefPoints,
      adjustedDrawPoints,
      referenceInput.originalDimensions,
      drawingInput.originalDimensions
    );
    this.canvasManager.render();
    if (adjustedRefPoints?.length && adjustedDrawPoints?.length) {
      this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
    }
  }

  async handleSmartAutoAlign() {
    if (!this.canvasManager.referenceImage || !this.canvasManager.drawingImage) {
      window.alert('Load both reference and drawing images first.');
      return;
    }

    const cloudActive = this.isCloudEnabled();
    if (cloudActive) {
      try {
        const { refPoints, drawPoints, refDimensions, drawDimensions } = await this.detectCloudFacePairs();
        this.canvasManager.setFaceLandmarks(refPoints, drawPoints, refDimensions, drawDimensions);
        this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
        return;
      } catch (error) {
        console.warn('Cloud auto align failed; falling back to local.', error);
      }
    }

    const { landmarkDetector } = this.canvasManager;
    if (!landmarkDetector) {
      this.canvasManager.autoAlignDrawing({ preferLandmarks: false });
      return;
    }

    let initialized = false;
    try {
      initialized = await landmarkDetector.init();
    } catch (error) {
      console.warn('Landmark detector initialization failed; using fallback align.', error);
    }

    if (!initialized) {
      this.canvasManager.autoAlignDrawing({ preferLandmarks: false });
      return;
    }

    const referenceBitmap = await this.toImageBitmap(this.canvasManager.referenceImage);
    const drawingBitmap = await this.toImageBitmap(this.canvasManager.drawingImage);
    const refDimensions = this.canvasManager.getImageDimensions(this.canvasManager.referenceImage);
    const drawingDimensions = this.canvasManager.getImageDimensions(this.canvasManager.drawingImage);

    try {
      const { refPoints, drawPoints } = await landmarkDetector.detectFacePairs(referenceBitmap, drawingBitmap, {
        refWidth: refDimensions.width,
        refHeight: refDimensions.height,
        drawWidth: drawingDimensions.width,
        drawHeight: drawingDimensions.height,
      });

      if (refPoints?.length && drawPoints?.length) {
        this.canvasManager.setFaceLandmarks(refPoints, drawPoints, refDimensions, drawingDimensions);
        this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
        return;
      }
      console.warn('Face landmarks not available for auto align; trying pose.');
    } catch (error) {
      console.warn('Face landmark detection failed for auto align.', error);
    }

    try {
      const {
        refPoints,
        drawPoints,
        refSegmentationMask,
        drawSegmentationMask,
      } = await landmarkDetector.detectPosePairs(referenceBitmap, drawingBitmap, {
        refWidth: refDimensions.width,
        refHeight: refDimensions.height,
        drawWidth: drawingDimensions.width,
        drawHeight: drawingDimensions.height,
      });

      if (refPoints?.length && drawPoints?.length) {
        this.canvasManager.setPoseLandmarks(
          refPoints,
          drawPoints,
          refDimensions,
          drawingDimensions,
          refSegmentationMask,
          drawSegmentationMask
        );
        this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
        return;
      }
      console.warn('Pose landmarks not available for auto align.');
    } catch (error) {
      console.warn('Pose landmark detection failed for auto align.', error);
    }

    this.canvasManager.autoAlignDrawing({ preferLandmarks: false });
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

    const referenceInput = await this.getAnalysisInput(this.canvasManager.referenceImage);
    const drawingInput = await this.getAnalysisInput(this.canvasManager.drawingImage, { isDrawing: true });
    const {
      refPoints,
      drawPoints,
      refSegmentationMask,
      drawSegmentationMask,
    } = await this.canvasManager.landmarkDetector.detectPosePairs(
      referenceInput.bitmap,
      drawingInput.bitmap,
      {
        refWidth: referenceInput.detectionDimensions.width,
        refHeight: referenceInput.detectionDimensions.height,
        drawWidth: drawingInput.detectionDimensions.width,
        drawHeight: drawingInput.detectionDimensions.height,
      }
    );

    const adjustedRefPoints = this.applyAnalysisOffset(refPoints, referenceInput.offset);
    const adjustedDrawPoints = this.applyAnalysisOffset(drawPoints, drawingInput.offset);
    const normalizedRefMask = this.normalizeSegmentationMask(
      refSegmentationMask,
      referenceInput.offset,
      referenceInput.originalDimensions
    );
    const normalizedDrawMask = this.normalizeSegmentationMask(
      drawSegmentationMask,
      drawingInput.offset,
      drawingInput.originalDimensions
    );

    if (!adjustedRefPoints?.length && !adjustedDrawPoints?.length) {
      window.alert('No body landmarks detected.');
      return;
    }

    if (!adjustedRefPoints?.length) {
      console.warn('No body landmarks detected on the reference image.');
    }
    if (this.canvasManager.drawingImage && !adjustedDrawPoints?.length) {
      console.warn('No body landmarks detected on the drawing image.');
    }

    this.canvasManager.setPoseLandmarks(
      adjustedRefPoints,
      adjustedDrawPoints,
      referenceInput.originalDimensions,
      drawingInput.originalDimensions,
      normalizedRefMask,
      normalizedDrawMask
    );
    this.canvasManager.render();
    if (adjustedRefPoints?.length && adjustedDrawPoints?.length) {
      this.canvasManager.autoAlignDrawing({ preferLandmarks: true });
    }
  }
}
