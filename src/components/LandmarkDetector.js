const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker_lite/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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
    this.available = false;
    this.visionModule = null;
  }

  async init() {
    if (this.available && this.faceLandmarker && this.poseLandmarker) return true;
    if (this.initializing) return this.initializing;

    const initPromise = (async () => {
      this.loadError = null;
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

        if (!this.faceLandmarker) {
          this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(this.filesetResolver, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL },
            runningMode: 'IMAGE',
            numFaces: 1,
          });
        }

        if (!this.poseLandmarker) {
          this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(this.filesetResolver, {
            baseOptions: { modelAssetPath: POSE_MODEL_URL },
            runningMode: 'IMAGE',
            numPoses: 1,
          });
        }

        this.available = true;
        return true;
      } catch (error) {
        this.loadError = error;
        console.error('Failed to initialize MediaPipe Tasks:', error);
        return false;
      }
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
    const initialized = await this.init();
    if (!initialized || !this.poseLandmarker || !imageBitmap) return [];

    const { width, height } = this.getDimensions(imageBitmap);
    const targetWidth = canvasWidth || width;
    const targetHeight = canvasHeight || height;

    const result = await this.poseLandmarker.detect(imageBitmap);
    const poseLandmarks = result?.landmarks?.[0] || [];
    return this.mapLandmarksToPixels(poseLandmarks, targetWidth, targetHeight);
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
    const refPoints = referenceImage
      ? await this.detectPoseLandmarks(referenceImage, refWidth || width, refHeight || height)
      : [];
    const drawPoints = drawingImage
      ? await this.detectPoseLandmarks(drawingImage, drawWidth || width, drawHeight || height)
      : [];
    return { refPoints, drawPoints };
  }
}

const landmarkDetectorInstance = new LandmarkDetector();
export default landmarkDetectorInstance;
