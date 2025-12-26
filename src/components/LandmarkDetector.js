const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URLS = {
  lite: [
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  ],
  full: [
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  ],
  heavy: [
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
  ],
};

async function loadVision() {
  try {
    return await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15');
  } catch (error) {
    console.warn('tasks-vision unavailable', error);
    return null;
  }
}

export class LandmarkDetector {
  constructor() {
    this.faceLandmarker = null;
    this.poseLandmarker = null;
    this.filesetResolver = null;
    this.initializing = null;
    this.loadError = null;
    this.faceLoadError = null;
    this.poseLoadError = null;
    this.poseModelQuality = 'full';
    this.available = false;
    this.visionModule = null;
    this.enableSegmentationMasks = false;
  }

  async setPoseModelQuality(quality) {
    if (!['lite', 'full', 'heavy'].includes(quality)) return false;
    if (this.poseModelQuality === quality && this.poseLandmarker) return true;

    this.poseModelQuality = quality;

    try {
      this.poseLandmarker?.close?.();
    } catch (_) {}
    this.poseLandmarker = null;
    this.poseLoadError = null;

    const initialized = await this.init({ poseOnly: true });
    return initialized && Boolean(this.poseLandmarker);
  }

  async init(opts = {}) {
    const { poseOnly = false } = opts;

    if (poseOnly && this.poseLandmarker) return true;
    if (!poseOnly && this.available && (this.faceLandmarker || this.poseLandmarker)) return true;
    if (this.initializing) return this.initializing;

    const initPromise = (async () => {
      this.loadError = null;
      if (!poseOnly) {
        this.faceLoadError = null;
      }
      this.poseLoadError = null;
      this.visionModule = this.visionModule || (await loadVision());
      const vision = this.visionModule;
      if (!vision) {
        this.loadError = new Error('MediaPipe Tasks Vision failed to load. Check your connection.');
        console.warn(this.loadError.message);
        return false;
      }

      try {
        if (!this.filesetResolver) {
          this.filesetResolver = await vision.FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
          );
        }
      } catch (error) {
        this.loadError = error;
        console.error('Failed to set up MediaPipe fileset resolver:', error);
        return false;
      }

      if (!poseOnly && !this.faceLandmarker) {
        try {
          this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(this.filesetResolver, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL },
            runningMode: 'IMAGE',
            numFaces: 1,
            minFaceDetectionConfidence: 0.35,
            minFacePresenceConfidence: 0.35,
            minTrackingConfidence: 0.35,
          });
        } catch (error) {
          this.faceLoadError = error;
          console.warn('Failed to initialize Face Landmarker:', error);
        }
      }

      if (!this.poseLandmarker) {
        const modelUrls = POSE_MODEL_URLS[this.poseModelQuality] || [];
        for (const modelUrl of modelUrls) {
          try {
            this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(this.filesetResolver, {
              baseOptions: { modelAssetPath: modelUrl },
              runningMode: 'IMAGE',
              numPoses: 1,
              minPoseDetectionConfidence: 0.35,
              minPosePresenceConfidence: 0.35,
              minTrackingConfidence: 0.35,
              outputSegmentationMasks: Boolean(this.enableSegmentationMasks),
            });
            this.poseLoadError = null;
            break;
          } catch (error) {
            this.poseLoadError = error;
            console.warn('Failed to initialize Pose Landmarker, trying fallback...', error);
          }
        }
      }

