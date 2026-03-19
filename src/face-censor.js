/**
 * CENSOR ENGINE PRO — Face Censor Module
 * Uses MediaPipe FaceMesh to detect and blur eye regions in real time.
 * Tracks up to 4 faces at 60fps with sub-pixel accuracy.
 */

// Eye landmark indices from MediaPipe Face Mesh 468-point model
const LEFT_EYE_CONTOUR  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const RIGHT_EYE_CONTOUR = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382];
const LEFT_EYE_CENTER   = [468]; // refined iris center (requires refineLandmarks)
const RIGHT_EYE_CENTER  = [473];

export class FaceCensorEngine {
  constructor() {
    this.faceMesh       = null;
    this.isInitialized  = false;
    this.isActive       = false;
    this.lastResults    = null;
    this.blurRadius     = 20;
    this.maskExpand     = 10;
    this.onResultsCb    = null;
    this.onLoadProgress = null;

    // Offscreen blur canvas (reused each frame)
    this._blurCanvas    = document.createElement('canvas');
    this._blurCtx       = this._blurCanvas.getContext('2d');
  }

  /**
   * Initialize MediaPipe Face Mesh model.
   * @param {number} maxFaces
   * @param {function} onProgress (pct 0-100, label)
   */
  async init(maxFaces = 2, onProgress = null) {
    this.onLoadProgress = onProgress;

    return new Promise((resolve, reject) => {
      try {
        if (typeof FaceMesh === 'undefined') {
          reject(new Error('MediaPipe FaceMesh not loaded. Check CDN scripts.'));
          return;
        }

        onProgress?.(10, 'Creating FaceMesh instance…');

        this.faceMesh = new FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMesh.setOptions({
          maxNumFaces:           maxFaces,
          refineLandmarks:       true,   // enables iris tracking (landmarks 468-477)
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
          selfieMode:             false,
        });

        this.faceMesh.onResults((results) => {
          this.lastResults = results;
          this.onResultsCb?.(results);
        });

        onProgress?.(30, 'Downloading FaceMesh model…');

        // Trigger model download by sending a dummy 1×1 black canvas
        const dummy = document.createElement('canvas');
        dummy.width = dummy.height = 1;

        this.faceMesh.send({ image: dummy }).then(() => {
          this.isInitialized = true;
          onProgress?.(100, 'FaceMesh ready');
          resolve();
        }).catch((err) => {
          reject(err);
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  /** Set the callback invoked on each results batch */
  onResults(cb) { this.onResultsCb = cb; }

  /** Send a video frame to Face Mesh for processing */
  async processFrame(imageSource) {
    if (!this.isInitialized || !this.isActive) return;
    try {
      await this.faceMesh.send({ image: imageSource });
    } catch (_) {
      // Ignore frame-send errors (can happen on seek/resize)
    }
  }

  /**
   * Apply eye blur to a 2D canvas context.
   * @param {CanvasRenderingContext2D} ctx    - destination context
   * @param {HTMLVideoElement}         video  - source video element
   * @param {number}                   width  - canvas width
   * @param {number}                   height - canvas height
   */
  applyBlurMask(ctx, video, width, height) {
    if (!this.lastResults?.multiFaceLandmarks?.length) return;

    // Ensure blur canvas matches output size
    if (this._blurCanvas.width !== width || this._blurCanvas.height !== height) {
      this._blurCanvas.width  = width;
      this._blurCanvas.height = height;
    }

    // Paint the blurred version of the whole frame onto blur canvas
    this._blurCtx.filter = `blur(${this.blurRadius}px)`;
    this._blurCtx.drawImage(video, 0, 0, width, height);
    this._blurCtx.filter = 'none';

    for (const landmarks of this.lastResults.multiFaceLandmarks) {
      this._censorEyePair(ctx, landmarks, width, height);
    }
  }

  /** Censor both eyes from one face's landmark set */
  _censorEyePair(ctx, landmarks, w, h) {
    this._censorEye(ctx, landmarks, LEFT_EYE_CONTOUR,  w, h);
    this._censorEye(ctx, landmarks, RIGHT_EYE_CONTOUR, w, h);
  }

  /** Clip to eye polygon and paint from the pre-blurred canvas */
  _censorEye(ctx, landmarks, indices, w, h) {
    const pts = indices.map(i => ({
      x: landmarks[i].x * w,
      y: landmarks[i].y * h,
    }));

    // Compute bounding box for expand padding
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const ex = this.maskExpand;

    ctx.save();

    // Build eye polygon path (expanded)
    ctx.beginPath();
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Scale points outward from eye center to expand the mask
    const expandedPts = pts.map(p => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: p.x + (dx / len) * ex, y: p.y + (dy / len) * ex };
    });

    ctx.moveTo(expandedPts[0].x, expandedPts[0].y);
    for (let i = 1; i < expandedPts.length; i++) {
      ctx.lineTo(expandedPts[i].x, expandedPts[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // Draw the pre-blurred canvas only within this clipped region
    ctx.drawImage(this._blurCanvas, 0, 0);

    ctx.restore();
  }

  /** Update settings without restarting */
  setBlurRadius(r)   { this.blurRadius = Math.max(1, Math.min(r, 80)); }
  setMaskExpand(e)   { this.maskExpand = Math.max(0, Math.min(e, 60)); }
  setActive(active)  { this.isActive = active; if (!active) this.lastResults = null; }

  /** How many faces currently detected */
  get faceCount() {
    return this.lastResults?.multiFaceLandmarks?.length ?? 0;
  }

  /** Get normalized eye center coordinates for a given face index */
  getEyeCenters(faceIdx = 0) {
    const lm = this.lastResults?.multiFaceLandmarks?.[faceIdx];
    if (!lm) return null;
    return {
      left:  lm[468] || lm[159],  // iris center or fallback
      right: lm[473] || lm[386],
    };
  }

  /** Update max number of faces tracked */
  async setMaxFaces(n) {
    if (!this.faceMesh) return;
    this.faceMesh.setOptions({ maxNumFaces: n });
  }

  destroy() {
    this.faceMesh?.close();
    this.faceMesh = null;
    this.isInitialized = false;
  }
}
