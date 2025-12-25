export class ExportTool {
  static export(canvas) {
    const link = document.createElement('a');
    link.download = 'overlay_export.png';
    link.href = canvas.toDataURL();
    link.click();
  }

  static downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  static exportSessionAsJSON(measurementTool, canvasManager) {
    const payload = {
      meta: {
        savedAt: new Date().toISOString(),
      },
      measurement: measurementTool.getState(),
      canvas: canvasManager.getState(),
      overlayImage: canvasManager.canvas.toDataURL('image/png'),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    ExportTool.downloadBlob(blob, 'overlay-session.json');
  }

  static importSessionFromJSON(file, measurementTool, canvasManager) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed?.measurement) {
          measurementTool.applyState(parsed.measurement);
        }
        if (parsed?.canvas) {
          canvasManager.applyState(parsed.canvas);
        }
        measurementTool.draw();
        canvasManager.render();
      } catch (error) {
        console.error('Failed to import session', error);
      }
    };
    reader.readAsText(file);
  }

  static async exportTimeLapse(measurementTool, canvasManager, options = {}) {
    const frameRate = options.frameRate || 1;
    const snapshots = measurementTool.snapshots?.length
      ? measurementTool.snapshots
      : [measurementTool.snapshot()];
    if (!snapshots.length) return;

    const originalMeasurementState = measurementTool.getState();
    const originalCanvasState = canvasManager.getState();
    const frames = [];

    for (let i = 0; i < snapshots.length; i += 1) {
      measurementTool.applySnapshot(snapshots[i]);
      measurementTool.draw();
      canvasManager.render();
      frames.push({ index: i + 1, dataUrl: canvasManager.canvas.toDataURL('image/png') });
      // Wait between frames to allow rendering
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000 / frameRate));
    }

    measurementTool.applyState(originalMeasurementState);
    canvasManager.applyState(originalCanvasState);
    measurementTool.draw();
    canvasManager.render();

    let JSZipLibrary = null;
    await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')
      .then((module) => {
        JSZipLibrary = module?.default || module?.JSZip || module;
      })
      .catch(() => {
        JSZipLibrary = null;
      });

    if (JSZipLibrary) {
      const zip = new JSZipLibrary();
      frames.forEach((frame) => {
        const base64 = frame.dataUrl.split(',')[1];
        zip.file(`frame-${String(frame.index).padStart(3, '0')}.png`, base64, { base64: true });
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      ExportTool.downloadBlob(blob, 'overlay-timelapse.zip');
      return;
    }

    frames.forEach((frame) => {
      const link = document.createElement('a');
      link.download = `frame-${String(frame.index).padStart(3, '0')}.png`;
      link.href = frame.dataUrl;
      link.click();
    });
  }
}