      const hasAny = Boolean(this.faceLandmarker || this.poseLandmarker);
      if (!hasAny) {
        this.loadError = this.loadError || this.faceLoadError || this.poseLoadError || new Error('Failed to initialize MediaPipe Tasks');
        console.error('Failed to initialize MediaPipe Tasks:', this.loadError);
      }
      this.available = hasAny;
      return hasAny;
    })();

    this.initializing = initPromise
      .catch((error) => {
        this.loadError = error;
        return false;
      })
      .finally(() => {
        this.initializing = null;
      });

    return this.initializing;
  }

  getDimensions(imageBitmap) {
    return {
      width: imageBitmap?.width || imageBitmap?.naturalWidth || 0,
      height: imageBitmap?.height || imageBitmap?.naturalHeight || 0,
    };
  }

  mapLandmarksToPixels(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks || !canvasWidth || !canvasHeight) return [];
    return landmarks.map((landmark) => ({
      x: landmark.x * canvasWidth,
      y: landmark.y * canvasHeight,
    }));
  }

  getIrisIndices() {
    if (!this.visionModule?.FaceLandmarker) return { left: [], right: [] };
    const { FaceLandmarker } = this.visionModule;
    const normalizeConnections = (connections = []) =>
      connections.map((conn) => (Array.isArray(conn) ? conn : [conn.start, conn.end]));

    const buildIndexList = (connections = []) => {
      const indices = new Set();
      normalizeConnections(connections).forEach(([a, b]) => {
        if (typeof a === 'number') indices.add(a);
        if (typeof b === 'number') indices.add(b);
      });
      return Array.from(indices);
    };

    return {
      left: buildIndexList(FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS),
      right: buildIndexList(FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS),
    };
  }

  getIrisConnections() {
    if (!this.visionModule?.FaceLandmarker) return { left: [], right: [] };
    const { FaceLandmarker } = this.visionModule;
    const normalizeConnections = (connections = []) =>
      connections.map((conn) => (Array.isArray(conn) ? conn : [conn.start, conn.end]));

    return {
      left: normalizeConnections(FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS),
      right: normalizeConnections(FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS),
    };
  }

  getPupilCenters(faceLandmarksForOneFace) {
    if (!faceLandmarksForOneFace?.length) return null;
    const { left: leftIndices, right: rightIndices } = this.getIrisIndices();
    if (!leftIndices.length || !rightIndices.length) return null;

    const centroid = (indices = []) => {
      const points = indices
        .map((idx) => faceLandmarksForOneFace[idx])
        .filter((point) => point && typeof point.x === 'number' && typeof point.y === 'number');
      if (!points.length) return null;
      const sum = points.reduce(
        (acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
          z: acc.z + (point.z || 0),
        }),
        { x: 0, y: 0, z: 0 }
      );
      const count = points.length;
      return { x: sum.x / count, y: sum.y / count, z: sum.z / count };
    };

    return {
      left: centroid(leftIndices),
      right: centroid(rightIndices),
    };
  }

  getPoseConnections() {
    if (!this.visionModule?.PoseLandmarker) return [];
    const { PoseLandmarker } = this.visionModule;
    return (PoseLandmarker.POSE_CONNECTIONS || []).map((conn) =>
      Array.isArray(conn) ? conn : [conn.start, conn.end]
    );
  }

  async detectFaceLandmarks(imageBitmap, canvasWidth, canvasHeight) {
    const initialized = await this.init();
    if (!initialized || !this.faceLandmarker || !imageBitmap) return [];

    const { width, height } = this.getDimensions(imageBitmap);
    const targetWidth = canvasWidth || width;
    const targetHeight = canvasHeight || height;

    const result = await this.faceLandmarker.detect(imageBitmap);
    const faceLandmarks = result?.faceLandmarks?.[0] || [];
    return this.mapLandmarksToPixels(faceLandmarks, targetWidth, targetHeight);
  }

  async detectPoseLandmarks(imageBitmap, canvasWidth, canvasHeight) {
    await this.init({ poseOnly: true });
    if (!this.poseLandmarker || !imageBitmap) {
      return { points: [], segmentationMask: null };
    }

    const { width, height } = this.getDimensions(imageBitmap);
    const targetWidth = canvasWidth || width;
    const targetHeight = canvasHeight || height;

    const result = await this.poseLandmarker.detect(imageBitmap);
    const poseLandmarks = result?.landmarks?.[0] || [];
    const segmentationMask = result?.segmentationMasks?.[0];

    let maskCopy = null;
    try {
      if (segmentationMask?.width && segmentationMask?.height && segmentationMask.getAsFloat32Array) {
        const data = segmentationMask.getAsFloat32Array();
        maskCopy = {
          width: segmentationMask.width,
          height: segmentationMask.height,
          data: new Float32Array(data),
        };
      }
    } catch (error) {
      console.warn('Failed to copy segmentation mask', error);
    }

    return {
      points: this.mapLandmarksToPixels(poseLandmarks, targetWidth, targetHeight),
      segmentationMask: maskCopy,
    };
  }

  async detectFacePairs(referenceImage, drawingImage, dimensions = {}) {
    const { refWidth, refHeight, drawWidth, drawHeight, width, height } = dimensions;
    const refPoints = referenceImage
      ? await this.detectFaceLandmarks(referenceImage, refWidth || width, refHeight || height)
      : [];
    const drawPoints = drawingImage
      ? await this.detectFaceLandmarks(drawingImage, drawWidth || width, drawHeight || height)
      : [];
    return { refPoints, drawPoints };
  }

  async detectPosePairs(referenceImage, drawingImage, dimensions = {}) {
    const { refWidth, refHeight, drawWidth, drawHeight, width, height } = dimensions;
    const { points: refPoints = [], segmentationMask: refSegmentationMask = null } = referenceImage
      ? await this.detectPoseLandmarks(referenceImage, refWidth || width, refHeight || height)
      : {};
    const { points: drawPoints = [], segmentationMask: drawSegmentationMask = null } = drawingImage
      ? await this.detectPoseLandmarks(drawingImage, drawWidth || width, drawHeight || height)
      : {};
    return { refPoints, drawPoints, refSegmentationMask, drawSegmentationMask };
  }

  setOutputSegmentationMasks(enabled = false) {
    this.enableSegmentationMasks = Boolean(enabled);
    try {
      this.poseLandmarker?.close?.();
    } catch (_) {}
    this.poseLandmarker = null;
    this.poseLoadError = null;
    return this.init({ poseOnly: true });
  }
}

const landmarkDetectorInstance = new LandmarkDetector();
export default landmarkDetectorInstance;
