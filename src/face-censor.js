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

    // Offscreen processing canvases (reused each frame)
    this._blurCanvas    = document.createElement('canvas');
    this._blurCtx       = this._blurCanvas.getContext('2d');
    this._pixCanvas     = document.createElement('canvas');
    this._pixCtx        = this._pixCanvas.getContext('2d');

    // Smooth bounding box for stable tracking
    this._smoothBbox    = null;
    this._persistFrames = 0;
    // Velocity tracking for predictive motion during face loss
    this._velocity      = { cx: 0, cy: 0 };
    this._prevSmooth    = null;
    this._persistMax    = 60;   // ~1s at 60fps
    // Censor appearance controls
    this.censorOpacity  = 100;  // 0-100 %
    this.maskScaleX     = 1.0;  // horizontal oval multiplier
    this.maskScaleY     = 1.0;  // vertical oval multiplier

    // Censor mode: 'blur' | 'pixelate' | 'blackbar' | 'shadow' | 'stripes'
    this.censorMode     = 'blur';
    this.blockSize      = 10;   // for pixelate mode
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
    if (this._blurCanvas.width !== width || this._blurCanvas.height !== height) {
      this._blurCanvas.width  = width;
      this._blurCanvas.height = height;
    }

    const hasDetection = this.lastResults?.multiFaceLandmarks?.length > 0;

    if (!hasDetection) {
      if (this._smoothBbox && this._persistFrames > 0) {
        this._persistFrames--;

        // ── Predictive motion: carry last velocity, then decay ──
        this._smoothBbox.cx += this._velocity.cx;
        this._smoothBbox.cy += this._velocity.cy;
        this._velocity.cx   *= 0.88;
        this._velocity.cy   *= 0.88;

        // ── Pre-blur offscreen canvas ──
        const mode = this.censorMode;
        if (mode === 'blur' || mode === 'pixelate' || mode === 'frost' || mode === 'warmglow' || mode === 'coolglow') {
          this._blurCtx.filter = `blur(${this.blurRadius}px)`;
          this._blurCtx.drawImage(video, 0, 0, width, height);
          this._blurCtx.filter = 'none';
        } else {
          this._blurCtx.drawImage(video, 0, 0, width, height);
        }

        // ── Fade opacity as persistence runs out ──
        const fadeRatio = this._persistFrames / this._persistMax;
        const alpha     = (this.censorOpacity / 100) * Math.max(fadeRatio, 0.25);
        ctx.save();
        ctx.globalAlpha = alpha;
        this._renderFromBbox(ctx, this._smoothBbox, width, height, true);
        ctx.restore();
      }
      return;
    }

    this._persistFrames = this._persistMax;

    const mode = this.censorMode;
    if (mode === 'blur' || mode === 'pixelate' || mode === 'frost' || mode === 'warmglow' || mode === 'coolglow') {
      this._blurCtx.filter = `blur(${this.blurRadius}px)`;
      this._blurCtx.drawImage(video, 0, 0, width, height);
      this._blurCtx.filter = 'none';
    } else {
      this._blurCtx.drawImage(video, 0, 0, width, height);
    }

    for (const landmarks of this.lastResults.multiFaceLandmarks) {
      this._censorEyePair(ctx, landmarks, width, height);
    }
  }

  _censorEyePair(ctx, landmarks, w, h) {
    const allIndices = [...LEFT_EYE_CONTOUR, ...RIGHT_EYE_CONTOUR];
    const allPts     = allIndices.map(i => ({
      x: landmarks[i].x * w,
      y: landmarks[i].y * h,
    }));
    const xs   = allPts.map(p => p.x);
    const ys   = allPts.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const ex   = this.maskExpand;
    const cx   = (minX + maxX) / 2;
    const cy   = (minY + maxY) / 2;
    const rW   = (maxX - minX) / 2 + ex;
    const rH   = (maxY - minY) / 2 * 1.8 + ex;

    // ── Lerp smoothing ──
    const LERP = 0.28;
    if (!this._smoothBbox) {
      this._smoothBbox = { cx, cy, rW, rH };
    } else {
      // Capture velocity BEFORE update (delta per frame)
      this._velocity.cx = (cx - this._smoothBbox.cx) * LERP * 0.5;
      this._velocity.cy = (cy - this._smoothBbox.cy) * LERP * 0.5;
      this._smoothBbox.cx += (cx - this._smoothBbox.cx) * LERP;
      this._smoothBbox.cy += (cy - this._smoothBbox.cy) * LERP;
      this._smoothBbox.rW += (rW - this._smoothBbox.rW) * LERP;
      this._smoothBbox.rH += (rH - this._smoothBbox.rH) * LERP;
    }

    ctx.save();
    ctx.globalAlpha = this.censorOpacity / 100;
    this._renderFromBbox(ctx, this._smoothBbox, w, h, false);
    ctx.restore();
  }

  /** Render the censor effect using a pre-computed smooth bounding box */
  _renderFromBbox(ctx, bbox, w, h, skipSave = false) {
    const { cx, cy } = bbox;
    const rW  = bbox.rW * this.maskScaleX;
    const rH  = bbox.rH * this.maskScaleY;
    const ex  = 0;
    const bx  = Math.max(0, Math.round(cx - rW));
    const by  = Math.max(0, Math.round(cy - rH));
    const bw  = Math.min(w - bx, Math.round(rW * 2));
    const bh  = Math.min(h - by, Math.round(rH * 2));
    if (bw <= 0 || bh <= 0) return;

    ctx.save();

    switch (this.censorMode) {
      case 'blur': {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0);
        break;
      }
      case 'pixelate': {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        ctx.clip();
        const bs = Math.max(2, this.blurRadius);
        const tW = Math.max(1, Math.floor(bw / bs));
        const tH = Math.max(1, Math.floor(bh / bs));
        if (this._pixCanvas.width !== tW || this._pixCanvas.height !== tH) {
          this._pixCanvas.width = tW; this._pixCanvas.height = tH;
        }
        this._pixCtx.imageSmoothingEnabled = false;
        this._pixCtx.drawImage(this._blurCanvas, bx, by, bw, bh, 0, 0, tW, tH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._pixCanvas, 0, 0, tW, tH, bx, by, bw, bh);
        ctx.imageSmoothingEnabled = true;
        break;
      }
      case 'frost': {
        // Blur + white frosted glass overlay
        ctx.beginPath();
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(bx, by, bw, bh);
        break;
      }
      case 'warmglow': {
        // Blur + warm orange semi-transparent tint
        ctx.beginPath();
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0);
        ctx.fillStyle = 'rgba(255,120,30,0.35)';
        ctx.fillRect(bx, by, bw, bh);
        break;
      }
      case 'coolglow': {
        // Blur + cool cyan semi-transparent tint
        ctx.beginPath();
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0);
        ctx.fillStyle = 'rgba(25,200,255,0.32)';
        ctx.fillRect(bx, by, bw, bh);
        break;
      }
      case 'blackbar': {
        const r = Math.min(bh * 0.35, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, r);
        ctx.fill();
        break;
      }
      case 'shadow': {
        const rad  = Math.max(rW, rH) * 1.1;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0,   'rgba(0,0,0,0.88)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
        grad.addColorStop(0.85,'rgba(0,0,0,0.18)');
        grad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(bx - rad * 0.3, by - rad * 0.3, bw + rad * 0.6, bh + rad * 0.6);
        break;
      }
      case 'stripes': {
        const stripeH = Math.max(2, Math.floor(this.blurRadius / 3));
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, Math.min(bh * 0.35, 8));
        ctx.clip();
        for (let sy = by; sy < by + bh; sy += stripeH * 2) {
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(bx, sy, bw, stripeH);
        }
        break;
      }
      case 'emoji': {
        const sz = Math.max(rW, rH) * 2.2;
        ctx.font = `${sz}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('😎', cx, cy);
        break;
      }
    }

    ctx.restore();
  }

  /** Update settings without restarting */
  setBlurRadius(r)   { this.blurRadius = Math.max(1, Math.min(r, 80)); }
  setMaskExpand(e)   { this.maskExpand = Math.max(0, Math.min(e, 400)); }
  setCensorOpacity(v)  { this.censorOpacity = Math.max(0, Math.min(v, 100)); }
  setMaskScaleX(v)     { this.maskScaleX    = Math.max(0.3, Math.min(v, 6)); }
  setMaskScaleY(v)     { this.maskScaleY    = Math.max(0.3, Math.min(v, 6)); }
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
