import { CanvasManager } from './components/CanvasManager.js';
import { TouchTransform } from './components/TouchTransform.js';
import { MeasurementTool } from './components/MeasurementTool.js';
import { OverlayControls } from './components/OverlayControls.js';
import { ExportTool } from './components/ExportTool.js';
import { LandmarkDetector } from './components/LandmarkDetector.js';
import { BrushTool } from './components/BrushTool.js';


const IS_LOCAL_DEV =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const safeSessionGet = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage errors (e.g. privacy modes)
  }
};

/**
 * During rapid local development, a previously-installed service worker can serve
 * stale cached JS modules (cache-first), causing mismatched versions (e.g. app.js
 * updated but CanvasManager.js still cached). That breaks uploads, theming, and
 * tool initialization in confusing ways.
 *
 * On localhost, automatically unregister overlay service workers and clear the
 * overlay caches, then reload once.
 */
const devDisableServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;

  const alreadyCleared = safeSessionGet('overlayDevSwCleared') === '1';
  const regs = await navigator.serviceWorker.getRegistrations();
  if (!regs.length) return;

  const wasControlled = !!navigator.serviceWorker.controller;

  await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('overlay-cache'))
        .map((key) => caches.delete(key))
    );
  }

  safeSessionSet('overlayDevSwCleared', '1');

  if (wasControlled && !alreadyCleared) {
    // Reload once so the page is no longer controlled by the old service worker.
    window.location.reload();
  }
};

