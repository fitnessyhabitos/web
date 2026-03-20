/**
 * CENSOR ENGINE PRO — Face Censor Module v3
 * Targets: Eyes / Full Face / Head
 * Blur: downsample-based (GPU-accelerated, universally supported)
 * Zones: face-anchored tracking via MediaPipe landmarks
 */

const LEFT_EYE_CONTOUR  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const RIGHT_EYE_CONTOUR = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382];
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,
                   400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
// MediaPipe nose tip (landmark 1) — used as face anchor reference
const NOSE_TIP = 1;

export class FaceCensorEngine {
  constructor() {
    this.faceMesh       = null;
    this.isInitialized  = false;
    this.isActive       = false;
    this.lastResults    = null;
    this.blurRadius     = 30;
    this.maskExpand     = 10;
    this.onResultsCb    = null;

    // Offscreen canvases
    this._blurCanvas  = document.createElement('canvas');
    this._blurCtx     = this._blurCanvas.getContext('2d');
    this._smallCanvas = document.createElement('canvas');  // downsample
    this._smallCtx    = this._smallCanvas.getContext('2d');
    this._pixCanvas   = document.createElement('canvas');
    this._pixCtx      = this._pixCanvas.getContext('2d');
    this._bgCanvas    = document.createElement('canvas');  // bg blur sharp copy
    this._bgCtx       = this._bgCanvas.getContext('2d');
    // Template matching canvas at 1/8 scale
    this._trkCanvas   = document.createElement('canvas');
    this._trkCtx      = this._trkCanvas.getContext('2d', { willReadFrequently: true });
    this._trkScale    = 0.125;
    this._frameIdx    = 0;

    // SelfieSegmentation — portrait-mode background blur
    this._selfieSegmentation = null;
    this._segReady           = false;
    this._lastSegMask        = null;   // ImageBitmap mask from MediaPipe
    this._personCanvas       = document.createElement('canvas');
    this._personCtx          = this._personCanvas.getContext('2d');

    // Eye / face bbox (smooth)
    this._smoothBbox    = null;
    this._persistFrames = 0;
    this._velocity      = { cx: 0, cy: 0 };
    this._persistMax    = 60;

    // Face bbox for background blur
    this._faceBbox      = null;
    this._faceVelocity  = { cx: 0, cy: 0 };
    this._facePersist   = 0;
    this._faceMax       = 50;

    // Settings
    this.censorOpacity  = 100;
    this.maskScaleX     = 1.0;
    this.maskScaleY     = 1.0;
    this.censorMode     = 'blur';
    this.censorTarget   = 'eyes';   // 'eyes' | 'face' | 'head'
    this.bgBlurActive   = false;
    this.bgBlurRadius   = 18;
    this.bgBlurMode     = 'blur';  // 'blur'|'pixelate'|'noir'|'vintage'|'neon'|'dark'|'frosted'|'glitch'|'mirror'|'zoom'

    // Manual zones: [{id, cx, cy, rW, rH, mode, _faceAnchored, _offX, _offY}]
    this.manualZones    = [];
    this._nextZoneId    = 1;
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  async init(maxFaces = 2, onProgress = null) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof FaceMesh === 'undefined') { reject(new Error('FaceMesh not loaded')); return; }
        onProgress?.(10, 'Creating FaceMesh…');
        this.faceMesh = new FaceMesh({
          locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
        });
        this.faceMesh.setOptions({
          maxNumFaces: maxFaces,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: false,
        });
        this.faceMesh.onResults(r => { this.lastResults = r; this.onResultsCb?.(r); });
        onProgress?.(30, 'Downloading FaceMesh model…');
        const dummy = document.createElement('canvas');
        dummy.width = dummy.height = 1;
        this.faceMesh.send({ image: dummy }).then(() => {
          this.isInitialized = true;
          onProgress?.(100, 'FaceMesh ready');
          resolve();
        }).catch(reject);
      } catch(e) { reject(e); }
    });
  }

  onResults(cb) { this.onResultsCb = cb; }
  async processFrame(src) {
    if (!this.isInitialized || !this.isActive) return;
    try { await this.faceMesh.send({ image: src }); } catch(_) {}
  }

  // ── SelfieSegmentation (portrait-mode BG blur) ───────────────────────────
  async initSelfieSegmentation() {
    if (typeof SelfieSegmentation === 'undefined') {
      console.warn('SelfieSegmentation not loaded');
      return;
    }
    try {
      this._selfieSegmentation = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
      });
      // modelSelection 1 = landscape (faster + more accurate for full body)
      this._selfieSegmentation.setOptions({ modelSelection: 1 });
      this._selfieSegmentation.onResults(r => {
        this._lastSegMask = r.segmentationMask;
      });
      // Warm-up with 1-pixel dummy
      const dummy = document.createElement('canvas');
      dummy.width = dummy.height = 1;
      await this._selfieSegmentation.send({ image: dummy });
      this._segReady = true;
      console.log('SelfieSegmentation ready');
    } catch (e) {
      console.warn('SelfieSegmentation init failed:', e);
    }
  }

  async processSegmentation(src) {
    if (!this._segReady || !this._selfieSegmentation) return;
    try { await this._selfieSegmentation.send({ image: src }); } catch(_) {}
  }

  // ══════════════════════════════════════════════════════
  // BLUR HELPERS — downsample-based (works everywhere)
  // ══════════════════════════════════════════════════════
  /**
   * Prepare _blurCanvas with a soft-blurred copy of the video.
   * Uses downsample + upsample (GPU bilinear) — no CSS filter needed.
   */
  _prepareBluCanvas(video, width, height) {
    if (this._blurCanvas.width !== width || this._blurCanvas.height !== height) {
      this._blurCanvas.width = width;
      this._blurCanvas.height = height;
    }
    // Scale factor: higher blurRadius → smaller intermediate canvas → more blur
    const scale = Math.max(0.03, 1 / (1 + this.blurRadius * 0.12));
    const sw    = Math.max(4, Math.round(width  * scale));
    const sh    = Math.max(4, Math.round(height * scale));
    if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
      this._smallCanvas.width  = sw;
      this._smallCanvas.height = sh;
    }
    // Pass 1: draw at tiny size
    this._smallCtx.imageSmoothingEnabled = true;
    this._smallCtx.drawImage(video, 0, 0, sw, sh);
    // Pass 2: upscale back — bilinear creates the blur
    this._blurCtx.imageSmoothingEnabled  = true;
    this._blurCtx.imageSmoothingQuality  = 'high';
    this._blurCtx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
  }

  // ══════════════════════════════════════════════════════
  // BACKGROUND BLUR
  // ══════════════════════════════════════════════════════
  applyBgBlur(ctx, video, width, height) {
    // Resize helper canvases
    for (const c of [this._bgCanvas, this._personCanvas]) {
      if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
    }

    // Draw the background effect
    this._drawBgEffect(ctx, video, width, height);

    // ── Portrait mode — segmentation available ─────────────────────────
    if (this._segReady && this._lastSegMask) {
      this._personCtx.clearRect(0, 0, width, height);
      this._personCtx.drawImage(video, 0, 0, width, height);
      this._personCtx.globalCompositeOperation = 'destination-in';
      this._personCtx.drawImage(this._lastSegMask, 0, 0, width, height);
      this._personCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this._personCanvas, 0, 0);
      return;
    }

    // ── Fallback — face-oval only (no segmentation yet) ───────────────
    const lms = this.lastResults?.multiFaceLandmarks;
    if (lms?.length > 0) {
      this._updateFaceBbox(lms[0], width, height);
    } else if (this._faceBbox && this._facePersist > 0) {
      this._facePersist--;
      this._faceBbox.cx += this._faceVelocity.cx; this._faceVelocity.cx *= 0.88;
      this._faceBbox.cy += this._faceVelocity.cy; this._faceVelocity.cy *= 0.88;
    }
    if (this._faceBbox && (lms?.length > 0 || this._facePersist > 0)) {
      this._bgCtx.drawImage(video, 0, 0, width, height);
      const fb = this._faceBbox;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(fb.cx, fb.cy, fb.rW, fb.rH, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this._bgCanvas, 0, 0);
      ctx.restore();
    }
  }

  /** Draw the configured background effect to ctx */
  _drawBgEffect(ctx, video, width, height) {
    const mode = this.bgBlurMode || 'blur';

    // Compute downsample size (used by most modes for blur)
    const blurScale = Math.max(0.03, 1 / (1 + this.bgBlurRadius * 0.18));
    const sw = Math.max(4, Math.round(width  * blurScale));
    const sh = Math.max(4, Math.round(height * blurScale));

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    switch (mode) {
      default:
      case 'blur': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        break;
      }

      case 'pixelate': {
        // Extra-small canvas → upscale without smoothing → block pixels
        const ps = Math.max(0.008, 1 / (1 + this.bgBlurRadius * 0.55));
        const pw = Math.max(2, Math.round(width  * ps));
        const ph = Math.max(2, Math.round(height * ps));
        if (this._smallCanvas.width !== pw || this._smallCanvas.height !== ph) {
          this._smallCanvas.width = pw; this._smallCanvas.height = ph;
        }
        this._smallCtx.imageSmoothingEnabled = false;
        this._smallCtx.drawImage(video, 0, 0, pw, ph);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._smallCanvas, 0, 0, pw, ph, 0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        break;
      }

      case 'noir': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'grayscale(1) contrast(1.25) brightness(0.8)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        break;
      }

      case 'vintage': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'sepia(0.9) contrast(1.1) brightness(0.85) saturate(1.3)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        break;
      }

      case 'neon': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'saturate(5) hue-rotate(40deg) contrast(1.2) brightness(0.8)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        break;
      }

      case 'warm': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'sepia(0.4) saturate(2) hue-rotate(-10deg) brightness(0.9)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        break;
      }

      case 'dark': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        const darkAlpha = 0.35 + (this.bgBlurRadius / 60) * 0.45;
        ctx.fillStyle = `rgba(0,0,0,${darkAlpha.toFixed(2)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'frosted': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.fillStyle = 'rgba(180,215,255,0.28)';
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'glitch': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        // Base frame
        ctx.filter = 'saturate(1.5) contrast(1.05)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        // Red channel shifted left
        ctx.globalAlpha = 0.45;
        ctx.filter = 'sepia(1) hue-rotate(-30deg) saturate(8) brightness(0.75)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, -10, 0, width, height);
        // Cyan channel shifted right
        ctx.filter = 'sepia(1) hue-rotate(150deg) saturate(8) brightness(0.75)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 10, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        break;
      }

      case 'mirror': {
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        break;
      }

      case 'zoom': {
        // Zoom into blurred BG — bokeh-like
        const zf  = 1.25 + (this.bgBlurRadius / 60) * 0.5;
        const zsw = Math.max(4, Math.round(width  * blurScale / zf));
        const zsh = Math.max(4, Math.round(height * blurScale / zf));
        if (this._smallCanvas.width !== zsw || this._smallCanvas.height !== zsh) {
          this._smallCanvas.width = zsw; this._smallCanvas.height = zsh;
        }
        this._smallCtx.drawImage(video, 0, 0, zsw, zsh);
        const zw = width * zf, zh = height * zf;
        ctx.drawImage(this._smallCanvas, 0, 0, zsw, zsh, (width - zw) / 2, (height - zh) / 2, zw, zh);
        break;
      }

      case 'ice': {
        // Cool icy blue blur
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'saturate(0.6) hue-rotate(190deg) brightness(0.85) contrast(0.9)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        // Ice tint overlay
        ctx.fillStyle = 'rgba(140,210,255,0.18)';
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'fire': {
        // Hot fire orange/red blur
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'saturate(4) hue-rotate(-20deg) contrast(1.2) brightness(0.75)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(255,60,0,0.15)';
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'dream': {
        // Dreamy soft pink/purple glow
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'saturate(1.8) hue-rotate(290deg) brightness(0.9) contrast(0.85)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(200,130,255,0.20)';
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'matrix': {
        // Dark green digital/hacker look
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'grayscale(1) sepia(1) hue-rotate(90deg) saturate(8) brightness(0.55) contrast(1.4)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,30,0,0.35)';
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'sketch': {
        // High-contrast desaturated sketch
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'grayscale(1) contrast(2.5) brightness(1.15)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        break;
      }

      case 'vhs': {
        // VHS tape effect — blur + color aberration
        if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
          this._smallCanvas.width = sw; this._smallCanvas.height = sh;
        }
        this._smallCtx.drawImage(video, 0, 0, sw, sh);
        ctx.filter = 'saturate(1.3) contrast(1.1)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.filter = 'none';
        // Chromatic aberration (red offset left, cyan right)
        ctx.globalAlpha = 0.35;
        ctx.filter = 'sepia(1) hue-rotate(-15deg) saturate(6) brightness(0.7)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, -6, 0, width, height);
        ctx.filter = 'sepia(1) hue-rotate(155deg) saturate(6) brightness(0.7)';
        ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 6, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        const lh = Math.max(2, Math.round(height * 0.012));
        for (let y = 0; y < height; y += lh * 2) ctx.fillRect(0, y, width, lh);
        break;
      }

      case 'smoke': {
        // Deep smoke — heavy dark blur with white mist
        const ss = Math.max(0.02, 1 / (1 + this.bgBlurRadius * 0.28));
        const ssw = Math.max(3, Math.round(width * ss));
        const ssh = Math.max(3, Math.round(height * ss));
        if (this._smallCanvas.width !== ssw || this._smallCanvas.height !== ssh) {
          this._smallCanvas.width = ssw; this._smallCanvas.height = ssh;
        }
        this._smallCtx.drawImage(video, 0, 0, ssw, ssh);
        ctx.filter = 'grayscale(0.5) brightness(0.6) contrast(1.1)';
        ctx.drawImage(this._smallCanvas, 0, 0, ssw, ssh, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(200,200,210,0.12)';
        ctx.fillRect(0, 0, width, height);
        break;
      }
    }
    ctx.restore();
  }

  _updateFaceBbox(lm, w, h) {
    const pts  = FACE_OVAL.map(i => ({ x: lm[i].x * w, y: lm[i].y * h }));
    const xs   = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const rW = (maxX - minX) / 2 * 1.45, rH = (maxY - minY) / 2 * 1.65;
    const LERP = 0.22;
    if (!this._faceBbox) {
      this._faceBbox = { cx, cy, rW, rH };
    } else {
      this._faceVelocity.cx = (cx - this._faceBbox.cx) * LERP * 0.5;
      this._faceVelocity.cy = (cy - this._faceBbox.cy) * LERP * 0.5;
      this._faceBbox.cx += (cx - this._faceBbox.cx) * LERP;
      this._faceBbox.cy += (cy - this._faceBbox.cy) * LERP;
      this._faceBbox.rW  += (rW - this._faceBbox.rW) * LERP;
      this._faceBbox.rH  += (rH - this._faceBbox.rH) * LERP;
    }
    this._facePersist = this._faceMax;
  }

  // ══════════════════════════════════════════════════════
  // MAIN CENSOR — AI detected (eyes / full face / head)
  // ══════════════════════════════════════════════════════
  applyBlurMask(ctx, video, width, height) {
    const hasDetection = this.lastResults?.multiFaceLandmarks?.length > 0;

    // Prepare blurred copy
    this._prepareBluCanvas(video, width, height);

    if (!hasDetection) {
      if (this._smoothBbox && this._persistFrames > 0) {
        this._persistFrames--;
        this._smoothBbox.cx += this._velocity.cx; this._velocity.cx *= 0.88;
        this._smoothBbox.cy += this._velocity.cy; this._velocity.cy *= 0.88;
        const fade  = this._persistFrames / this._persistMax;
        const alpha = (this.censorOpacity / 100) * Math.max(fade, 0.25);
        ctx.save(); ctx.globalAlpha = alpha;
        this._renderFromBbox(ctx, this._smoothBbox, width, height);
        ctx.restore();
      }
      return;
    }

    this._persistFrames = this._persistMax;
    for (const lm of this.lastResults.multiFaceLandmarks) {
      this._censorTarget(ctx, lm, width, height);
    }
  }

  _censorTarget(ctx, lm, w, h) {
    let cx, cy, rW, rH;

    if (this.censorTarget === 'eyes') {
      // Eyes only: both eye contours unified
      const pts = [...LEFT_EYE_CONTOUR, ...RIGHT_EYE_CONTOUR]
        .map(i => ({ x: lm[i].x * w, y: lm[i].y * h }));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      rW = (Math.max(...xs) - Math.min(...xs)) / 2 + this.maskExpand;
      rH = (Math.max(...ys) - Math.min(...ys)) / 2 * 1.8 + this.maskExpand;

    } else if (this.censorTarget === 'face') {
      // Full face: FACE_OVAL
      const pts = FACE_OVAL.map(i => ({ x: lm[i].x * w, y: lm[i].y * h }));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      rW = (Math.max(...xs) - Math.min(...xs)) / 2 + this.maskExpand;
      rH = (Math.max(...ys) - Math.min(...ys)) / 2 + this.maskExpand;

    } else { // 'head' — includes forehead and chin extra margin
      const pts = FACE_OVAL.map(i => ({ x: lm[i].x * w, y: lm[i].y * h }));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      rW = (Math.max(...xs) - Math.min(...xs)) / 2 * 1.35 + this.maskExpand;
      rH = (Math.max(...ys) - Math.min(...ys)) / 2 * 1.5  + this.maskExpand;
    }

    // Smooth bbox tracking
    const LERP = 0.28;
    if (!this._smoothBbox) {
      this._smoothBbox = { cx, cy, rW, rH };
    } else {
      this._velocity.cx = (cx - this._smoothBbox.cx) * LERP * 0.5;
      this._velocity.cy = (cy - this._smoothBbox.cy) * LERP * 0.5;
      this._smoothBbox.cx += (cx - this._smoothBbox.cx) * LERP;
      this._smoothBbox.cy += (cy - this._smoothBbox.cy) * LERP;
      this._smoothBbox.rW  += (rW - this._smoothBbox.rW) * LERP;
      this._smoothBbox.rH  += (rH - this._smoothBbox.rH) * LERP;
    }
    ctx.save();
    ctx.globalAlpha = this.censorOpacity / 100;
    this._renderFromBbox(ctx, this._smoothBbox, w, h);
    ctx.restore();
  }

  /** Render censor effect at a given bbox */
  _renderFromBbox(ctx, bbox, w, h) {
    const { cx, cy } = bbox;
    const rW  = bbox.rW * this.maskScaleX;
    const rH  = bbox.rH * this.maskScaleY;
    const bx  = Math.max(0, Math.round(cx - rW));
    const by  = Math.max(0, Math.round(cy - rH));
    const bw  = Math.min(w - bx, Math.round(rW * 2));
    const bh  = Math.min(h - by, Math.round(rH * 2));
    if (bw <= 0 || bh <= 0) return;
    this._drawCensorEffect(ctx, this.censorMode, cx, cy, rW, rH, bx, by, bw, bh, w, h);
  }

  /** Core censor rendering (shared between AI censor and manual zones) */
  /** clipShape: 'ellipse' (default, AI censor) | 'rect' (manual zones) */
  _drawCensorEffect(ctx, mode, cx, cy, rW, rH, bx, by, bw, bh, W, H, clipShape = 'ellipse') {
    const radius = Math.min(bw, bh) * 0.15;  // rounded corner for rect
    const _clip = () => {
      ctx.beginPath();
      if (clipShape === 'rect') {
        ctx.roundRect(bx, by, bw, bh, radius);
      } else {
        ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
      }
      ctx.clip();
    };
    ctx.save();
    switch (mode) {
      case 'blur': {
        _clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        break;
      }
      case 'pixelate': {
        _clip();
        const bs = Math.max(6, Math.round(bw * 0.08));
        const pW = Math.max(1,Math.floor(bw/bs)), pH = Math.max(1,Math.floor(bh/bs));
        if (this._pixCanvas.width!==pW||this._pixCanvas.height!==pH){
          this._pixCanvas.width=pW; this._pixCanvas.height=pH; }
        this._pixCtx.imageSmoothingEnabled=false;
        this._pixCtx.drawImage(this._blurCanvas,bx,by,bw,bh,0,0,pW,pH);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this._pixCanvas,0,0,pW,pH,bx,by,bw,bh);
        ctx.imageSmoothingEnabled=true;
        break;
      }
      case 'mosaic': {
        _clip();
        const bs = Math.max(20, Math.round(bw * 0.18));
        const pW = Math.max(1,Math.floor(bw/bs)), pH = Math.max(1,Math.floor(bh/bs));
        if (this._pixCanvas.width!==pW||this._pixCanvas.height!==pH){
          this._pixCanvas.width=pW; this._pixCanvas.height=pH; }
        this._pixCtx.imageSmoothingEnabled=false;
        this._pixCtx.drawImage(this._blurCanvas,bx,by,bw,bh,0,0,pW,pH);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this._pixCanvas,0,0,pW,pH,bx,by,bw,bh);
        ctx.imageSmoothingEnabled=true;
        break;
      }
      case 'frost': {
        _clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        ctx.fillStyle='rgba(220,235,255,0.80)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'warmglow': {
        _clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        ctx.fillStyle='rgba(255,60,0,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'coolglow': {
        _clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        ctx.fillStyle='rgba(0,120,255,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'blackbar': {
        ctx.fillStyle='rgba(0,0,0,0.97)';
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8)); ctx.fill();
        break;
      }
      case 'whiteout': {
        ctx.beginPath();
        if (clipShape === 'rect') {
          ctx.roundRect(bx, by, bw, bh, radius);
        } else {
          ctx.ellipse(cx, cy, rW, rH, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle='rgba(255,255,255,0.97)'; ctx.fill();
        break;
      }
      case 'shadow': {
        const rad=Math.max(rW,rH)*1.1;
        const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
        gr.addColorStop(0,'rgba(0,0,0,0.97)'); gr.addColorStop(0.55,'rgba(0,0,0,0.75)');
        gr.addColorStop(0.85,'rgba(0,0,0,0.25)'); gr.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=gr;
        ctx.fillRect(bx-rad*0.3,by-rad*0.3,bw+rad*0.6,bh+rad*0.6);
        break;
      }
      case 'stripes': {
        const sh2=Math.max(4,Math.floor(this.blurRadius/2));
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8)); ctx.clip();
        for(let y=by;y<by+bh;y+=sh2*2){
          ctx.fillStyle='rgba(0,0,0,0.95)'; ctx.fillRect(bx,y,bw,sh2);
        }
        break;
      }
      case 'emoji': {
        const sz=Math.max(rW,rH)*2.2;
        ctx.font=`${sz}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('😎',cx,cy);
        break;
      }
    }
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════
  // MANUAL ZONES — face-anchored tracking
  // ══════════════════════════════════════════════════════
  addManualZone(cx, cy, rW, rH, mode, canvasW, canvasH, opacity = 100) {
    const zone = {
      id:      this._nextZoneId++,
      cx, cy, rW, rH,
      mode:    mode || this.censorMode,
      opacity: Math.max(10, Math.min(100, opacity)),
      // Face anchoring (set on creation if a face is near)
      _faceAnchored: false,
      _offX: 0,  // offset from nose tip (normalized)
      _offY: 0,
      _faceIdx: 0,
      // Velocity for smooth movement
      _vel: { cx: 0, cy: 0 },
    };

    // Try to anchor to the nearest detected face
    const lms = this.lastResults?.multiFaceLandmarks;
    if (lms?.length > 0 && canvasW && canvasH) {
      for (let fi = 0; fi < lms.length; fi++) {
        const nose   = lms[fi][NOSE_TIP];
        const nosePx = { x: nose.x * canvasW, y: nose.y * canvasH };
        const dist   = Math.hypot(nosePx.x - cx, nosePx.y - cy);
        // Anchor if nose is within 2× the zone's half-width
        if (dist < Math.max(rW, rH) * 2.5) {
          zone._faceAnchored = true;
          zone._faceIdx      = fi;
          zone._offX         = (cx - nosePx.x) / canvasW;  // normalized
          zone._offY         = (cy - nosePx.y) / canvasH;
          break;
        }
      }
    }

    this.manualZones.push(zone);
    return zone.id;
  }

  removeManualZone(id) { this.manualZones = this.manualZones.filter(z => z.id !== id); }
  clearManualZones()   { this.manualZones = []; }

  applyManualZones(ctx, video, width, height) {
    if (!this.manualZones.length) return;
    this._frameIdx++;

    // Prepare blur canvas
    this._prepareBluCanvas(video, width, height);

    for (const zone of this.manualZones) {
      // Update position from face landmarks if anchored
      if (zone._faceAnchored) {
        const lms = this.lastResults?.multiFaceLandmarks;
        if (lms?.length > zone._faceIdx) {
          const nose = lms[zone._faceIdx][NOSE_TIP];
          const tx   = nose.x * width  + zone._offX * width;
          const ty   = nose.y * height + zone._offY * height;
          // Lerp smoothly to new position
          const LERP = 0.35;
          zone._vel.cx = (tx - zone.cx) * LERP;
          zone._vel.cy = (ty - zone.cy) * LERP;
          zone.cx += zone._vel.cx;
          zone.cy += zone._vel.cy;
        } else {
          // Face lost — glide by inertia, decay
          zone.cx      += zone._vel.cx;
          zone.cy      += zone._vel.cy;
          zone._vel.cx *= 0.85;
          zone._vel.cy *= 0.85;
        }
      }
      // else: fixed position zone (no tracking)

      // Render censor effect
      const rW = zone.rW * this.maskScaleX;
      const rH = zone.rH * this.maskScaleY;
      const bx = Math.max(0, Math.round(zone.cx - rW));
      const by = Math.max(0, Math.round(zone.cy - rH));
      const bw = Math.min(width  - bx, Math.round(rW * 2));
      const bh = Math.min(height - by, Math.round(rH * 2));
      if (bw <= 0 || bh <= 0) continue;

      ctx.save();
      ctx.globalAlpha = (zone.opacity ?? this.censorOpacity) / 100;
      this._drawCensorEffect(ctx, zone.mode, zone.cx, zone.cy, rW, rH, bx, by, bw, bh, width, height, 'rect');
      ctx.restore();
    }
  }

  // ── Setters ───────────────────────────────────────────────────────────────
  setBlurRadius(r)    { this.blurRadius    = Math.max(1, Math.min(r, 80)); }
  setMaskExpand(e)    { this.maskExpand    = Math.max(0, Math.min(e, 400)); }
  setCensorOpacity(v) { this.censorOpacity = Math.max(0, Math.min(v, 100)); }
  setMaskScaleX(v)    { this.maskScaleX   = Math.max(0.3, Math.min(v, 6)); }
  setMaskScaleY(v)    { this.maskScaleY   = Math.max(0.3, Math.min(v, 6)); }
  setBgBlurRadius(r)  { this.bgBlurRadius  = Math.max(4, Math.min(r, 60)); }
  setBgBlurMode(m)    { this.bgBlurMode = m; }
  setCensorTarget(t)  {
    this.censorTarget = t;
    this._smoothBbox  = null;  // reset so it re-lerps from new target shape
  }
  setActive(a) { this.isActive = a; if (!a) this.lastResults = null; }

  get faceCount() { return this.lastResults?.multiFaceLandmarks?.length ?? 0; }
  getEyeCenters(fi = 0) {
    const lm = this.lastResults?.multiFaceLandmarks?.[fi];
    if (!lm) return null;
    return { left: lm[468] || lm[159], right: lm[473] || lm[386] };
  }
  async setMaxFaces(n) { if (this.faceMesh) this.faceMesh.setOptions({ maxNumFaces: n }); }
  destroy() { this.faceMesh?.close(); this.faceMesh = null; this.isInitialized = false; }
}
