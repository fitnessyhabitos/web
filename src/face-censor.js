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
    if (this._bgCanvas.width !== width || this._bgCanvas.height !== height) {
      this._bgCanvas.width = width; this._bgCanvas.height = height;
    }
    // Capture sharp frame
    this._bgCtx.drawImage(video, 0, 0, width, height);

    // Draw blurred background to main ctx
    const scale = Math.max(0.03, 1 / (1 + this.bgBlurRadius * 0.18));
    const sw = Math.max(4, Math.round(width * scale));
    const sh = Math.max(4, Math.round(height * scale));
    if (this._smallCanvas.width !== sw || this._smallCanvas.height !== sh) {
      this._smallCanvas.width = sw; this._smallCanvas.height = sh;
    }
    this._smallCtx.drawImage(video, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._smallCanvas, 0, 0, sw, sh, 0, 0, width, height);

    // Update face bbox
    const lms = this.lastResults?.multiFaceLandmarks;
    if (lms?.length > 0) {
      this._updateFaceBbox(lms[0], width, height);
    } else if (this._faceBbox && this._facePersist > 0) {
      this._facePersist--;
      this._faceBbox.cx += this._faceVelocity.cx; this._faceVelocity.cx *= 0.88;
      this._faceBbox.cy += this._faceVelocity.cy; this._faceVelocity.cy *= 0.88;
    }
    // Draw sharp face on top
    if (this._faceBbox && (lms?.length > 0 || this._facePersist > 0)) {
      const fb = this._faceBbox;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(fb.cx, fb.cy, fb.rW, fb.rH, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this._bgCanvas, 0, 0);
      ctx.restore();
    }
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
  _drawCensorEffect(ctx, mode, cx, cy, rW, rH, bx, by, bw, bh, W, H) {
    ctx.save();
    switch (mode) {
      case 'blur': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        break;
      }
      case 'pixelate': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
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
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
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
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        ctx.fillStyle='rgba(220,235,255,0.80)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'warmglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0, W, H);
        ctx.fillStyle='rgba(255,60,0,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'coolglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
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
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2);
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
  addManualZone(cx, cy, rW, rH, mode, canvasW, canvasH) {
    const zone = {
      id:    this._nextZoneId++,
      cx, cy, rW, rH,
      mode:  mode || this.censorMode,
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
      ctx.globalAlpha = this.censorOpacity / 100;
      this._drawCensorEffect(ctx, zone.mode, zone.cx, zone.cy, rW, rH, bx, by, bw, bh, width, height);
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