if (IS_LOCAL_DEV) {
  devDisableServiceWorker().catch((error) => console.warn('[dev] SW cleanup failed', error));
}
const initializeApp = () => {
  const overlayCanvas = document.getElementById('overlayCanvas');
  const canvasManager = new CanvasManager(overlayCanvas);
  canvasManager.init(overlayCanvas);
  const brushTool = new BrushTool(canvasManager.brushCanvas, canvasManager.getBrushContext());
  brushTool.attachEvents();

  const measurementTool = new MeasurementTool(canvasManager.canvas, canvasManager.ctx);
  canvasManager.setMeasurementTool(measurementTool);
  measurementTool.setBackgroundRenderer(() => canvasManager.render());
  measurementTool.setBaseObjectCallback((anchor) => {
    canvasManager.setBaseUnitAnchor(anchor);
    if (anchor) {
      canvasManager.setViewMode('base-unit-outline');
    }
  });
  const toolsPanel = document.getElementById('toolsPanel');
  const fabBtn = document.getElementById('fabBtn');
  const darkBtn = document.getElementById('darkBtn');
  const lightBtn = document.getElementById('lightBtn');
  const referenceUpload = document.getElementById('referenceUpload');
  const drawingUpload = document.getElementById('drawingUpload');
  const dualUploadZone = document.getElementById('dualUploadZone');
  const dualUploadInput = document.getElementById('dualUploadInput');
  const dualUploadButton = document.getElementById('dualUploadButton');
  const referenceThumb = document.getElementById('referenceThumb');
  const drawingThumb = document.getElementById('drawingThumb');
  const overlayThumb = document.getElementById('overlayThumb');
  const referenceThumbImage = document.getElementById('referenceThumbImage');
  const drawingThumbImage = document.getElementById('drawingThumbImage');
  const differenceSummary = document.getElementById('differenceSummary');
  const referencePreview = document.getElementById('referencePreview');
  const drawingPreview = document.getElementById('drawingPreview');
  const overlayPreview = document.getElementById('overlayPreview');
  const canvasPlaceholder = document.getElementById('canvasPlaceholder');
  const diffBtn = document.getElementById('diffTool');
  const saveOverlayBtn = document.getElementById('saveOverlay');
  const normalViewBtn = document.getElementById('normalViewTool');

  const setupCollapsibleSections = () => {
    const subsections = document.querySelectorAll('.tool-subsection');
    subsections.forEach((section, index) => {
      const header = section.querySelector('.subsection-header');
      const body = section.querySelector('.subsection-body');
      if (!header || !body) return;

      const bodyId = body.id || `tool-subsection-body-${index}`;
      body.id = bodyId;
      header.setAttribute('aria-controls', bodyId);

      const updateState = (isCollapsed) => {
        section.classList.toggle('collapsed', isCollapsed);
        body.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
        header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      };

      const initialCollapsed = section.classList.contains('collapsed');
      updateState(initialCollapsed);

      const toggleSection = () => {
        const nextState = !section.classList.contains('collapsed');
        updateState(nextState);
      };

      header.addEventListener('click', toggleSection);
      header.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSection();
        }
      });
    });
  };

  const landmarkDetector = new LandmarkDetector();
  canvasManager.setLandmarkDetector(landmarkDetector);

  const isImageFile = (file) => {
    if (!file) return false;
    if (file.type?.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|bmp|webp|heic)$/i.test(file.name || '');
  };

  const loadImageFromFile = (file) =>
    new Promise((resolve, reject) => {
      if (!isImageFile(file)) {
        reject(new Error('Please choose an image file.'));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result;
        if (!dataUrl) {
          reject(new Error('Unable to read image data'));
          return;
        }

        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (error) => reject(error);
        image.src = dataUrl;
      };

      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });

  const loadImageFromDataUrl = (dataUrl) =>
    new Promise((resolve, reject) => {
      if (!dataUrl) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onload = async () => {
        try {
          if (image.decode) {
            await image.decode();
          }
        } catch (error) {
          console.warn('Image decode warning', error);
        }
        resolve(image);
      };
      image.onerror = (error) => reject(error);
      image.src = dataUrl;
    });

  const imageToDataUrl = (image) => {
    if (!image) return null;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(image, 0, 0, width, height);
    return tempCanvas.toDataURL('image/png');
  };

  const setThumbImage = (container, imgElement, image) => {
    if (!container) return;
    if (image) {
      container.style.backgroundImage = `url(${image.src})`;
      container.classList.add('has-image');
      if (imgElement) {
        imgElement.src = image.src;
      }
    } else {
      container.style.backgroundImage = '';
      container.classList.remove('has-image');
      if (imgElement) {
        imgElement.removeAttribute('src');
      }
    }
  };

  const updatePreviewWindows = () => {
    if (referencePreview && canvasManager.referenceImage) {
      referencePreview.style.backgroundImage = `url(${canvasManager.referenceImage.src})`;
    } else if (referencePreview) {
      referencePreview.style.backgroundImage = '';
    }
    if (drawingPreview && canvasManager.drawingImage) {
      drawingPreview.style.backgroundImage = `url(${canvasManager.drawingImage.src})`;
    } else if (drawingPreview) {
      drawingPreview.style.backgroundImage = '';
    }
  };

  const updateOverlayPreview = () => {
    if (!canvasManager.canvas) return;
    const dataUrl = canvasManager.canvas.toDataURL('image/png');
    if (overlayThumb) {
      overlayThumb.src = dataUrl;
      const wrapper = overlayThumb.parentElement;
      if (wrapper) {
        wrapper.classList.add('has-image');
      }
    }
    if (overlayPreview) {
      overlayPreview.style.backgroundImage = `url(${dataUrl})`;
    }
  };

  const updateCanvasPlaceholder = () => {
    if (!canvasPlaceholder) return;
    const hasReference = Boolean(canvasManager.referenceImage);
    const hasDrawing = Boolean(canvasManager.drawingImage);
    const shouldHide = hasReference || hasDrawing;
    canvasPlaceholder.classList.toggle('hidden', shouldHide);
  };

  const updateDifferenceSummary = (score = null) => {
    if (!differenceSummary) return;
    if (score === null || Number.isNaN(score)) {
      differenceSummary.textContent = 'Load both images to analyze differences.';
      return;
    }
    differenceSummary.textContent = `Average difference: ${score.toFixed(1)}% pixel variance`;
  };

  const handleImageUpload = async (file, target = 'reference') => {
    if (!file) return;
    try {
      const image = await loadImageFromFile(file);
      if (image.decode) {
        try {
          await image.decode();
        } catch (error) {
          console.warn('Image decode warning', error);
        }
      }
      if (target === 'reference') {
        canvasManager.setReferenceImage(image);
        setThumbImage(referenceThumb, referenceThumbImage, image);
      } else {
        canvasManager.setDrawingImage(image);
        setThumbImage(drawingThumb, drawingThumbImage, image);
      }
        updateDifferenceSummary(null);
        updatePreviewWindows();
        updateCanvasPlaceholder();
        canvasManager.render();
        updateOverlayPreview();
        console.log('[upload]', {
          kind: target,
          fileName: file.name,
          size: file.size,
          previewUpdated: true,
        });
      } catch (error) {
        console.error('Unable to load image', error);
        window.alert(error?.message || 'Unable to load the selected image. Please try another file.');
      }
    };

  const handleCombinedUpload = async (files = []) => {
    const fileArray = Array.from(files).filter((file) => file && isImageFile(file));
    if (!fileArray.length) return;

    const [first, second] = fileArray;
    if (first) {
      await handleImageUpload(first, 'reference');
    }
    if (second) {
      await handleImageUpload(second, 'drawing');
    } else if (!canvasManager.drawingImage && canvasManager.referenceImage && first !== undefined) {
      await handleImageUpload(first, 'drawing');
    }
  };

  const attachUploadDropTarget = (element, target, fileNormalizer = (list) => Array.from(list || [])) => {
    if (!element || !target) return;

    const clearHighlight = () => element.classList.remove('drag-over');

    element.addEventListener('dragover', (event) => {
      event.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragenter', (event) => {
      event.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', clearHighlight);

    element.addEventListener('drop', async (event) => {
      event.preventDefault();
      clearHighlight();
      const files = fileNormalizer(event.dataTransfer?.items || event.dataTransfer?.files || []);
      if (target === 'both') {
        await handleCombinedUpload(files);
      } else {
        const [file] = files;
        await handleImageUpload(file, target);
      }
    });
  };

  const saveSession = () => {
    if (!canvasManager.referenceImage || !canvasManager.drawingImage) {
      window.alert('Load both a reference and drawing before saving a session.');
      return;
    }

    const referenceImageData = imageToDataUrl(canvasManager.referenceImage);
    const drawingImageData = imageToDataUrl(canvasManager.drawingImage);
    if (!referenceImageData || !drawingImageData) {
      window.alert('Unable to save session images. Please try reloading them.');
      return;
    }

    const sessionData = {
      measurement: measurementTool.getState(),
      canvas: canvasManager.getState(),
      referenceImageData,
      drawingImageData,
      timestamp: Date.now(),
    };

    localStorage.setItem('overlaySession', JSON.stringify(sessionData));
    window.alert('Session saved for offline use.');
  };

  const loadSession = async () => {
    const saved = localStorage.getItem('overlaySession');
    if (!saved) {
      window.alert('No saved session found.');
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(saved);
    } catch (error) {
      console.error('Unable to parse saved session', error);
      window.alert('Saved session is corrupted.');
      return;
    }

    let referenceImage = null;
    let drawingImage = null;
    try {
      if (parsed.referenceImageData) {
        referenceImage = await loadImageFromDataUrl(parsed.referenceImageData);
      }
      if (parsed.drawingImageData) {
        drawingImage = await loadImageFromDataUrl(parsed.drawingImageData);
      }
    } catch (error) {
      console.error('Unable to restore saved images', error);
      window.alert('Unable to load saved images. Try saving the session again.');
      return;
    }

    if (referenceImage) {
      canvasManager.setReferenceImage(referenceImage);
      setThumbImage(referenceThumb, referenceThumbImage, referenceImage);
    }
    if (drawingImage) {
      canvasManager.setDrawingImage(drawingImage);
      setThumbImage(drawingThumb, drawingThumbImage, drawingImage);
    }
    if (parsed?.measurement) {
      measurementTool.applyState(parsed.measurement);
    }
    if (parsed?.canvas) {
      canvasManager.applyState(parsed.canvas);
    }
    measurementTool.draw();
    canvasManager.render();
    updatePreviewWindows();
    updateCanvasPlaceholder();
    updateOverlayPreview();
    updateDifferenceSummary(null);
  };

  setupCollapsibleSections();

  try {
  new OverlayControls(toolsPanel, measurementTool, canvasManager, {
    brushTool,
    onSaveSession: saveSession,
    onLoadSession: loadSession,
    onExportJSON: () => ExportTool.exportSessionAsJSON(measurementTool, canvasManager),
    onImportJSON: (file) => ExportTool.importSessionFromJSON(file, measurementTool, canvasManager),
    onExportTimeLapse: () => ExportTool.exportTimeLapse(measurementTool, canvasManager, { frameRate: 1 }),
  });
  } catch (error) {
    console.error('OverlayControls failed to initialize', error);
  }

  const toggleToolsPanel = (forceOpen) => {
    if (!toolsPanel) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !toolsPanel.classList.contains('open');
    toolsPanel.classList.toggle('open', shouldOpen);
  };

  if (fabBtn) {
    fabBtn.addEventListener('click', () => toggleToolsPanel());
  }

  const applyTheme = (theme) => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light', isLight);
    document.documentElement.setAttribute('data-theme', theme);
    if (darkBtn) {
      darkBtn.classList.toggle('active', !isLight);
      darkBtn.setAttribute('aria-pressed', (!isLight).toString());
    }
    if (lightBtn) {
      lightBtn.classList.toggle('active', isLight);
      lightBtn.setAttribute('aria-pressed', isLight.toString());
    }
    localStorage.setItem('overlayTheme', theme);
  };

  const initializeTheme = () => {
    const stored = localStorage.getItem('overlayTheme');
    if (stored === 'light' || stored === 'dark') {
      applyTheme(stored);
      return;
    }
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  };

  if (darkBtn) {
    darkBtn.addEventListener('click', () => applyTheme('dark'));
  }

  if (lightBtn) {
    lightBtn.addEventListener('click', () => applyTheme('light'));
  }

  const normalizeFileList = (fileList = []) => {
    if (!fileList) return [];
    if (fileList instanceof FileList)
      return Array.from(fileList).filter((file) => file && isImageFile(file));
    return Array.from(fileList)
      .map((item) => (item?.getAsFile ? item.getAsFile() : item))
      .filter((file) => file && isImageFile(file));
  };

  const uploadDropTargets = document.querySelectorAll('[data-upload-target]');
  uploadDropTargets.forEach((element) => {
    attachUploadDropTarget(element, element.dataset.uploadTarget, normalizeFileList);
  });

  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    attachUploadDropTarget(canvasContainer, 'both', normalizeFileList);
  }

  if (referenceUpload) {
    referenceUpload.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      await handleImageUpload(file, 'reference');
      referenceUpload.value = '';
    });
  }

  if (drawingUpload) {
    drawingUpload.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      await handleImageUpload(file, 'drawing');
      drawingUpload.value = '';
    });
  }

  if (dualUploadInput) {
    dualUploadInput.addEventListener('change', async (event) => {
      await handleCombinedUpload(event.target.files || []);
      dualUploadInput.value = '';
    });
  }

  if (dualUploadButton && dualUploadInput) {
    dualUploadButton.addEventListener('click', () => dualUploadInput.click());
  }

  if (dualUploadZone) {
    dualUploadZone.addEventListener('click', (event) => {
      if (event.target === dualUploadButton) return;
      dualUploadInput?.click?.();
    });
    dualUploadZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dualUploadInput?.click?.();
      }
    });
    dualUploadZone.setAttribute('tabindex', '0');
  }

  if (saveOverlayBtn) {
    saveOverlayBtn.addEventListener('click', () => {
      if (!canvasManager.canvas) return;
      updateOverlayPreview();
      ExportTool.export(canvasManager.canvas);
    });
  }

  if (diffBtn) {
    diffBtn.addEventListener('click', () => {
      const result = canvasManager.analyzeDifference();
      if (!result) {
        window.alert('Load both a reference photo and drawing to compare.');
        return;
      }
      updateDifferenceSummary(result.averageDifference);
      updateOverlayPreview();
    });
  }

  if (normalViewBtn) {
    normalViewBtn.addEventListener('click', () => {
      updateDifferenceSummary(null);
      updateOverlayPreview();
    });
  }

  if (canvasContainer && canvasManager.canvas) {
    new TouchTransform(canvasContainer, canvasManager.canvas);
  }

  updateCanvasPlaceholder();
  updatePreviewWindows();
  updateOverlayPreview();
  initializeTheme();

  if (!IS_LOCAL_DEV && 'serviceWorker' in navigator) {
    const serviceWorkerUrl = new URL('service-worker.js', window.location.href).toString();
    navigator.serviceWorker
      .register(serviceWorkerUrl)
      .then(() => console.log('Service worker registered'))
      .catch((error) => console.error('Service worker registration failed', error));
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
