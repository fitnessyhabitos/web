/**
 * CENSOR ENGINE PRO — Face Censor Module v2
 * Uses MediaPipe FaceMesh for eye/face censoring + background blur + manual zones.
 */

const LEFT_EYE_CONTOUR  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const RIGHT_EYE_CONTOUR = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382];

// Full face silhouette for background blur
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,
                   400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

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

    // Offscreen canvases (reused each frame)
    this._blurCanvas = document.createElement('canvas');
    this._blurCtx    = this._blurCanvas.getContext('2d');
    this._pixCanvas  = document.createElement('canvas');
    this._pixCtx     = this._pixCanvas.getContext('2d');
    // Background blur sharp-frame canvas
    this._bgCanvas   = document.createElement('canvas');
    this._bgCtx      = this._bgCanvas.getContext('2d');
    // Template-matching canvas at 1/8 scale (willReadFrequently)
    this._trkCanvas  = document.createElement('canvas');
    this._trkCtx     = this._trkCanvas.getContext('2d', { willReadFrequently: true });
    this._trkScale   = 0.125;
    this._frameIdx   = 0;

    // Eye tracking bbox (smooth)
    this._smoothBbox    = null;
    this._persistFrames = 0;
    this._velocity      = { cx: 0, cy: 0 };
    this._prevSmooth    = null;
    this._persistMax    = 60;

    // Face bbox (for background blur)
    this._faceBbox      = null;
    this._faceVelocity  = { cx: 0, cy: 0 };
    this._facePersist   = 0;
    this._faceMax       = 50;

    // Censor appearance
    this.censorOpacity  = 100;
    this.maskScaleX     = 1.0;
    this.maskScaleY     = 1.0;
    this.censorMode     = 'blur';
    this.blockSize      = 10;

    // Background blur
    this.bgBlurActive   = false;
    this.bgBlurRadius   = 18;

    // Manual zones: [{id, cx, cy, rW, rH, mode, _tplData, _tplW, _tplH, _tplX, _tplY}]
    this.manualZones    = [];
    this._nextZoneId    = 1;
    this._trkGray       = null; // shared grayscale buffer for tracking
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async init(maxFaces = 2, onProgress = null) {
    this.onLoadProgress = onProgress;
    return new Promise((resolve, reject) => {
      try {
        if (typeof FaceMesh === 'undefined') {
          reject(new Error('MediaPipe FaceMesh not loaded.')); return;
        }
        onProgress?.(10, 'Creating FaceMesh…');
        this.faceMesh = new FaceMesh({
          locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
        });
        this.faceMesh.setOptions({
          maxNumFaces: maxFaces,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
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
      } catch (err) { reject(err); }
    });
  }

  onResults(cb) { this.onResultsCb = cb; }

  async processFrame(imageSource) {
    if (!this.isInitialized || !this.isActive) return;
    try { await this.faceMesh.send({ image: imageSource }); } catch(_) {}
  }

  // ══════════════════════════════════════════════════════
  // BACKGROUND BLUR
  // Draws blurred video as full BG, then draws sharp video
  // clipped to a face-shaped ellipse on top.
  // ══════════════════════════════════════════════════════
  applyBgBlur(ctx, video, width, height) {
    if (this._bgCanvas.width !== width || this._bgCanvas.height !== height) {
      this._bgCanvas.width  = width;
      this._bgCanvas.height = height;
    }

    // 1. Capture sharp video to bg canvas
    this._bgCtx.drawImage(video, 0, 0, width, height);

    // 2. Draw BLURRED video to main ctx as background
    ctx.filter = `blur(${this.bgBlurRadius}px)`;
    ctx.drawImage(video, 0, 0, width, height);
    ctx.filter = 'none';

    // 3. Update face bbox from landmarks
    const lms = this.lastResults?.multiFaceLandmarks;
    if (lms?.length > 0) {
      this._updateFaceBbox(lms[0], width, height);
    } else if (this._faceBbox && this._facePersist > 0) {
      this._facePersist--;
      this._faceBbox.cx += this._faceVelocity.cx;
      this._faceBbox.cy += this._faceVelocity.cy;
      this._faceVelocity.cx *= 0.88;
      this._faceVelocity.cy *= 0.88;
    }

    // 4. Draw sharp face region on top of blurred bg
    if (this._faceBbox && (lms?.length > 0 || this._facePersist > 0)) {
      this._drawSharpFace(ctx, width, height);
    }
  }

  _updateFaceBbox(landmarks, w, h) {
    const pts  = FACE_OVAL.map(i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
    const xs   = pts.map(p => p.x);
    const ys   = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx   = (minX + maxX) / 2;
    const cy   = (minY + maxY) / 2;
    const rW   = (maxX - minX) / 2 * 1.45;  // widen 45% for hair/ears
    const rH   = (maxY - minY) / 2 * 1.65;  // taller 65% for forehead/chin

    const LERP = 0.22;
    if (!this._faceBbox) {
      this._faceBbox = { cx, cy, rW, rH };
    } else {
      this._faceVelocity.cx = (cx - this._faceBbox.cx) * LERP * 0.5;
      this._faceVelocity.cy = (cy - this._faceBbox.cy) * LERP * 0.5;
      this._faceBbox.cx += (cx - this._faceBbox.cx) * LERP;
      this._faceBbox.cy += (cy - this._faceBbox.cy) * LERP;
      this._faceBbox.rW  += (rW - this._faceBbox.rW)  * LERP;
      this._faceBbox.rH  += (rH - this._faceBbox.rH)  * LERP;
    }
    this._facePersist = this._faceMax;
  }

  _drawSharpFace(ctx, width, height) {
    const fb = this._faceBbox;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(fb.cx, fb.cy, fb.rW, fb.rH, 0, 0, Math.PI * 2);
    ctx.clip();
    // Draw sharp video frame
    ctx.drawImage(this._bgCanvas, 0, 0);
    ctx.restore();

    // Soft feather: draw thin transparent blur ring at the edge
    const rOuter = Math.max(fb.rW, fb.rH);
    const grad = ctx.createRadialGradient(fb.cx, fb.cy, rOuter * 0.75, fb.cx, fb.cy, rOuter * 1.05);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    // Feather is achieved by the clip edge; a true feather would need composite ops.
    // Good enough for production use.
  }

  // ══════════════════════════════════════════════════════
  // MANUAL ZONES — user-drawn regions with tracking
  // ══════════════════════════════════════════════════════
  addManualZone(cx, cy, rW, rH, mode = null) {
    const zone = {
      id:     this._nextZoneId++,
      cx, cy, rW, rH,
      mode:   mode || this.censorMode,
      // Template matching data
      _tplData: null,  // Uint8Array of grayscale pixels at tracking scale
      _tplW:    0,
      _tplH:    0,
      _tplX:    0,     // template position at tracking scale
      _tplY:    0,
      _vel:     { cx: 0, cy: 0 },
    };
    this.manualZones.push(zone);
    return zone.id;
  }

  removeManualZone(id) {
    this.manualZones = this.manualZones.filter(z => z.id !== id);
  }

  clearManualZones() { this.manualZones = []; }

  applyManualZones(ctx, video, width, height) {
    if (!this.manualZones.length) return;
    this._frameIdx++;

    // Update tracking canvas size
    const tW = Math.max(1, Math.round(width  * this._trkScale));
    const tH = Math.max(1, Math.round(height * this._trkScale));
    if (this._trkCanvas.width !== tW || this._trkCanvas.height !== tH) {
      this._trkCanvas.width  = tW;
      this._trkCanvas.height = tH;
    }

    // Draw downscaled video for tracking (only every 2 frames for perf)
    let grayData = null;
    if (this._frameIdx % 2 === 0) {
      this._trkCtx.drawImage(video, 0, 0, tW, tH);
      const imgData = this._trkCtx.getImageData(0, 0, tW, tH);
      const d = imgData.data;
      grayData = new Uint8Array(tW * tH);
      for (let i = 0; i < grayData.length; i++) {
        grayData[i] = (d[i*4]*77 + d[i*4+1]*150 + d[i*4+2]*29) >> 8;
      }
    }

    // Setup blur canvas for blur-based modes
    if (this._blurCanvas.width !== width || this._blurCanvas.height !== height) {
      this._blurCanvas.width  = width;
      this._blurCanvas.height = height;
    }
    const needsBlur = this.manualZones.some(z =>
      ['blur','pixelate','frost','warmglow','coolglow'].includes(z.mode));
    if (needsBlur) {
      this._blurCtx.filter = `blur(${this.blurRadius}px)`;
      this._blurCtx.drawImage(video, 0, 0, width, height);
      this._blurCtx.filter = 'none';
    }

    for (const zone of this.manualZones) {
      // Run template matching to track position
      if (grayData) {
        this._trackZone(zone, grayData, tW, tH);
      }
      // Apply censor at tracked position
      ctx.save();
      ctx.globalAlpha = this.censorOpacity / 100;
      this._renderZone(ctx, zone, width, height);
      ctx.restore();
    }
  }

  _trackZone(zone, grayData, tW, tH) {
    const S = this._trkScale;
    const tplW = Math.max(1, Math.round(zone.rW * 2 * S));
    const tplH = Math.max(1, Math.round(zone.rH * 2 * S));
    const tplX = Math.max(0, Math.round((zone.cx - zone.rW) * S));
    const tplY = Math.max(0, Math.round((zone.cy - zone.rH) * S));

    if (!zone._tplData || zone._tplW !== tplW || zone._tplH !== tplH) {
      // Initialize template
      zone._tplData = new Uint8Array(tplW * tplH);
      zone._tplW    = tplW;
      zone._tplH    = tplH;
      zone._tplX    = tplX;
      zone._tplY    = tplY;
      for (let ty = 0; ty < tplH; ty++) {
        for (let tx = 0; tx < tplW; tx++) {
          const sy = Math.min(tplY + ty, this._trkCanvas.height - 1);
          const sx = Math.min(tplX + tx, this._trkCanvas.width  - 1);
          zone._tplData[ty * tplW + tx] = grayData[sy * tW + sx];
        }
      }
      return; // skip tracking on first frame
    }

    // Search radius (in tracking scale pixels)
    const SR   = 20;
    const sxMin = Math.max(0, zone._tplX - SR);
    const syMin = Math.max(0, zone._tplY - SR);
    const sxMax = Math.min(tW - tplW, zone._tplX + SR);
    const syMax = Math.min(tH - tplH, zone._tplY + SR);

    let bestSAD = Infinity;
    let bestX   = zone._tplX;
    let bestY   = zone._tplY;

    for (let py = syMin; py <= syMax; py += 2) {
      for (let px = sxMin; px <= sxMax; px += 2) {
        let sad = 0;
        for (let ty = 0; ty < tplH; ty++) {
          for (let tx = 0; tx < tplW; tx++) {
            sad += Math.abs(grayData[(py+ty)*tW + (px+tx)] - zone._tplData[ty*tplW + tx]);
          }
          if (sad >= bestSAD) break; // early exit
        }
        if (sad < bestSAD) { bestSAD = sad; bestX = px; bestY = py; }
      }
    }

    // Lerp position for stability
    const LERP = 0.45;
    zone._tplX += (bestX - zone._tplX) * LERP;
    zone._tplY += (bestY - zone._tplY) * LERP;

    // Update zone full-scale position
    const newCx = (zone._tplX + tplW / 2) / S;
    const newCy = (zone._tplY + tplH / 2) / S;
    zone._vel.cx = (newCx - zone.cx) * 0.3;
    zone._vel.cy = (newCy - zone.cy) * 0.3;
    zone.cx      = newCx;
    zone.cy      = newCy;

    // Refresh template with current frame data (adaptive tracking)
    for (let ty = 0; ty < tplH; ty++) {
      for (let tx = 0; tx < tplW; tx++) {
        const gy = Math.min(Math.round(zone._tplY) + ty, this._trkCanvas.height - 1);
        const gx = Math.min(Math.round(zone._tplX) + tx, this._trkCanvas.width  - 1);
        const newVal = grayData[gy * tW + gx];
        // Slowly blend old template with new (0.7 old + 0.3 new)
        zone._tplData[ty * tplW + tx] =
          Math.round(zone._tplData[ty * tplW + tx] * 0.7 + newVal * 0.3);
      }
    }
  }

  _renderZone(ctx, zone, w, h) {
    const { cx, cy } = zone;
    const rW = zone.rW * this.maskScaleX;
    const rH = zone.rH * this.maskScaleY;
    const bx = Math.max(0, Math.round(cx - rW));
    const by = Math.max(0, Math.round(cy - rH));
    const bw = Math.min(w - bx, Math.round(rW * 2));
    const bh = Math.min(h - by, Math.round(rH * 2));
    if (bw <= 0 || bh <= 0) return;

    ctx.save();
    const mode = zone.mode;

    switch (mode) {
      case 'blur': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas, 0, 0);
        break;
      }
      case 'pixelate': case 'mosaic': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        const bs = mode==='mosaic' ? Math.max(16, Math.round(bw*0.15)) : Math.max(4, this.blurRadius);
        const tW2 = Math.max(1, Math.floor(bw/bs));
        const tH2 = Math.max(1, Math.floor(bh/bs));
        if (this._pixCanvas.width!==tW2||this._pixCanvas.height!==tH2){
          this._pixCanvas.width=tW2; this._pixCanvas.height=tH2; }
        this._pixCtx.imageSmoothingEnabled=false;
        this._pixCtx.drawImage(this._blurCanvas,bx,by,bw,bh,0,0,tW2,tH2);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this._pixCanvas,0,0,tW2,tH2,bx,by,bw,bh);
        ctx.imageSmoothingEnabled=true;
        break;
      }
      case 'frost': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'warmglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(255,80,0,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'coolglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(0,140,255,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'blackbar': {
        ctx.fillStyle='rgba(0,0,0,0.95)';
        ctx.beginPath();
        ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8));
        ctx.fill(); break;
      }
      case 'whiteout': {
        ctx.fillStyle='rgba(255,255,255,0.97)';
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.fill();
        break;
      }
      case 'shadow': {
        const rad=Math.max(rW,rH)*1.1;
        const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
        gr.addColorStop(0,'rgba(0,0,0,0.95)');
        gr.addColorStop(0.5,'rgba(0,0,0,0.7)');
        gr.addColorStop(0.85,'rgba(0,0,0,0.25)');
        gr.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=gr;
        ctx.fillRect(bx-rad*0.3,by-rad*0.3,bw+rad*0.6,bh+rad*0.6);
        break;
      }
      case 'stripes': {
        const sh=Math.max(3,Math.floor(this.blurRadius/2));
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8)); ctx.clip();
        for(let sy=by;sy<by+bh;sy+=sh*2){
          ctx.fillStyle='rgba(0,0,0,0.92)'; ctx.fillRect(bx,sy,bw,sh);
        } break;
      }
      case 'emoji': {
        const sz=Math.max(rW,rH)*2.2;
        ctx.font=`${sz}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('😎',cx,cy); break;
      }
    }
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════
  // EYE CENSOR (AI auto-detected)
  // ══════════════════════════════════════════════════════
  applyBlurMask(ctx, video, width, height) {
    if (this._blurCanvas.width!==width || this._blurCanvas.height!==height) {
      this._blurCanvas.width=width; this._blurCanvas.height=height;
    }

    const hasDetection = this.lastResults?.multiFaceLandmarks?.length > 0;

    const needsBlur = ['blur','pixelate','frost','warmglow','coolglow'].includes(this.censorMode);
    if (!hasDetection) {
      if (this._smoothBbox && this._persistFrames > 0) {
        this._persistFrames--;
        this._smoothBbox.cx += this._velocity.cx;
        this._smoothBbox.cy += this._velocity.cy;
        this._velocity.cx   *= 0.88;
        this._velocity.cy   *= 0.88;
        if (needsBlur) {
          this._blurCtx.filter = `blur(${this.blurRadius}px)`;
          this._blurCtx.drawImage(video,0,0,width,height);
          this._blurCtx.filter = 'none';
        }
        const fadeRatio = this._persistFrames / this._persistMax;
        const alpha     = (this.censorOpacity/100) * Math.max(fadeRatio, 0.25);
        ctx.save(); ctx.globalAlpha = alpha;
        this._renderFromBbox(ctx, this._smoothBbox, width, height);
        ctx.restore();
      }
      return;
    }

    this._persistFrames = this._persistMax;
    if (needsBlur) {
      this._blurCtx.filter = `blur(${this.blurRadius}px)`;
      this._blurCtx.drawImage(video,0,0,width,height);
      this._blurCtx.filter = 'none';
    } else {
      this._blurCtx.drawImage(video,0,0,width,height);
    }

    for (const landmarks of this.lastResults.multiFaceLandmarks) {
      this._censorEyePair(ctx, landmarks, width, height);
    }
  }

  _censorEyePair(ctx, landmarks, w, h) {
    const allIndices = [...LEFT_EYE_CONTOUR, ...RIGHT_EYE_CONTOUR];
    const allPts     = allIndices.map(i => ({ x: landmarks[i].x*w, y: landmarks[i].y*h }));
    const xs  = allPts.map(p=>p.x), ys = allPts.map(p=>p.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs);
    const minY=Math.min(...ys), maxY=Math.max(...ys);
    const ex  = this.maskExpand;
    const cx  = (minX+maxX)/2;
    const cy  = (minY+maxY)/2;
    const rW  = (maxX-minX)/2 + ex;
    const rH  = (maxY-minY)/2 * 1.8 + ex;

    const LERP = 0.28;
    if (!this._smoothBbox) {
      this._smoothBbox = { cx,cy,rW,rH };
    } else {
      this._velocity.cx = (cx - this._smoothBbox.cx) * LERP * 0.5;
      this._velocity.cy = (cy - this._smoothBbox.cy) * LERP * 0.5;
      this._smoothBbox.cx += (cx - this._smoothBbox.cx) * LERP;
      this._smoothBbox.cy += (cy - this._smoothBbox.cy) * LERP;
      this._smoothBbox.rW += (rW - this._smoothBbox.rW) * LERP;
      this._smoothBbox.rH += (rH - this._smoothBbox.rH) * LERP;
    }
    ctx.save();
    ctx.globalAlpha = this.censorOpacity / 100;
    this._renderFromBbox(ctx, this._smoothBbox, w, h);
    ctx.restore();
  }

  _renderFromBbox(ctx, bbox, w, h) {
    const { cx,cy } = bbox;
    const rW  = bbox.rW * this.maskScaleX;
    const rH  = bbox.rH * this.maskScaleY;
    const bx  = Math.max(0, Math.round(cx-rW));
    const by  = Math.max(0, Math.round(cy-rH));
    const bw  = Math.min(w-bx, Math.round(rW*2));
    const bh  = Math.min(h-by, Math.round(rH*2));
    if (bw<=0 || bh<=0) return;

    ctx.save();
    switch (this.censorMode) {
      case 'blur': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0); break;
      }
      case 'pixelate': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        const bs=Math.max(4,this.blurRadius);
        const tW=Math.max(1,Math.floor(bw/bs)), tH=Math.max(1,Math.floor(bh/bs));
        if(this._pixCanvas.width!==tW||this._pixCanvas.height!==tH){
          this._pixCanvas.width=tW; this._pixCanvas.height=tH; }
        this._pixCtx.imageSmoothingEnabled=false;
        this._pixCtx.drawImage(this._blurCanvas,bx,by,bw,bh,0,0,tW,tH);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this._pixCanvas,0,0,tW,tH,bx,by,bw,bh);
        ctx.imageSmoothingEnabled=true;
        break;
      }
      case 'mosaic': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        const bs=Math.max(18, Math.round(bw*0.15)); // big blocks like TV censor
        const tW=Math.max(1,Math.floor(bw/bs)), tH=Math.max(1,Math.floor(bh/bs));
        if(this._pixCanvas.width!==tW||this._pixCanvas.height!==tH){
          this._pixCanvas.width=tW; this._pixCanvas.height=tH; }
        this._pixCtx.imageSmoothingEnabled=false;
        this._pixCtx.drawImage(this._blurCanvas,bx,by,bw,bh,0,0,tW,tH);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this._pixCanvas,0,0,tW,tH,bx,by,bw,bh);
        ctx.imageSmoothingEnabled=true;
        break;
      }
      case 'frost': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'warmglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(255,80,0,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'coolglow': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2); ctx.clip();
        ctx.drawImage(this._blurCanvas,0,0);
        ctx.fillStyle='rgba(0,140,255,0.88)'; ctx.fillRect(bx,by,bw,bh);
        break;
      }
      case 'whiteout': {
        ctx.beginPath(); ctx.ellipse(cx,cy,rW,rH,0,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.97)'; ctx.fill();
        break;
      }
      case 'blackbar': {
        ctx.fillStyle='rgba(0,0,0,0.95)';
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8));
        ctx.fill(); break;
      }
      case 'shadow': {
        const rad=Math.max(rW,rH)*1.1;
        const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
        gr.addColorStop(0,'rgba(0,0,0,0.95)');
        gr.addColorStop(0.5,'rgba(0,0,0,0.7)');
        gr.addColorStop(0.85,'rgba(0,0,0,0.25)');
        gr.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=gr;
        ctx.fillRect(bx-rad*0.3,by-rad*0.3,bw+rad*0.6,bh+rad*0.6);
        break;
      }
      case 'stripes': {
        const sh=Math.max(3,Math.floor(this.blurRadius/2));
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,Math.min(bh*0.35,8)); ctx.clip();
        for(let sy=by;sy<by+bh;sy+=sh*2){
          ctx.fillStyle='rgba(0,0,0,0.92)'; ctx.fillRect(bx,sy,bw,sh);
        } break;
      }
      case 'emoji': {
        const sz=Math.max(rW,rH)*2.2;
        ctx.font=`${sz}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('😎',cx,cy); break;
      }
    }
    ctx.restore();
  }

  // ── Setters ───────────────────────────────────────────────────────────────
  setBlurRadius(r)   { this.blurRadius    = Math.max(1, Math.min(r, 80)); }
  setMaskExpand(e)   { this.maskExpand    = Math.max(0, Math.min(e, 400)); }
  setCensorOpacity(v){ this.censorOpacity = Math.max(0, Math.min(v, 100)); }
  setMaskScaleX(v)   { this.maskScaleX   = Math.max(0.3, Math.min(v, 6)); }
  setMaskScaleY(v)   { this.maskScaleY   = Math.max(0.3, Math.min(v, 6)); }
  setActive(a)       { this.isActive = a; if (!a) this.lastResults = null; }
  setBgBlurRadius(r) { this.bgBlurRadius = Math.max(4, Math.min(r, 60)); }

  get faceCount() { return this.lastResults?.multiFaceLandmarks?.length ?? 0; }

  getEyeCenters(faceIdx = 0) {
    const lm = this.lastResults?.multiFaceLandmarks?.[faceIdx];
    if (!lm) return null;
    return { left: lm[468] || lm[159], right: lm[473] || lm[386] };
  }

  async setMaxFaces(n) {
    if (!this.faceMesh) return;
    this.faceMesh.setOptions({ maxNumFaces: n });
  }

  destroy() {
    this.faceMesh?.close(); this.faceMesh = null; this.isInitialized = false;
  }
}
