/**
 * CENSOR ENGINE PRO — Main Application
 * Orchestrates: FaceCensor + WebGLEffects + Timeline + AudioMixer + Exporter
 */

import { FaceCensorEngine }   from './face-censor.js';
import { WebGLEffectsEngine } from './webgl-effects.js';
import { Timeline }           from './timeline.js';
import { AudioMixer }         from './audio-mixer.js';
import { VideoExporter }      from './exporter.js';
import { ZenAudioEngine }    from './zen-audio.js';

// ─── DOM References ──────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const splashScreen       = $('#splash-screen');
const progressFill       = $('#splash-progress-fill');
const progressLabel      = $('#splash-progress-label');
const app                = $('#app');

const videoEl            = $('#video-element');
const compositeCanvas    = $('#composite-canvas');
const displayCanvas      = $('#display-canvas');

const dropOverlay        = $('#drop-overlay');
const canvasWrapper      = $('#canvas-wrapper');

const btnPlayPause       = $('#btn-play-pause');
const iconPlay           = $('#icon-play');
const iconPause          = $('#icon-pause');
const btnPreviewToggle   = $('#btn-preview-toggle');
const timeDisplay        = $('#time-display');
const headerFilename     = $('#header-filename');
const fpsCounter         = $('#fps-counter');
const btnExport          = $('#btn-export');
const btnFullscreen      = $('#btn-fullscreen');

const exportModal        = $('#export-modal');
const btnCloseExport     = $('#btn-close-export');
const btnCancelExport    = $('#btn-cancel-export');
const btnStartExport     = $('#btn-start-export');
const exportResolution   = $('#export-resolution');
const exportFormat       = $('#export-format');
const exportBitrate      = $('#export-bitrate');
const exportProgressArea = $('#export-progress-area');
const exportProgressFill = $('#export-progress-fill');
const exportProgressLabel= $('#export-progress-label');

const tlCanvas           = $('#timeline-canvas');
const tlRuler            = $('#tl-ruler');
const tlPlayhead         = $('#tl-playhead');
const tlScrollArea       = $('#tl-scroll-area');
const tlZoomIn           = $('#tl-zoom-in');
const tlZoomOut          = $('#tl-zoom-out');
const tlZoomLabel        = $('#tl-zoom-label');

// Tool buttons & panels
const toolBtns           = document.querySelectorAll('.tool-btn');
const panelUpload        = $('#panel-upload');
const panelCensor        = $('#panel-censor');
const panelEffects       = $('#panel-effects');
const panelColor         = $('#panel-color');
const panelText          = $('#panel-text');
const panelMusic         = $('#panel-music');
const panelTrim          = $('#panel-trim');
const panelStickers      = $('#panel-stickers');
const panelFrames        = $('#panel-frames');

// Trim controls
const btnSplit           = $('#btn-split');
const btnDeleteSegment   = $('#btn-delete-segment');
const btnResetTrim       = $('#btn-reset-trim');
const trimStart          = $('#trim-start');
const trimStartVal       = $('#trim-start-val');
const trimEnd            = $('#trim-end');
const trimEndVal         = $('#trim-end-val');
const segmentsList       = $('#segments-list');

// Sticker controls
const stickersGrid       = document.querySelectorAll('.sticker-pick');
const stickerSize        = $('#sticker-size');
const stickerSizeVal     = $('#sticker-size-val');
const stickerOpacity     = $('#sticker-opacity');
const stickerOpacityVal  = $('#sticker-opacity-val');
const selectedStickerLabel = $('#selected-sticker-label');
const stickersPlacedList = $('#stickers-placed-list');
const btnClearStickers   = $('#btn-clear-stickers');

// Frame controls
const framePresetBtns    = document.querySelectorAll('.frame-preset-btn');
const frameOpacity       = $('#frame-opacity');
const frameOpacityVal    = $('#frame-opacity-val');
const activeFramesList   = $('#active-frames-list');
const btnClearFrames     = $('#btn-clear-frames');

// Watermark controls
const wmToggle          = $('#wm-toggle');
const wmTextInput       = $('#wm-text');
const wmPosBtns         = document.querySelectorAll('.wm-pos-btn');
const wmStyleBtns       = document.querySelectorAll('.wm-style-btn');
const wmColor           = $('#wm-color');
const wmSize            = $('#wm-size');
const wmSizeVal         = $('#wm-size-val');
const wmOpacity         = $('#wm-opacity');
const wmOpacityVal      = $('#wm-opacity-val');
const btnWmSavePreset   = $('#btn-wm-save-preset');
const wmPresetsList     = $('#wm-presets-list');

// Seek bar
const seekBar             = $('#seek-bar');
let   _seekDragging       = false;

// Sound controls
const soundTiles          = document.querySelectorAll('.sound-tile[data-sound]');
const btnStopSound        = $('#btn-stop-sound');
const soundVolume         = $('#sound-volume');
const soundVolumeVal      = $('#sound-volume-val');

// Censor controls
const toggleCensor       = $('#toggle-censor');
const blurRadiusSlider   = $('#blur-radius');
const blurRadiusVal      = $('#blur-radius-val');
const maskExpandSlider   = $('#mask-expand');
const maskExpandVal      = $('#mask-expand-val');
const censorOpacitySlider = $('#censor-opacity');
const censorOpacityVal    = $('#censor-opacity-val');
const maskScaleX          = $('#mask-scale-x');
const maskScaleXVal       = $('#mask-scale-x-val');
const maskScaleY          = $('#mask-scale-y');
const maskScaleYVal       = $('#mask-scale-y-val');
const maxFacesSelect     = $('#max-faces');
const censorStatus       = $('#censor-status');
const censorStatusDot    = censorStatus.querySelector('.status-dot');
const censorStatusText   = censorStatus.querySelector('.status-text');
const faceCountDisplay   = $('#face-count-display');
const censorControls     = $('#censor-controls');
const censorModeGrid     = document.querySelectorAll('.censor-mode-btn');
const censorRadiusLabel  = $('#censor-radius-label');

// Effects controls
const effectBtns         = document.querySelectorAll('.effect-btn');
const effectIntensity    = $('#effect-intensity');
const effectIntensityVal = $('#effect-intensity-val');
const flareX             = $('#flare-x');
const flareXVal          = $('#flare-x-val');
const flareY             = $('#flare-y');
const flareYVal          = $('#flare-y-val');
const toggleFlareTrack   = $('#toggle-flare-track');
const flareTrackHint     = $('#flare-track-hint');

// Color correction
const ccBrightness       = $('#cc-brightness');
const ccContrast         = $('#cc-contrast');
const ccSaturation       = $('#cc-saturation');
const ccExposure         = $('#cc-exposure');
const ccVignette         = $('#cc-vignette');
const ccSharpen          = $('#cc-sharpen');
const btnResetColor      = $('#btn-reset-color');
const filterPresetsScroll  = $('#filter-presets-scroll');

// Text controls
const textContent        = $('#text-content');
const textSize           = $('#text-size');
const textSizeVal        = $('#text-size-val');
const textColor          = $('#text-color');
const textStrokeColor    = $('#text-stroke-color');
const textX              = $('#text-x');
const textXVal           = $('#text-x-val');
const textY              = $('#text-y');
const textYVal           = $('#text-y-val');
const textOpacity        = $('#text-opacity');
const textOpacityVal     = $('#text-opacity-val');
const btnAddText         = $('#btn-add-text');

// Audio
const volVideo           = $('#vol-video');
const volVideoVal        = $('#vol-video-val');
const volMusic           = $('#vol-music');
const volMusicVal        = $('#vol-music-val');
const musicStart         = $('#music-start');
const musicStartVal      = $('#music-start-val');
const musicFade          = $('#music-fade');
const musicFadeVal       = $('#music-fade-val');
const musicInfo          = $('#music-info');

// Aspect ratio
const arBtns             = document.querySelectorAll('.ar-btn');

// Upload inputs
const inputVideo         = $('#input-video');
const inputMusic         = $('#input-music');
const inputMusic2        = $('#input-music2');

// ─── Module Instances ────────────────────────────────────────────────────────
const faceCensor  = new FaceCensorEngine();
const webglFx     = new WebGLEffectsEngine(displayCanvas);
const zenAudio    = new ZenAudioEngine();
const audioMixer  = new AudioMixer();
const exporter    = new VideoExporter();
let   timeline    = null;

// ─── App State ───────────────────────────────────────────────────────────────
const state = {
  videoLoaded:      false,
  playing:          false,
  currentTool:      'upload',
  aspectRatio:      '9:16',   // '9:16' | '16:9' | '1:1'
  censorActive:     false,
  currentEffect:    'none',
  faceMeshReady:    false,
  audioInitialized: false,
  textLayers:       [],       // [{id, text, x, y, size, color, stroke, opacity}]
  segments:         [],       // [{id, start, end, deleted}]
  selectedSegment:  0,
  stickers:         [],       // [{id, emoji, x, y, size, opacity}]
  watermark: {
    active:   false,
    text:     '',
    pos:      'br',          // tl tc tr ml mc mr bl bc br
    style:    'shadow',      // shadow outline plain glow
    color:    '#ffffff',
    size:     32,
    opacity:  70,
  },
  selectedSticker:  null,     // emoji string currently selected for placement
  activeFrames:     [],       // [{id, type, opacity}]
  flareTrackEyes:   false,
  bgBlurActive:     false,
  drawingZone:      false,    // zone draw mode active
  zoneCounter:      0,        // for labeling
  recBlinkState:    true,
  recBlinkTimer:    0,
  frameCount:       0,
  lastFpsTime:      0,
  fps:              0,
  rafId:            null,
};

// ─── Canvas 2D composite context ─────────────────────────────────────────────
let compCtx = null;  // compositeCanvas 2D context

// ══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════
async function init() {
  setSplashProgress(5, 'Initializing WebGL…');

  try {
    webglFx.init();
  } catch (err) {
    console.error('WebGL init failed:', err);
    setSplashProgress(10, 'WebGL failed — using 2D fallback');
  }

  setSplashProgress(15, 'Setting up timeline…');
  timeline = new Timeline(tlCanvas, tlRuler, tlPlayhead, tlScrollArea);
  timeline.onSeek((t) => {
    if (state.videoLoaded) {
      videoEl.currentTime = t;
      audioMixer.onVideoSeeked(t);
    }
  });

  setSplashProgress(25, 'Loading AI models…');

  try {
    await faceCensor.init(2, (pct, label) => {
      setSplashProgress(25 + pct * 0.7, label);
    });
    state.faceMeshReady = true;
    setSplashProgress(95, 'AI ready');
  } catch (err) {
    console.warn('FaceMesh init failed:', err);
    setSplashProgress(95, 'AI unavailable (offline mode)');
    censorStatusText.textContent = 'AI model unavailable';
    censorStatusDot.classList.add('error');
  }

  // Init SelfieSegmentation in background (portrait-mode BG blur)
  faceCensor.initSelfieSegmentation().catch(e => console.warn('SelfieSeg:', e));

  // Register face results callback
  faceCensor.onResults((results) => {
    faceCountDisplay.textContent = `Faces: ${results.multiFaceLandmarks?.length ?? 0}`;
    if (results.multiFaceLandmarks?.length > 0) {
      censorStatusDot.className = 'status-dot active';
      censorStatusText.textContent = `Censoring ${results.multiFaceLandmarks.length} face(s)`;
    } else if (state.censorActive) {
      censorStatusDot.className = 'status-dot processing';
      censorStatusText.textContent = 'Scanning for faces…';
    }
  });

  setSplashProgress(100, 'Ready');
  await delay(600);

  splashScreen.classList.add('fade-out');
  setTimeout(() => {
    splashScreen.style.display = 'none';
    app.classList.remove('hidden');
  }, 650);

  bindEvents();
  // Seed default watermark presets if none exist
  if (!wmLoadPresets().length) {
    const defaults = [
      { text: '@miusuario',   pos: 'br', style: 'shadow',  color: '#ffffff', size: 28, opacity: 70 },
      { text: '© Mi Marca',  pos: 'bc', style: 'outline', color: '#ffffff', size: 24, opacity: 65 },
      { text: 'CONFIDENCIAL', pos: 'mc', style: 'glow',    color: '#ff3333', size: 48, opacity: 40 },
    ];
    wmSavePresetsToStorage(defaults);
    wmRenderPresetsList();
  }
  renderFilterPresets();
  setAspectRatio('9:16');
  showPanel('upload');
  updateToolActive('upload');
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER LOOP
// ══════════════════════════════════════════════════════════════════════════════
function startRenderLoop() {
  if (state.rafId) return;

  async function frame() {
    state.rafId = requestAnimationFrame(frame);

    if (!state.videoLoaded || videoEl.readyState < 2) return;

    const W = compositeCanvas.width;
    const H = compositeCanvas.height;

    // ── Step 1: AI processing FIRST ──────────────────────────────────────────
    const needsFaceMesh = (state.censorActive || state.bgBlurActive || state.flareTrackEyes || faceCensor.manualZones.length > 0) && state.faceMeshReady;
    if (needsFaceMesh) {
      await faceCensor.processFrame(videoEl);
    }
    // Segmentation for portrait-mode BG blur (runs independently of FaceMesh)
    if (state.bgBlurActive) {
      faceCensor.processSegmentation(videoEl).catch(() => {});
    }

    // ── Step 2: Draw background (blurred or normal) ──
    // bgBlur works regardless of faceMeshReady — without face data it blurs everything,
    // with face data (from processFrame above) it keeps the face sharp.
    compCtx.filter = webglFx.buildCSSFilter();
    if (state.bgBlurActive) {
      faceCensor.applyBgBlur(compCtx, videoEl, W, H);
    } else {
      compCtx.drawImage(videoEl, 0, 0, W, H);
    }
    compCtx.filter = 'none';

    // ── Step 3: AI censor + manual zone overlays ──
    if (state.censorActive && state.faceMeshReady) {
      faceCensor.applyBlurMask(compCtx, videoEl, W, H);
    }
    if (faceCensor.manualZones.length > 0) {
      faceCensor.applyManualZones(compCtx, videoEl, W, H);
    }

    // ── Step 2b: Flare eye tracking ──
    if (state.flareTrackEyes && state.currentEffect === 'flare') {
      const centers = faceCensor.getEyeCenters(0);
      if (centers) {
        const avgX = (centers.left.x + centers.right.x) / 2;
        const avgY = (centers.left.y + centers.right.y) / 2;
        webglFx.setFlareX(avgX);
        webglFx.setFlareY(avgY);
        if (flareX) { flareX.value = Math.round(avgX * 100); flareXVal.textContent = `${Math.round(avgX * 100)}%`; }
        if (flareY) { flareY.value = Math.round(avgY * 100); flareYVal.textContent = `${Math.round(avgY * 100)}%`; }
      }
    }

    // ── Step 3: Draw text layers, stickers, frames ──
    drawTextLayers(compCtx, W, H);
    drawStickers(compCtx, W, H);
    drawFrames(compCtx, W, H);
    drawWatermark(compCtx, W, H);

    // ── Step 3b: REC blink timer ──
    state.recBlinkTimer += 1;
    if (state.recBlinkTimer > 30) { state.recBlinkState = !state.recBlinkState; state.recBlinkTimer = 0; }

    // ── Step 4: WebGL effect pass ──
    webglFx.renderFrame(compositeCanvas);

    // ── Step 5: Vignette (if CC vignette > 0) ──
    drawVignette(W, H);

    // ── Step 6: Update timeline ──
    timeline.setTime(videoEl.currentTime);
    audioMixer.tick(videoEl.currentTime, videoEl.duration);
    updateTimeDisplay();

    // ── FPS counter ──
    state.frameCount++;
    const now = performance.now();
    if (now - state.lastFpsTime >= 1000) {
      state.fps        = Math.round(state.frameCount * 1000 / (now - state.lastFpsTime));
      fpsCounter.textContent = `${state.fps} fps`;
      state.frameCount = 0;
      state.lastFpsTime = now;
    }
  }

  state.lastFpsTime = performance.now();
  state.rafId = requestAnimationFrame(frame);
}

function stopRenderLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

// ─── Vignette pass directly on WebGL canvas via 2D overlay ──────────────────
function drawVignette(w, h) {
  const vig = parseInt(ccVignette.value) / 100;
  if (vig <= 0) return;
  // We'll draw a radial gradient vignette using a temporary canvas drawn on top
  // via an overlay canvas — we use the composite canvas for this
  const ctx = compCtx;
  const cx  = w / 2;
  const cy  = h / 2;
  const r   = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, `rgba(0,0,0,${vig.toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ─── Text layer rendering ────────────────────────────────────────────────────
function drawTextLayers(ctx, w, h) {
  for (const layer of state.textLayers) {
    const x   = (layer.x / 100) * w;
    const y   = (layer.y / 100) * h;
    const sz  = layer.size;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.font        = `bold ${sz}px 'SF Pro Display', system-ui, sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.lineWidth   = sz / 12;
    ctx.strokeStyle = layer.stroke;
    ctx.fillStyle   = layer.color;
    ctx.strokeText(layer.text, x, y);
    ctx.fillText(layer.text, x, y);
    ctx.restore();
  }
}

// ─── Sticker rendering ───────────────────────────────────────────────────────
function drawStickers(ctx, w, h) {
  for (const s of state.stickers) {
    ctx.save();
    ctx.globalAlpha = s.opacity / 100;
    ctx.font        = `${s.size}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.fillText(s.emoji, (s.x / 100) * w, (s.y / 100) * h);
    ctx.restore();
  }
}

// ─── Frame / overlay rendering ───────────────────────────────────────────────
function drawFrames(ctx, w, h) {
  const opacity = parseInt(frameOpacity?.value ?? 90) / 100;

  for (const frame of state.activeFrames) {
    ctx.save();
    ctx.globalAlpha = opacity;
    switch (frame.type) {

      case 'bars21': {
        // 2.35:1 cinematic letterbox bars
        const barH = Math.round(h * 0.115);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, barH);
        ctx.fillRect(0, h - barH, w, barH);
        break;
      }

      case 'bars169': {
        // 16:9 crop on a 9:16 canvas (pillarbox for portrait)
        if (w < h) {
          const barH = Math.round((h - w * 9/16) / 2);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, barH);
          ctx.fillRect(0, h - barH, w, barH);
        }
        break;
      }

      case 'vhs-frame': {
        // VHS UI: timecode + noise lines
        ctx.globalAlpha = opacity * 0.7;
        for (let y = 0; y < h; y += 4) {
          ctx.fillStyle = `rgba(25,249,249,${Math.random() * 0.03})`;
          ctx.fillRect(0, y, w, 1);
        }
        ctx.globalAlpha = opacity;
        ctx.font        = `bold ${Math.round(w * 0.04)}px 'SF Mono', monospace`;
        ctx.fillStyle   = 'rgba(25,249,249,0.75)';
        ctx.textAlign   = 'left';
        ctx.textBaseline= 'top';
        ctx.fillText('▶ PLAY', w * 0.04, h * 0.04);
        ctx.textAlign   = 'right';
        const d = new Date();
        ctx.fillText(
          `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`,
          w * 0.96, h * 0.04
        );
        break;
      }

      case 'neon-border': {
        const thick = Math.round(w * 0.015);
        ctx.strokeStyle = '#940a0a';
        ctx.lineWidth   = thick;
        ctx.shadowColor = '#940a0a';
        ctx.shadowBlur  = thick * 3;
        ctx.strokeRect(thick / 2, thick / 2, w - thick, h - thick);
        ctx.strokeStyle = '#19f9f9';
        ctx.lineWidth   = 1;
        ctx.shadowColor = '#19f9f9';
        ctx.shadowBlur  = 8;
        ctx.strokeRect(thick * 1.5, thick * 1.5, w - thick * 3, h - thick * 3);
        ctx.shadowBlur  = 0;
        break;
      }

      case 'film-strip': {
        const holeR = Math.round(w * 0.025);
        const edgeW = holeR * 2.5;
        ctx.fillStyle   = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, edgeW, h);
        ctx.fillRect(w - edgeW, 0, edgeW, h);
        // Film holes
        ctx.fillStyle = '#222';
        for (let y = holeR; y < h - holeR; y += holeR * 3) {
          ctx.beginPath();
          ctx.roundRect(edgeW * 0.3, y, holeR, holeR * 1.5, 2);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(w - edgeW * 0.3 - holeR, y, holeR, holeR * 1.5, 2);
          ctx.fill();
        }
        break;
      }

      case 'glow-frame': {
        const grad = ctx.createRadialGradient(w/2, h/2, h*0.2, w/2, h/2, h*0.75);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.7, 'transparent');
        grad.addColorStop(1, 'rgba(148,10,10,0.7)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'leak-orange': {
        const g = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.6);
        g.addColorStop(0, 'rgba(255,140,0,0.55)');
        g.addColorStop(0.4, 'rgba(255,80,0,0.25)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'leak-blue': {
        const g = ctx.createLinearGradient(w, h, w * 0.3, h * 0.3);
        g.addColorStop(0, 'rgba(0,100,255,0.55)');
        g.addColorStop(0.4, 'rgba(0,200,255,0.25)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'leak-rainbow': {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0,   'rgba(255,0,0,0.3)');
        g.addColorStop(0.25,'rgba(255,165,0,0.2)');
        g.addColorStop(0.5, 'transparent');
        g.addColorStop(0.75,'rgba(0,200,255,0.2)');
        g.addColorStop(1,   'rgba(150,0,255,0.3)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'rec': drawRecIndicator(ctx, w, h, 'REC');    break;
      case 'live': drawRecIndicator(ctx, w, h, 'LIVE');  break;
      case 'cam':  drawRecIndicator(ctx, w, h, '📷 CAM'); break;
    }
    ctx.restore();
  }
}

function drawRecIndicator(ctx, w, h, label) {
  const fs   = Math.round(w * 0.045);
  const pad  = fs * 0.5;
  const blink= state.recBlinkState;

  ctx.font        = `bold ${fs}px 'SF Mono', monospace`;
  ctx.textAlign   = 'left';
  ctx.textBaseline= 'top';

  const dotR  = fs * 0.35;
  const x     = w * 0.04;
  const y     = h * 0.04;

  // Background pill
  const textW = ctx.measureText(label).width;
  const pillW = dotR * 2 + pad + textW + pad * 2;
  const pillH = fs + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(x - pad, y - pad * 0.5, pillW, pillH, 6);
  ctx.fill();

  // Blinking dot
  if (blink || label === 'LIVE') {
    ctx.fillStyle   = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(x + dotR, y + fs / 2, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  // Label text
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + dotR * 2 + pad * 0.5, y);
}

// ══════════════════════════════════════════════════════════════════════════════
// COLOR FILTER PRESETS  (InShot-style)
// ══════════════════════════════════════════════════════════════════════════════
const COLOR_PRESETS = [
  { id: 'original', name: 'Original', brightness: 0,   contrast: 0,   saturation: 0,   exposure: 0,  swatch: 'linear-gradient(160deg,#7a7a7a,#3a3a3a)' },
  { id: 'hx1',     name: 'HX1',      brightness: 8,   contrast: 15,  saturation: 25,  exposure: 5,  swatch: 'linear-gradient(160deg,#d4935a,#c05030)' },
  { id: 'eg4',     name: 'EG4',      brightness: 0,   contrast: 20,  saturation: -25, exposure: 0,  swatch: 'linear-gradient(160deg,#7aaac0,#3a6080)' },
  { id: 'eg2',     name: 'EG2',      brightness: 10,  contrast: 10,  saturation: 10,  exposure: 3,  swatch: 'linear-gradient(160deg,#8ab0be,#5a8090)' },
  { id: 'xh1',     name: 'XH1',      brightness: 5,   contrast: 20,  saturation: 40,  exposure: 5,  swatch: 'linear-gradient(160deg,#e89040,#d05020)' },
  { id: 'b1',      name: 'B1',       brightness: 0,   contrast: 35,  saturation: -100,exposure: 0,  swatch: 'linear-gradient(160deg,#909090,#181818)' },
  { id: 'b2',      name: 'B2',       brightness: 10,  contrast: 25,  saturation: -90, exposure: 5,  swatch: 'linear-gradient(160deg,#a0a0a0,#383838)' },
  { id: 'fade',    name: 'Fade',     brightness: 25,  contrast: -30, saturation: -20, exposure: 0,  swatch: 'linear-gradient(160deg,#c8b8b0,#988880)' },
  { id: 'golden',  name: 'Golden',   brightness: 12,  contrast: 15,  saturation: 35,  exposure: 8,  swatch: 'linear-gradient(160deg,#f0b840,#e06810)' },
  { id: 'moody',   name: 'Moody',    brightness: -15, contrast: 30,  saturation: -30, exposure: -5, swatch: 'linear-gradient(160deg,#384860,#101820)' },
  { id: 'fresh',   name: 'Fresh',    brightness: 10,  contrast: 10,  saturation: 20,  exposure: 5,  swatch: 'linear-gradient(160deg,#60c8a8,#2888a0)' },
  { id: 'vintage', name: 'Vintage',  brightness: 0,   contrast: -15, saturation: -30, exposure: -5, swatch: 'linear-gradient(160deg,#c09060,#805030)' },
  { id: 'neon',    name: 'Neon',     brightness: 10,  contrast: 25,  saturation: 60,  exposure: 0,  swatch: 'linear-gradient(160deg,#a030e0,#d02080)' },
  { id: 'cinema',  name: 'Cinema',   brightness: -10, contrast: 25,  saturation: -15, exposure: -5, swatch: 'linear-gradient(160deg,#405060,#101820)' },
  { id: 'pastel',  name: 'Pastel',   brightness: 25,  contrast: -20, saturation: -25, exposure: 5,  swatch: 'linear-gradient(160deg,#d0c0c8,#a098b8)' },
  { id: 'drama',   name: 'Drama',    brightness: -20, contrast: 40,  saturation: 15,  exposure: -10,swatch: 'linear-gradient(160deg,#602040,#100810)' },
  // ── Skin & Tone ──────────────────────────────────────────────────────────
  { id: 'skin_warm',  name: 'Skin Warm',  brightness: 8,  contrast: 10, saturation: 20, exposure: 6,  swatch: 'linear-gradient(160deg,#e8a070,#c87040)' },
  { id: 'skin_peach', name: 'Peach',      brightness: 15, contrast: 5,  saturation: 15, exposure: 8,  swatch: 'linear-gradient(160deg,#f0b898,#e08060)' },
  { id: 'skin_bronze',name: 'Bronze',     brightness: -5, contrast: 20, saturation: 30, exposure: 5,  swatch: 'linear-gradient(160deg,#c87830,#904820)' },
  { id: 'skin_honey', name: 'Honey',      brightness: 10, contrast: 12, saturation: 28, exposure: 7,  swatch: 'linear-gradient(160deg,#f0a830,#c87018)' },
  { id: 'skin_glow',  name: 'Glow',       brightness: 22, contrast: -5, saturation: 18, exposure: 12, swatch: 'linear-gradient(160deg,#f8c8a0,#e09870)' },
  { id: 'skin_nude',  name: 'Nude',       brightness: 12, contrast: 0,  saturation: -8, exposure: 5,  swatch: 'linear-gradient(160deg,#d4b898,#b89878)' },
  { id: 'skin_cool',  name: 'Skin Cool',  brightness: 5,  contrast: 8,  saturation: -10,exposure: 3,  swatch: 'linear-gradient(160deg,#c0a8b8,#908098)' },
  { id: 'rose',       name: 'Rose',       brightness: 8,  contrast: 8,  saturation: 25, exposure: 5,  swatch: 'linear-gradient(160deg,#e87898,#c05070)' },
  { id: 'sunset',     name: 'Sunset',     brightness: 5,  contrast: 18, saturation: 40, exposure: 3,  swatch: 'linear-gradient(160deg,#f06828,#c02858)' },
  { id: 'coral',      name: 'Coral',      brightness: 10, contrast: 12, saturation: 35, exposure: 6,  swatch: 'linear-gradient(160deg,#f08860,#d05840)' },
  { id: 'velvet',     name: 'Velvet',     brightness: -8, contrast: 25, saturation: 22, exposure: 2,  swatch: 'linear-gradient(160deg,#903060,#500030)' },
  { id: 'champagne',  name: 'Champagne',  brightness: 18, contrast: -8, saturation: 12, exposure: 10, swatch: 'linear-gradient(160deg,#f0d8a0,#d0b060)' },
  // ── More Skin Tones ───────────────────────────────────────────────────────
  { id: 'skin_tan',   name: 'Tanned',     brightness: 3,  contrast: 14, saturation: 32, exposure: 4,  swatch: 'linear-gradient(160deg,#c8824a,#a05030)' },
  { id: 'skin_dark',  name: 'Dark Skin',  brightness: -5, contrast: 22, saturation: 28, exposure: 2,  swatch: 'linear-gradient(160deg,#7a4828,#4a2810)' },
  { id: 'porcelain',  name: 'Porcelain',  brightness: 22, contrast: 2,  saturation: -12, exposure: 10, swatch: 'linear-gradient(160deg,#fce8d8,#e8d0c0)' },
  { id: 'golden_hr',  name: 'Golden Hr',  brightness: 10, contrast: 18, saturation: 45, exposure: 8,  swatch: 'linear-gradient(160deg,#ffb850,#e07020)' },
  { id: 'rose_gold',  name: 'Rose Gold',  brightness: 12, contrast: 10, saturation: 30, exposure: 7,  swatch: 'linear-gradient(160deg,#f0a898,#d07868)' },
  { id: 'caramel',    name: 'Caramel',    brightness: 5,  contrast: 16, saturation: 36, exposure: 5,  swatch: 'linear-gradient(160deg,#c88848,#905828)' },
  { id: 'soft_matte', name: 'Soft Matte', brightness: 8,  contrast: -5, saturation: -5, exposure: 6,  swatch: 'linear-gradient(160deg,#d8c8c0,#b8a8a0)' },
  { id: 'vivid_skin', name: 'Vivid Skin', brightness: 10, contrast: 20, saturation: 55, exposure: 8,  swatch: 'linear-gradient(160deg,#f89060,#d05030)' },
  { id: 'olive',      name: 'Olive Glow', brightness: 5,  contrast: 12, saturation: 22, exposure: 4,  swatch: 'linear-gradient(160deg,#a09048,#706828)' },
  { id: 'blush',      name: 'Blush',      brightness: 15, contrast: 5,  saturation: 28, exposure: 8,  swatch: 'linear-gradient(160deg,#f0a0b0,#d07080)' },
];

let activePreset = 'original';

function renderFilterPresets() {
  if (!filterPresetsScroll) return;
  filterPresetsScroll.innerHTML = '';
  for (const p of COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.className = `filter-preset-btn${p.id === activePreset ? ' active' : ''}`;
    btn.dataset.preset = p.id;
    btn.innerHTML = `
      <div class="filter-swatch" style="background:${p.swatch}"></div>
      <span class="filter-name">${p.name}</span>
    `;
    btn.addEventListener('click', () => applyColorPreset(p));
    filterPresetsScroll.appendChild(btn);
  }
}

function applyColorPreset(preset) {
  activePreset = preset.id;

  // Update sliders + values
  const set = (id, valId, v) => {
    const el = document.getElementById(id);
    const vEl = document.getElementById(valId);
    if (el)  el.value = v;
    if (vEl) vEl.textContent = v;
  };

  set('cc-brightness', 'cc-brightness-val', preset.brightness);
  set('cc-contrast',   'cc-contrast-val',   preset.contrast);
  set('cc-saturation', 'cc-saturation-val', preset.saturation);
  set('cc-exposure',   'cc-exposure-val',   preset.exposure);

  // Fire change to rebuild CSS filter
  ['cc-brightness','cc-contrast','cc-saturation','cc-exposure'].forEach(id => {
    document.getElementById(id)?.dispatchEvent(new Event('input'));
  });

  // Re-render preset buttons
  renderFilterPresets();
}

// ══════════════════════════════════════════════════════════════════════════════
// WATERMARK ENGINE
// ══════════════════════════════════════════════════════════════════════════════

const WM_POSITIONS = {
  tl: { x: 4,  y: 4,  align: 'left',   baseline: 'top'    },
  tc: { x: 50, y: 4,  align: 'center', baseline: 'top'    },
  tr: { x: 96, y: 4,  align: 'right',  baseline: 'top'    },
  ml: { x: 4,  y: 50, align: 'left',   baseline: 'middle' },
  mc: { x: 50, y: 50, align: 'center', baseline: 'middle' },
  mr: { x: 96, y: 50, align: 'right',  baseline: 'middle' },
  bl: { x: 4,  y: 96, align: 'left',   baseline: 'bottom' },
  bc: { x: 50, y: 96, align: 'center', baseline: 'bottom' },
  br: { x: 96, y: 96, align: 'right',  baseline: 'bottom' },
};

function drawWatermark(ctx, w, h) {
  const wm = state.watermark;
  if (!wm.active || !wm.text.trim()) return;

  const pos  = WM_POSITIONS[wm.pos] || WM_POSITIONS.br;
  const px   = (pos.x / 100) * w;
  const py   = (pos.y / 100) * h;
  const size = wm.size;

  ctx.save();
  ctx.globalAlpha    = wm.opacity / 100;
  ctx.font           = `bold ${size}px 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign      = pos.align;
  ctx.textBaseline   = pos.baseline;

  switch (wm.style) {
    case 'shadow':
      ctx.shadowColor   = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur    = size * 0.5;
      ctx.shadowOffsetX = size * 0.06;
      ctx.shadowOffsetY = size * 0.06;
      ctx.fillStyle     = wm.color;
      ctx.fillText(wm.text, px, py);
      break;

    case 'outline':
      ctx.lineWidth   = Math.max(2, size * 0.1);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineJoin    = 'round';
      ctx.strokeText(wm.text, px, py);
      ctx.fillStyle   = wm.color;
      ctx.fillText(wm.text, px, py);
      break;

    case 'plain':
      ctx.fillStyle = wm.color;
      ctx.fillText(wm.text, px, py);
      break;

    case 'glow':
      ctx.shadowColor = wm.color;
      ctx.shadowBlur  = size * 0.8;
      ctx.fillStyle   = wm.color;
      ctx.fillText(wm.text, px, py);
      // Second pass for stronger glow
      ctx.shadowBlur  = size * 0.3;
      ctx.fillText(wm.text, px, py);
      break;
  }

  ctx.restore();
}

// ── Presets (localStorage) ──────────────────────────────────────────────────
const WM_STORAGE_KEY = 'censor_pro_wm_presets';

function wmLoadPresets() {
  try { return JSON.parse(localStorage.getItem(WM_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function wmSavePresetsToStorage(presets) {
  try { localStorage.setItem(WM_STORAGE_KEY, JSON.stringify(presets)); }
  catch {}
}

function wmRenderPresetsList() {
  if (!wmPresetsList) return;
  const presets = wmLoadPresets();
  wmPresetsList.innerHTML = '';

  if (!presets.length) {
    wmPresetsList.innerHTML = '<p style="font-size:10px;color:var(--text-muted);text-align:center;padding:8px 0">No hay presets guardados</p>';
    return;
  }

  presets.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = `wm-preset-item${state.watermark.text === p.text ? ' active' : ''}`;
    div.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="wm-preset-text">${p.text}</div>
        <div class="wm-preset-sub">${p.style} · ${p.size}px · ${p.opacity}%</div>
      </div>
      <button class="wm-preset-del" data-idx="${i}" title="Eliminar">✕</button>
    `;

    // Click to apply
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('wm-preset-del')) return;
      wmApplyPreset(p);
    });

    // Delete button
    div.querySelector('.wm-preset-del').addEventListener('click', (e) => {
      e.stopPropagation();
      const all = wmLoadPresets();
      all.splice(i, 1);
      wmSavePresetsToStorage(all);
      wmRenderPresetsList();
    });

    wmPresetsList.appendChild(div);
  });
}

function wmApplyPreset(p) {
  state.watermark = { ...state.watermark, ...p };
  // Sync UI
  if (wmTextInput)  wmTextInput.value   = p.text;
  if (wmColor)      wmColor.value       = p.color;
  if (wmSize)       { wmSize.value      = p.size;    wmSizeVal.textContent    = `${p.size}px`; }
  if (wmOpacity)    { wmOpacity.value   = p.opacity; wmOpacityVal.textContent = `${p.opacity}%`; }
  if (wmToggle)     wmToggle.checked    = state.watermark.active;
  // Position button
  wmPosBtns.forEach(b => b.classList.toggle('active', b.dataset.pos === p.pos));
  // Style button
  wmStyleBtns.forEach(b => b.classList.toggle('active', b.dataset.style === p.style));
  wmRenderPresetsList();
}

// ══════════════════════════════════════════════════════════════════════════════
// TRIM / CUT ENGINE
// ══════════════════════════════════════════════════════════════════════════════
function initSegments(duration) {
  state.segments = [{ id: 1, start: 0, end: duration, deleted: false }];
  state.selectedSegment = 0;
  renderSegmentsList();
}

function splitAtPlayhead() {
  if (!state.videoLoaded) return;
  const t = videoEl.currentTime;
  const idx = state.segments.findIndex(s => !s.deleted && t > s.start + 0.05 && t < s.end - 0.05);
  if (idx === -1) return;
  const seg = state.segments[idx];
  const nextId = Date.now();
  state.segments.splice(idx, 1,
    { id: seg.id,  start: seg.start, end: t,       deleted: false },
    { id: nextId,  start: t,         end: seg.end,  deleted: false }
  );
  state.selectedSegment = idx;
  renderSegmentsList();
  timeline.render();
}

function deleteSelectedSegment() {
  const activeSegs = state.segments.filter(s => !s.deleted);
  if (activeSegs.length <= 1) return; // keep at least one
  const t    = videoEl.currentTime;
  const idx  = state.segments.findIndex(s => !s.deleted && t >= s.start && t < s.end);
  if (idx === -1) return;
  state.segments[idx].deleted = true;
  // Jump to next valid segment
  const next = state.segments.find(s => !s.deleted && s.start >= state.segments[idx].end);
  const prev = [...state.segments].reverse().find(s => !s.deleted && s.end <= state.segments[idx].start);
  const dest = next || prev;
  if (dest) videoEl.currentTime = dest.start;
  renderSegmentsList();
}

function resetTrim() {
  if (state.videoLoaded) initSegments(videoEl.duration);
}

function renderSegmentsList() {
  segmentsList.innerHTML = '';
  state.segments.forEach((seg, i) => {
    const div = document.createElement('div');
    div.className = `segment-item${seg.deleted ? ' deleted' : ''}${i === state.selectedSegment ? ' active' : ''}`;
    div.innerHTML = `
      <span>#${i+1} &nbsp; ${formatTime(seg.start)} → ${formatTime(seg.end)}</span>
      ${!seg.deleted ? `<button class="segment-del-btn" data-idx="${i}" title="Delete this segment">✕</button>` : '<span style="font-size:9px;color:#ef4444">DELETED</span>'}
    `;
    div.querySelector('span')?.addEventListener('click', () => {
      state.selectedSegment = i;
      if (!seg.deleted) videoEl.currentTime = seg.start;
      renderSegmentsList();
    });
    div.querySelector('.segment-del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.idx);
      const activeSegs = state.segments.filter(s => !s.deleted);
      if (activeSegs.length <= 1) return;
      state.segments[idx].deleted = true;
      renderSegmentsList();
    });
    segmentsList.appendChild(div);
  });
}

// Segment skip logic: called from timeupdate
function handleSegmentSkip() {
  if (!state.segments.length) return;
  const t = videoEl.currentTime;
  const inValid = state.segments.some(s => !s.deleted && t >= s.start && t < s.end);
  if (!inValid) {
    const next = state.segments.find(s => !s.deleted && s.start >= t);
    if (next) {
      videoEl.currentTime = next.start;
    } else {
      videoEl.pause();
      state.playing = false;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO LOADING
// ══════════════════════════════════════════════════════════════════════════════
async function loadVideo(file) {
  const url = URL.createObjectURL(file);
  videoEl.src = url;

  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = resolve;
    videoEl.onerror          = reject;
  });

  // Set canvas dimensions from video
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  compositeCanvas.width  = vw;
  compositeCanvas.height = vh;
  compCtx = compositeCanvas.getContext('2d');

  // Apply aspect ratio letterboxing
  resizeDisplayCanvas(vw, vh);

  // Hide drop zone
  dropOverlay.classList.add('hidden');
  headerFilename.textContent = file.name;
  btnPlayPause.disabled = false;
  if (seekBar) seekBar.disabled = false;
  state.videoLoaded = true;
  resizeDisplayCanvas(vw, vh);

  // Init trim segments
  initSegments(videoEl.duration);

  // Update trim sliders range
  if (trimEnd) { trimEnd.max = videoEl.duration; trimEnd.value = videoEl.duration; trimEndVal.textContent = formatTime(videoEl.duration); }
  if (trimStart) { trimStart.max = videoEl.duration; trimStartVal.textContent = '0s'; }

  // Init audio (needs user gesture — already had one via file pick)
  if (!state.audioInitialized) {
    try {
      await audioMixer.init(videoEl);
      state.audioInitialized = true;
    } catch (err) {
      console.warn('AudioMixer init failed:', err);
    }
  }

  // Load timeline thumbnails (async, non-blocking)
  timeline.loadVideo(videoEl);

  startRenderLoop();
}

function resizeDisplayCanvas(vw, vh) {
  if (!vw || !vh) return;
  // Set CSS aspect-ratio so the browser auto-sizes within the flex container.
  // max-width:100% / max-height:100% (set in CSS) clamp it to the available space.
  displayCanvas.style.aspectRatio = `${vw} / ${vh}`;
  // Internal resolution = full video resolution for maximum render quality.
  displayCanvas.width  = vw;
  displayCanvas.height = vh;
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAYBACK
// ══════════════════════════════════════════════════════════════════════════════
// ── Helper: update play/pause button icons ──────────────────────────────────
function _setPlayUI(playing) {
  if (playing) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    btnPreviewToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    btnPreviewToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  }
}

// ── Helper: seek video and wait for seeked event (with safety timeout) ───────
function _seekAndWait(targetTime, timeoutMs = 1200) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    // Add listener BEFORE setting currentTime to avoid race condition
    // (iOS can fire 'seeked' synchronously)
    videoEl.addEventListener('seeked', finish, { once: true });
    setTimeout(finish, timeoutMs);   // safety net if seeked never fires
    videoEl.currentTime = targetTime;
  });
}

async function togglePlayPause() {
  if (!state.videoLoaded) return;

  if (state.playing) {
    // ── Pause ──────────────────────────────────────────────────────────
    videoEl.pause();
    audioMixer.stopMusic();
    state.playing = false;
    _setPlayUI(false);

  } else {
    // ── Play ───────────────────────────────────────────────────────────
    try {
      // If ended or nearly at end → seek to beginning FIRST
      // (iOS keeps video in frozen "ended" state until currentTime is reset)
      if (videoEl.ended || videoEl.currentTime >= (videoEl.duration - 0.05)) {
        const firstSeg = state.segments.find(s => !s.deleted);
        await _seekAndWait(firstSeg?.start ?? 0);
      }

      // IMPORTANT iOS: call play() BEFORE any further awaits so the
      // user-gesture token (valid ~500 ms) is consumed immediately.
      // AudioContext resume runs in parallel — not awaited before play().
      audioMixer.resume().catch(() => {});
      await videoEl.play();

      if (audioMixer.musicBuffer) audioMixer.startMusic(videoEl.currentTime);
      state.playing = true;
      _setPlayUI(true);

    } catch (err) {
      // NotAllowedError, AbortError, etc.
      console.warn('Playback error:', err.name, err.message);
      state.playing = false;
      _setPlayUI(false);
    }
  }
}

function updateTimeDisplay() {
  const cur = videoEl.currentTime || 0;
  const dur = videoEl.duration    || 0;
  timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  // Update seek bar position (only when user is not dragging it)
  if (seekBar && !_seekDragging && dur > 0) {
    seekBar.value = String(Math.round((cur / dur) * 1000));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ASPECT RATIO
// ══════════════════════════════════════════════════════════════════════════════
function setAspectRatio(ar) {
  state.aspectRatio = ar;
  arBtns.forEach(b => b.classList.toggle('active', b.dataset.ar === ar));

  if (state.videoLoaded) {
    resizeDisplayCanvas(compositeCanvas.width, compositeCanvas.height);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════════════════
function bindEvents() {
  // ─── Tool sidebar ─────────────────────────────────────────────────────────
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;

      if (tool === 'upload') {
        inputVideo.click();
        showPanel('upload');
        updateToolActive('upload');
        return;
      }

      const isMobile = window.innerWidth <= 768;

      // On mobile: tapping active tool toggles the sheet closed
      if (isMobile && state.currentTool === tool) {
        closeMobilePanel();
        return;
      }

      if (tool === 'music') {
        showPanel('music');
        updateToolActive('music');
      } else {
        showPanel(tool);
        updateToolActive(tool);
      }
    });
  });

  // ─── Drag & drop on canvas area ──────────────────────────────────────────
  canvasWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
    dropOverlay.classList.add('drag-active');
  });

  canvasWrapper.addEventListener('dragleave', () => {
    dropOverlay.classList.remove('drag-active');
    if (state.videoLoaded) dropOverlay.classList.add('hidden');
  });

  canvasWrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('drag-active');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) {
      await loadVideo(file);
    }
  });

  dropOverlay.addEventListener('click', () => inputVideo.click());

  // ─── File inputs ─────────────────────────────────────────────────────────
  inputVideo.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) await loadVideo(f);
    inputVideo.value = '';
  });

  const loadMusicFile = async (file) => {
    if (!file) return;
    musicInfo.textContent = `Loading: ${file.name}…`;
    try {
      if (!state.audioInitialized) {
        // Can't init without video element — show error
        musicInfo.textContent = 'Load a video first, then add music.';
        return;
      }
      const buf = await audioMixer.loadMusicFile(file);
      musicInfo.textContent = `♪ ${file.name} (${buf.duration.toFixed(1)}s)`;
      musicStart.max = Math.floor(buf.duration);
      // Load waveform into timeline
      timeline.loadAudioData(buf);
    } catch (err) {
      musicInfo.textContent = `Error: ${err.message}`;
    }
  };

  inputMusic.addEventListener('change',  async (e) => { await loadMusicFile(e.target.files[0]); inputMusic.value = ''; });
  inputMusic2.addEventListener('change', async (e) => { await loadMusicFile(e.target.files[0]); inputMusic2.value = ''; });

  // Upload zone clicks
  $('#upload-video-zone').addEventListener('click', () => inputVideo.click());
  $('#upload-music-zone').addEventListener('click', () => inputMusic.click());
  $('#upload-music-zone2').addEventListener('click', () => inputMusic2.click());

  // ─── Playback controls ────────────────────────────────────────────────────
  btnPlayPause.addEventListener('click', togglePlayPause);
  btnPreviewToggle.addEventListener('click', togglePlayPause);

  // ── Seek bar ──────────────────────────────────────────────────────────────
  // iOS: pointer events are unreliable on <input type=range> inside fixed divs.
  // Use both pointer + touch events so _seekDragging is always set correctly.
  const _onSeekStart = () => { _seekDragging = true; };
  const _onSeekEnd   = () => { _seekDragging = false; };
  seekBar?.addEventListener('pointerdown',  _onSeekStart);
  seekBar?.addEventListener('pointerup',    _onSeekEnd);
  seekBar?.addEventListener('pointercancel',_onSeekEnd);
  seekBar?.addEventListener('touchstart',   _onSeekStart, { passive: true });
  seekBar?.addEventListener('touchend',     _onSeekEnd);
  seekBar?.addEventListener('touchcancel',  _onSeekEnd);

  const _applySeek = () => {
    if (!state.videoLoaded || !videoEl.duration) return;
    const targetTime = (parseInt(seekBar.value) / 1000) * videoEl.duration;
    // On iOS the video may still be in "ended" state here; _seekAndWait
    // ensures the seek lands and the frame updates via the 'seeked' listener.
    videoEl.currentTime = targetTime;
  };
  seekBar?.addEventListener('input',  _applySeek);
  seekBar?.addEventListener('change', _applySeek); // 'change' fires on iOS when thumb released

  // ── Video ended ───────────────────────────────────────────────────────────
  videoEl.addEventListener('ended', () => {
    state.playing = false;
    _setPlayUI(false);
    audioMixer.stopMusic();

    // iOS critical: immediately seek back to start so the element exits the
    // "ended" state. Without this, subsequent play() and currentTime writes
    // are silently ignored by iOS Safari.
    const firstSeg = state.segments.find(s => !s.deleted);
    const resetTo  = firstSeg?.start ?? 0;
    if (seekBar) seekBar.value = String(Math.round((resetTo / (videoEl.duration || 1)) * 1000));
    // Seek AFTER a short delay — iOS needs one event loop tick to settle
    setTimeout(() => {
      videoEl.currentTime = resetTo;
    }, 80);
  });

  // ── Seeked → render frame when paused ────────────────────────────────────
  videoEl.addEventListener('seeked', () => {
    if (!state.playing && state.videoLoaded) {
      renderSingleFrame();
    }
  });

  btnFullscreen.addEventListener('click', () => {
    canvasWrapper.requestFullscreen?.() || canvasWrapper.webkitRequestFullscreen?.();
  });

  // ─── Aspect ratio ─────────────────────────────────────────────────────────
  arBtns.forEach(b => b.addEventListener('click', () => setAspectRatio(b.dataset.ar)));

  // ─── Censor controls ──────────────────────────────────────────────────────
  toggleCensor.addEventListener('change', () => {
    state.censorActive = toggleCensor.checked;
    faceCensor.setActive(state.censorActive);
    censorControls.classList.toggle('inactive', !state.censorActive);
    if (state.censorActive) {
      censorStatusDot.className  = 'status-dot processing';
      censorStatusText.textContent = 'Scanning for faces…';
    } else {
      censorStatusDot.className  = 'status-dot';
      censorStatusText.textContent = 'Censor inactive';
      faceCountDisplay.textContent = 'Faces: 0';
    }
  });

  // ─── Censor mode buttons ─────────────────────────────────────────────────
  censorModeGrid.forEach(btn => {
    btn.addEventListener('click', () => {
      censorModeGrid.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      faceCensor.censorMode = mode;
      // Update label
      if (censorRadiusLabel) {
        const labels = { blur: 'Blur Radius', pixelate: 'Block Size', blackbar: 'Bar Expand', shadow: 'Shadow Radius', stripes: 'Stripe Width' };
        censorRadiusLabel.textContent = labels[mode] || 'Radius';
      }
    });
  });

  blurRadiusSlider.addEventListener('input', () => {
    const v = parseInt(blurRadiusSlider.value);
    blurRadiusVal.textContent = `${v}px`;
    faceCensor.setBlurRadius(v);
  });

  censorOpacitySlider?.addEventListener('input', () => {
    const v = parseInt(censorOpacitySlider.value);
    censorOpacityVal.textContent = `${v}%`;
    faceCensor.setCensorOpacity(v);
  });

  maskScaleX?.addEventListener('input', () => {
    const v = parseInt(maskScaleX.value) / 100;
    maskScaleXVal.textContent = `${v.toFixed(1)}×`;
    faceCensor.setMaskScaleX(v);
  });

  maskScaleY?.addEventListener('input', () => {
    const v = parseInt(maskScaleY.value) / 100;
    maskScaleYVal.textContent = `${v.toFixed(1)}×`;
    faceCensor.setMaskScaleY(v);
  });

  maskExpandSlider.addEventListener('input', () => {
    const v = parseInt(maskExpandSlider.value);
    maskExpandVal.textContent = `${v}px`;
    faceCensor.setMaskExpand(v);
  });

  maxFacesSelect.addEventListener('change', async () => {
    await faceCensor.setMaxFaces(parseInt(maxFacesSelect.value));
  });

  // ─── Effects ─────────────────────────────────────────────────────────────
  effectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      effectBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentEffect = btn.dataset.effect;
      webglFx.setEffect(state.currentEffect);
      // Flare cursor mode
      canvasWrapper.classList.remove('mode-sticker', 'mode-flare', 'mode-default');
      canvasWrapper.classList.add(state.currentEffect === 'flare' ? 'mode-flare' : 'mode-default');
      if (state.currentEffect === 'flare') {
        document.title = 'Click canvas to set flare position — CENSOR ENGINE PRO';
        setTimeout(() => { document.title = 'CENSOR ENGINE PRO'; }, 2000);
      }
      // Add effect marker to timeline
      if (state.videoLoaded && state.currentEffect !== 'none') {
        timeline.addEffectMarker(videoEl.currentTime, state.currentEffect);
      }
    });
  });

  // Flare eye tracking toggle
  toggleFlareTrack?.addEventListener('change', () => {
    state.flareTrackEyes = toggleFlareTrack.checked;
    if (flareTrackHint) flareTrackHint.style.display = toggleFlareTrack.checked ? 'block' : 'none';
    if (toggleFlareTrack.checked && !state.faceMeshReady) {
      alert('Enable Censor first to activate FaceMesh, then Eye Tracking will work.');
      toggleFlareTrack.checked = false;
      state.flareTrackEyes = false;
    }
  });

  effectIntensity.addEventListener('input', () => {
    const v = parseInt(effectIntensity.value);
    effectIntensityVal.textContent = `${v}%`;
    webglFx.setIntensity(v / 100);
  });

  flareX.addEventListener('input', () => {
    const v = parseInt(flareX.value);
    flareXVal.textContent = `${v}%`;
    webglFx.setFlareX(v / 100);
  });

  flareY.addEventListener('input', () => {
    const v = parseInt(flareY.value);
    flareYVal.textContent = `${v}%`;
    webglFx.setFlareY(v / 100);
  });

  // ─── Color correction ─────────────────────────────────────────────────────
  const ccSliders = [
    [ccBrightness, '#cc-brightness-val', 'brightness'],
    [ccContrast,   '#cc-contrast-val',   'contrast'],
    [ccSaturation, '#cc-saturation-val', 'saturation'],
    [ccExposure,   '#cc-exposure-val',   'exposure'],
    [ccVignette,   '#cc-vignette-val',   'vignette', '%'],
    [ccSharpen,    '#cc-sharpen-val',    'sharpen',  '%'],
  ];

  ccSliders.forEach(([el, valSel, key, suffix = '']) => {
    el.addEventListener('input', () => {
      const v = parseInt(el.value);
      $(valSel).textContent = `${v}${suffix}`;
      webglFx.setColorCorrection(key, v);
    });
  });

  btnResetColor.addEventListener('click', () => {
    ccSliders.forEach(([el, valSel, , suffix = '']) => {
      el.value = 0;
      $(valSel).textContent = `0${suffix}`;
    });
    webglFx.resetColorCorrection();
  });

  // ─── Text overlay ─────────────────────────────────────────────────────────
  const makeSliderLive = (slider, valEl, suffix = '') => {
    slider.addEventListener('input', () => {
      valEl.textContent = `${slider.value}${suffix}`;
    });
  };

  makeSliderLive(textSize,    textSizeVal,    'px');
  makeSliderLive(textX,       textXVal,       '%');
  makeSliderLive(textY,       textYVal,       '%');
  makeSliderLive(textOpacity, textOpacityVal, '%');

  btnAddText.addEventListener('click', () => {
    const text = textContent.value.trim();
    if (!text) return;
    state.textLayers.push({
      id:      Date.now(),
      text,
      x:       parseInt(textX.value),
      y:       parseInt(textY.value),
      size:    parseInt(textSize.value),
      color:   textColor.value,
      stroke:  textStrokeColor.value,
      opacity: parseInt(textOpacity.value),
    });
    textContent.value = '';
  });

  // ─── Audio mixer ──────────────────────────────────────────────────────────
  volVideo.addEventListener('input', () => {
    const v = parseInt(volVideo.value);
    volVideoVal.textContent = `${v}%`;
    audioMixer.setVideoVolume(v / 100);
  });

  volMusic.addEventListener('input', () => {
    const v = parseInt(volMusic.value);
    volMusicVal.textContent = `${v}%`;
    audioMixer.setMusicVolume(v / 100);
  });

  musicStart.addEventListener('input', () => {
    const v = parseInt(musicStart.value);
    musicStartVal.textContent = `${v}s`;
    audioMixer.setMusicStart(v);
  });

  musicFade.addEventListener('input', () => {
    const v = parseFloat(musicFade.value);
    musicFadeVal.textContent = `${v}s`;
    audioMixer.setMusicFade(v);
  });

  // ─── Timeline zoom ────────────────────────────────────────────────────────
  tlZoomIn.addEventListener('click',  () => { timeline.zoomIn();  tlZoomLabel.textContent = `${timeline.zoom}×`; });
  tlZoomOut.addEventListener('click', () => { timeline.zoomOut(); tlZoomLabel.textContent = `${timeline.zoom}×`; });

  // ─── Export ───────────────────────────────────────────────────────────────
  // Detect iOS once
  const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  const openExportModal = () => {
    if (!state.videoLoaded) return;
    exportProgressArea.classList.add('hidden');
    exportModal.classList.remove('hidden');

    // iOS-specific UI tweaks
    const iosNote = $('#ios-export-note');
    if (_isIOS && iosNote) {
      iosNote.style.display = 'block';
      // Hide format selector (irrelevant for WebCodecs path) and cap bitrate
      const fmtGroup = $('#export-format')?.closest('.export-option-group');
      if (fmtGroup) fmtGroup.style.display = 'none';
      // Cap bitrate dropdown to 8 Mbps for iOS hw encoder
      const bitrateEl = $('#export-bitrate');
      if (bitrateEl) {
        for (const opt of bitrateEl.options) {
          if (parseInt(opt.value) > 8_000_000) opt.disabled = true;
        }
        if (parseInt(bitrateEl.value) > 8_000_000) bitrateEl.value = '8000000';
      }
    }
  };
  btnExport.addEventListener('click', openExportModal);
  // Mobile sidebar export & screenshot buttons
  $('#btn-export-mob')?.addEventListener('click', openExportModal);
  $('#btn-shot-mob')?.addEventListener('click', captureFrame);


  btnCloseExport.addEventListener('click',  () => exportModal.classList.add('hidden'));

  // ─── Screen Record Mode (iOS fallback) ───────────────────────────────────
  $('#btn-screen-record-mode')?.addEventListener('click', () => {
    const instr = $('#screen-record-instructions');
    if (instr) instr.style.display = instr.style.display === 'none' ? 'block' : 'none';
  });
  $('#btn-close-screen-record')?.addEventListener('click', () => {
    exportModal.classList.add('hidden');
  });
  btnCancelExport.addEventListener('click', () => {
    exporter.cancel();
    exportModal.classList.add('hidden');
    videoEl.pause();
    state.playing = false;
  });

  $('#modal-backdrop')?.addEventListener('click', () => exportModal.classList.add('hidden'));

  btnStartExport.addEventListener('click', async () => {
    if (!state.videoLoaded) return;

    btnStartExport.disabled = true;
    exportProgressArea.classList.remove('hidden');

    // Was playing? pause first so we can rewind
    const wasPlaying = state.playing;
    if (wasPlaying) await togglePlayPause();

    exporter.onProgress = (pct, label) => {
      exportProgressFill.style.width = `${pct}%`;
      exportProgressLabel.textContent = label;
    };

    exporter.onComplete = (blob, url) => {
      exportProgressLabel.textContent = `✓ Saved (${(blob.size / 1_048_576).toFixed(1)} MB)`;
      btnStartExport.disabled = false;
      setTimeout(() => exportModal.classList.add('hidden'), 2000);
    };

    exporter.onError = (err) => {
      exportProgressLabel.textContent = `Error: ${err.message}`;
      btnStartExport.disabled = false;
    };

    const audioStream = audioMixer.getAudioStream();

    await exporter.start(
      displayCanvas,
      audioStream,
      videoEl,
      {
        mimeType: exportFormat.value,
        bitrate:  parseInt(exportBitrate.value),
      }
    );

    // Restart render loop during recording
    startRenderLoop();
  });

  // ─── Mobile backdrop: close panel on tap ─────────────────────────────────
  document.getElementById('mobile-backdrop')?.addEventListener('click', closeMobilePanel);

  // ─── Segment skip on timeupdate ──────────────────────────────────────────
  videoEl.addEventListener('timeupdate', handleSegmentSkip);

  // ─── Trim panel ──────────────────────────────────────────────────────────
  btnSplit?.addEventListener('click', splitAtPlayhead);
  btnDeleteSegment?.addEventListener('click', deleteSelectedSegment);
  btnResetTrim?.addEventListener('click', resetTrim);

  trimStart?.addEventListener('input', () => {
    const v = parseFloat(trimStart.value);
    trimStartVal.textContent = formatTime(v);
    // Apply as a cut: remove everything before v
    if (state.segments.length && state.videoLoaded) {
      state.segments[0].start = v;
      if (videoEl.currentTime < v) videoEl.currentTime = v;
      renderSegmentsList();
    }
  });

  trimEnd?.addEventListener('input', () => {
    const v = parseFloat(trimEnd.value);
    trimEndVal.textContent = formatTime(v);
    if (state.segments.length && state.videoLoaded) {
      state.segments[state.segments.length - 1].end = v;
      renderSegmentsList();
    }
  });

  // ─── Sticker panel ───────────────────────────────────────────────────────
  stickersGrid.forEach(btn => {
    btn.addEventListener('click', () => {
      stickersGrid.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedSticker = btn.dataset.sticker;
      selectedStickerLabel.style.display = 'block';
      canvasWrapper.classList.remove('mode-default', 'mode-flare');
      canvasWrapper.classList.add('mode-sticker');
    });
  });

  stickerSize?.addEventListener('input', () => {
    stickerSizeVal.textContent = `${stickerSize.value}px`;
  });

  stickerOpacity?.addEventListener('input', () => {
    stickerOpacityVal.textContent = `${stickerOpacity.value}%`;
  });

  btnClearStickers?.addEventListener('click', () => {
    state.stickers = [];
    stickersPlacedList.innerHTML = '';
    stickersGrid.forEach(b => b.classList.remove('active'));
    state.selectedSticker = null;
    selectedStickerLabel.style.display = 'none';
    canvasWrapper.classList.remove('mode-sticker');
    canvasWrapper.classList.add('mode-default');
  });

  // ─── Frame panel ─────────────────────────────────────────────────────────
  framePresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.frame;
      const exists = state.activeFrames.findIndex(f => f.type === type);
      if (exists !== -1) {
        // Toggle off
        state.activeFrames.splice(exists, 1);
        btn.classList.remove('active');
      } else {
        state.activeFrames.push({ id: Date.now(), type });
        btn.classList.add('active');
      }
      renderActiveFramesList();
    });
  });

  frameOpacity?.addEventListener('input', () => {
    frameOpacityVal.textContent = `${frameOpacity.value}%`;
  });

  btnClearFrames?.addEventListener('click', () => {
    state.activeFrames = [];
    framePresetBtns.forEach(b => b.classList.remove('active'));
    renderActiveFramesList();
  });

  // ─── Canvas click: sticker placement + flare position ────────────────────
  displayCanvas.addEventListener('click', (e) => {
    const rect  = displayCanvas.getBoundingClientRect();
    const xPct  = ((e.clientX - rect.left) / rect.width)  * 100;
    const yPct  = ((e.clientY - rect.top)  / rect.height) * 100;

    if (state.selectedSticker && state.currentTool === 'stickers') {
      const s = {
        id:      Date.now(),
        emoji:   state.selectedSticker,
        x:       xPct,
        y:       yPct,
        size:    parseInt(stickerSize?.value ?? 80),
        opacity: parseInt(stickerOpacity?.value ?? 100),
      };
      state.stickers.push(s);
      renderPlacedStickersList();
    }

    if (state.currentEffect === 'flare') {
      webglFx.setFlareX(xPct / 100);
      webglFx.setFlareY(yPct / 100);
      if (flareX) { flareX.value = Math.round(xPct); flareXVal.textContent = `${Math.round(xPct)}%`; }
      if (flareY) { flareY.value = Math.round(yPct); flareYVal.textContent = `${Math.round(yPct)}%`; }
    }
  });

  // ─── Watermark panel ─────────────────────────────────────────────────────
  wmToggle?.addEventListener('change', () => {
    state.watermark.active = wmToggle.checked;
  });

  wmTextInput?.addEventListener('input', () => {
    state.watermark.text = wmTextInput.value;
  });

  wmPosBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wmPosBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.watermark.pos = btn.dataset.pos;
    });
  });

  wmStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wmStyleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.watermark.style = btn.dataset.style;
    });
  });

  wmColor?.addEventListener('input', () => {
    state.watermark.color = wmColor.value;
  });

  wmSize?.addEventListener('input', () => {
    const v = parseInt(wmSize.value);
    wmSizeVal.textContent = `${v}px`;
    state.watermark.size  = v;
  });

  wmOpacity?.addEventListener('input', () => {
    const v = parseInt(wmOpacity.value);
    wmOpacityVal.textContent = `${v}%`;
    state.watermark.opacity  = v;
  });

  btnWmSavePreset?.addEventListener('click', () => {
    const text = state.watermark.text.trim();
    if (!text) return;
    const presets = wmLoadPresets();
    // Avoid duplicates by text
    const existing = presets.findIndex(p => p.text === text);
    const entry = {
      text:    state.watermark.text,
      pos:     state.watermark.pos,
      style:   state.watermark.style,
      color:   state.watermark.color,
      size:    state.watermark.size,
      opacity: state.watermark.opacity,
    };
    if (existing !== -1) presets[existing] = entry;
    else presets.unshift(entry);
    // Keep max 15 presets
    wmSavePresetsToStorage(presets.slice(0, 15));
    wmRenderPresetsList();
  });

  // Load presets on start
  wmRenderPresetsList();

  // ─── Sounds panel ────────────────────────────────────────────────────────
  // All sound tiles (synthesized)
  soundTiles.forEach(btn => {
    btn.addEventListener('click', () => {
      const soundId = btn.dataset.sound;
      if (zenAudio.currentSound === soundId) {
        zenAudio.stop();
        document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
      } else {
        zenAudio.play(soundId);
        document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Pixabay tiles (real MP3 URLs)
  document.querySelectorAll('.pixabay-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const url  = btn.dataset.purl;
      const name = btn.dataset.pname || url;
      const key  = '__url__' + name;
      if (zenAudio.currentSound === key) {
        zenAudio.stop();
        document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
      } else {
        zenAudio.playUrl(url, name);
        document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Custom URL player
  const customMusicUrl = $('#custom-music-url');
  const btnPlayUrl     = $('#btn-play-url');
  btnPlayUrl?.addEventListener('click', () => {
    const url = customMusicUrl?.value?.trim();
    if (!url) return;
    zenAudio.playUrl(url, 'Custom URL');
    document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
    btnPlayUrl.textContent = '⏹ Stop';
    btnPlayUrl.classList.add('active');
  });
  customMusicUrl?.addEventListener('input', () => {
    if (btnPlayUrl) { btnPlayUrl.textContent = '▶ Play'; btnPlayUrl.classList.remove('active'); }
  });

  btnStopSound?.addEventListener('click', () => {
    zenAudio.stop();
    document.querySelectorAll('.sound-tile').forEach(b => b.classList.remove('active'));
    if (btnPlayUrl) { btnPlayUrl.textContent = '▶ Play'; btnPlayUrl.classList.remove('active'); }
  });

  // ─── Censor Target (Eyes / Face / Head) ──────────────────────────────────
  document.querySelectorAll('.censor-target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      faceCensor.setCensorTarget(target);
      document.querySelectorAll('.censor-target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  soundVolume?.addEventListener('input', () => {
    const v = parseInt(soundVolume.value) / 100;
    soundVolumeVal.textContent = `${soundVolume.value}%`;
    zenAudio.setVolume(v);
  });

  // ─── Background Blur ──────────────────────────────────────────────────────
  const toggleBgBlur    = $('#toggle-bg-blur');
  const bgBlurControls  = $('#bg-blur-controls');
  const bgBlurRadius    = $('#bg-blur-radius');
  const bgBlurRadiusVal = $('#bg-blur-radius-val');

  toggleBgBlur?.addEventListener('change', () => {
    state.bgBlurActive      = toggleBgBlur.checked;
    faceCensor.bgBlurActive = toggleBgBlur.checked;
    // bgBlur needs FaceMesh active even if eye censor is off
    if (toggleBgBlur.checked && !faceCensor.isActive) {
      faceCensor.isActive = true;
    } else if (!toggleBgBlur.checked && !state.censorActive) {
      faceCensor.isActive = false;
    }
    if (bgBlurControls) bgBlurControls.style.display = toggleBgBlur.checked ? 'block' : 'none';
  });

  bgBlurRadius?.addEventListener('input', () => {
    const v = parseInt(bgBlurRadius.value);
    bgBlurRadiusVal.textContent = `${v}px`;
    faceCensor.setBgBlurRadius(v);
  });

  // BG mode buttons
  document.querySelectorAll('.bg-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bg-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      faceCensor.setBgBlurMode(btn.dataset.bgmode);
    });
  });

  // Screenshot / frame capture — iOS: Web Share → Fotos; desktop: download
  async function captureFrame() {
    if (!state.videoLoaded) return;
    const filename = `frame-${Date.now()}.png`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && navigator.canShare) {
      try {
        const blob = await new Promise(res => displayCanvas.toBlob(res, 'image/png'));
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Fotograma — Censor Engine Pro' });
          return;
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Share frame failed:', e);
      }
    }
    // Fallback
    const link = document.createElement('a');
    link.download = filename;
    link.href = displayCanvas.toDataURL('image/png');
    link.click();
  }
  const btnScreenshot = $('#btn-screenshot');
  btnScreenshot?.addEventListener('click', captureFrame);

  // Playback speed toggle
  const btnSpeed   = $('#btn-speed');
  const speedSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  let   speedIdx   = 3; // default 1×
  btnSpeed?.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speedSteps.length;
    const spd = speedSteps[speedIdx];
    videoEl.playbackRate = spd;
    btnSpeed.textContent = spd === 1 ? '1×' : `${spd}×`;
    btnSpeed.classList.toggle('active', spd !== 1);
  });

  // ─── Manual Zone Drawing ──────────────────────────────────────────────────
  const btnDrawZone   = $('#btn-draw-zone');
  const btnClearZones = $('#btn-clear-zones');
  const zoneModeHint  = $('#zone-mode-hint');
  const zoneList      = $('#zone-list');

  function renderZoneList() {
    if (!zoneList) return;
    zoneList.innerHTML = '';
    faceCensor.manualZones.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'zone-item';
      item.innerHTML = `<span>🎯 Z${zone.id} · ${zone.mode} · ${zone.opacity ?? 100}%</span>
        <button class="zone-del" data-id="${zone.id}" title="Eliminar">✕</button>`;
      zoneList.appendChild(item);
    });
    if (btnClearZones) {
      btnClearZones.style.display = faceCensor.manualZones.length ? 'flex' : 'none';
    }
  }

  zoneList?.addEventListener('click', (e) => {
    const del = e.target.closest('.zone-del');
    if (del) {
      faceCensor.removeManualZone(parseInt(del.dataset.id));
      renderZoneList();
    }
  });

  btnClearZones?.addEventListener('click', () => {
    faceCensor.clearManualZones();
    renderZoneList();
  });

  // ─── Zone mode & opacity controls ─────────────────────────────────────────
  state.zoneMode    = 'blur';
  state.zoneOpacity = 100;

  document.querySelectorAll('.zone-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.zoneMode = btn.dataset.zmode;
      document.querySelectorAll('.zone-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const zoneOpacitySlider = $('#zone-opacity');
  const zoneOpacityVal    = $('#zone-opacity-val');
  zoneOpacitySlider?.addEventListener('input', () => {
    state.zoneOpacity = parseInt(zoneOpacitySlider.value);
    if (zoneOpacityVal) zoneOpacityVal.textContent = `${state.zoneOpacity}%`;
  });

  btnDrawZone?.addEventListener('click', () => {
    state.drawingZone = !state.drawingZone;
    btnDrawZone.classList.toggle('active', state.drawingZone);
    if (zoneModeHint) zoneModeHint.style.display = state.drawingZone ? 'block' : 'none';
    if (state.drawingZone) {
      initZoneDrawing();
    } else {
      removeZoneDrawing();
    }
  });

  // Zone drawing overlay logic
  let _zoneOverlay = null, _zonePreview = null;
  let _zoneStart   = null;

  function initZoneDrawing() {
    removeZoneDrawing();
    _zoneOverlay = document.createElement('div');
    _zoneOverlay.id = 'zone-draw-overlay';
    canvasWrapper.style.position = 'relative';
    canvasWrapper.appendChild(_zoneOverlay);

    _zonePreview = document.createElement('div');
    _zonePreview.className = 'zone-rect-preview';
    _zonePreview.style.display = 'none';
    _zoneOverlay.appendChild(_zonePreview);

    const getPos = (e) => {
      const rect = _zoneOverlay.getBoundingClientRect();
      const touch = e.touches?.[0] ?? e;
      return {
        x: (touch.clientX - rect.left) / rect.width,
        y: (touch.clientY - rect.top)  / rect.height,
      };
    };

    const onStart = (e) => {
      e.preventDefault();
      _zoneStart = getPos(e);
      _zonePreview.style.display = 'block';
    };

    const onMove = (e) => {
      e.preventDefault();
      if (!_zoneStart) return;
      const cur = getPos(e);
      const x   = Math.min(_zoneStart.x, cur.x);
      const y   = Math.min(_zoneStart.y, cur.y);
      const w   = Math.abs(cur.x - _zoneStart.x);
      const h   = Math.abs(cur.y - _zoneStart.y);
      _zonePreview.style.left   = `${x * 100}%`;
      _zonePreview.style.top    = `${y * 100}%`;
      _zonePreview.style.width  = `${w * 100}%`;
      _zonePreview.style.height = `${h * 100}%`;
    };

    const onEnd = (e) => {
      e.preventDefault();
      if (!_zoneStart) return;
      const cur = getPos(e.changedTouches?.[0] ?? e);
      const W   = compositeCanvas.width;
      const H   = compositeCanvas.height;
      const x   = Math.min(_zoneStart.x, cur.x);
      const y   = Math.min(_zoneStart.y, cur.y);
      const w   = Math.abs(cur.x - _zoneStart.x);
      const h   = Math.abs(cur.y - _zoneStart.y);

      if (w > 0.02 && h > 0.02) {
        // Convert normalized coords to pixel half-extents
        const W2 = compositeCanvas.width;
        const H2 = compositeCanvas.height;
        const cx = (x + w / 2) * W2;
        const cy = (y + h / 2) * H2;
        const rW = (w / 2) * W2;
        const rH = (h / 2) * H2;
        faceCensor.addManualZone(cx, cy, rW, rH, state.zoneMode, W2, H2, state.zoneOpacity);
        // Ensure FaceMesh engine is active for template tracking
        if (!faceCensor.isActive) faceCensor.isActive = true;
        state.zoneCounter++;
        renderZoneList();
      }
      _zoneStart = null;
      _zonePreview.style.display = 'none';
      // Exit draw mode after placing zone
      state.drawingZone = false;
      btnDrawZone?.classList.remove('active');
      if (zoneModeHint) zoneModeHint.style.display = 'none';
      removeZoneDrawing();
    };

    _zoneOverlay.addEventListener('mousedown',  onStart);
    _zoneOverlay.addEventListener('mousemove',  onMove);
    _zoneOverlay.addEventListener('mouseup',    onEnd);
    _zoneOverlay.addEventListener('touchstart', onStart, { passive: false });
    _zoneOverlay.addEventListener('touchmove',  onMove,  { passive: false });
    _zoneOverlay.addEventListener('touchend',   onEnd,   { passive: false });

    _zoneOverlay._handlers = { onStart, onMove, onEnd };
  }

  function removeZoneDrawing() {
    if (_zoneOverlay) {
      _zoneOverlay.remove();
      _zoneOverlay = null;
      _zonePreview = null;
    }
  }

  // Mobile: close panel when tapping canvas
  displayCanvas.addEventListener('touchend', (e) => {
    if (window.innerWidth <= 768) {
      const rp = document.getElementById('right-panel');
      if (rp?.classList.contains('mobile-open')) {
        // Only close if tap was on canvas itself, not a button
        rp.classList.remove('mobile-open');
      }
    }
  });

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlayPause(); break;
      case 'ArrowLeft':
        if (state.videoLoaded) {
          videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
        }
        break;
      case 'ArrowRight':
        if (state.videoLoaded) {
          videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 5);
        }
        break;
      case 'KeyC': toggleCensor.click(); break;
      case 'Escape': exportModal.classList.add('hidden'); break;
    }
  });

  // ─── Window resize ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (state.videoLoaded) {
      resizeDisplayCanvas(compositeCanvas.width, compositeCanvas.height);
    }
    timeline._resize();
  });
}

function openMobilePanel() {
  const rp       = document.getElementById('right-panel');
  const backdrop = document.getElementById('mobile-backdrop');
  if (!rp) return;
  rp.classList.add('mobile-open');
  if (backdrop) backdrop.classList.add('visible');
}

function closeMobilePanel() {
  const rp       = document.getElementById('right-panel');
  const backdrop = document.getElementById('mobile-backdrop');
  if (!rp) return;
  rp.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('visible');
  // Deactivate tool button highlight
  updateToolActive('');
  state.currentTool = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════════════════════
function showPanel(name) {
  const panelSounds     = $('#panel-sounds');
  const panelWatermark  = $('#panel-watermark');
  [panelUpload, panelCensor, panelEffects, panelColor, panelText, panelMusic,
   panelTrim, panelStickers, panelFrames, panelSounds, panelWatermark].forEach(p => {
    p?.classList.add('hidden');
  });
  const map = {
    upload:    panelUpload,
    censor:    panelCensor,
    effects:   panelEffects,
    color:     panelColor,
    text:      panelText,
    music:     panelMusic,
    trim:      panelTrim,
    stickers:  panelStickers,
    frames:    panelFrames,
    sounds:    panelSounds,
    watermark: panelWatermark,
  };
  map[name]?.classList.remove('hidden');

  // Cursor mode
  canvasWrapper.classList.remove('mode-sticker', 'mode-flare', 'mode-default');
  if (name === 'stickers' && state.selectedSticker) {
    canvasWrapper.classList.add('mode-sticker');
  } else if (name === 'effects' && state.currentEffect === 'flare') {
    canvasWrapper.classList.add('mode-flare');
  } else {
    canvasWrapper.classList.add('mode-default');
  }

  // Mobile: open sheet for all panels except upload (which shows inline)
  if (window.innerWidth <= 768) {
    if (name !== 'upload') {
      openMobilePanel();
    } else {
      closeMobilePanel();
    }
  }
}

function updateToolActive(activeTool) {
  toolBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === activeTool);
  });
  state.currentTool = activeTool;
}

function renderPlacedStickersList() {
  if (!stickersPlacedList) return;
  stickersPlacedList.innerHTML = '';
  state.stickers.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'segment-item';
    div.innerHTML = `<span>${s.emoji} at ${s.x.toFixed(0)}%, ${s.y.toFixed(0)}%</span>
      <button class="segment-del-btn" data-idx="${i}">✕</button>`;
    div.querySelector('.segment-del-btn').addEventListener('click', () => {
      state.stickers.splice(i, 1);
      renderPlacedStickersList();
    });
    stickersPlacedList.appendChild(div);
  });
}

function renderActiveFramesList() {
  if (!activeFramesList) return;
  activeFramesList.innerHTML = '';
  state.activeFrames.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'segment-item active';
    div.innerHTML = `<span>${f.type}</span>
      <button class="segment-del-btn" data-idx="${i}">✕</button>`;
    div.querySelector('.segment-del-btn').addEventListener('click', () => {
      state.activeFrames.splice(i, 1);
      // Deactivate the corresponding preset button
      framePresetBtns.forEach(b => { if (b.dataset.frame === f.type) b.classList.remove('active'); });
      renderActiveFramesList();
    });
    activeFramesList.appendChild(div);
  });
}

function setSplashProgress(pct, label) {
  progressFill.style.width       = `${pct}%`;
  progressLabel.textContent      = label;
}

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Render a single frame (used when paused + seeked) */
async function renderSingleFrame() {
  if (!compCtx) return;
  const W = compositeCanvas.width;
  const H = compositeCanvas.height;

  // processFrame first to populate lastResults for bgBlur face-sharp overlay
  if ((state.censorActive || state.bgBlurActive || faceCensor.manualZones.length > 0) && state.faceMeshReady) {
    await faceCensor.processFrame(videoEl);
  }
  if (state.bgBlurActive) {
    await faceCensor.processSegmentation(videoEl).catch(() => {});
  }

  compCtx.filter = webglFx.buildCSSFilter();
  if (state.bgBlurActive) {
    faceCensor.applyBgBlur(compCtx, videoEl, W, H);
  } else {
    compCtx.drawImage(videoEl, 0, 0, W, H);
  }
  compCtx.filter = 'none';

  if (state.censorActive && state.faceMeshReady) faceCensor.applyBlurMask(compCtx, videoEl, W, H);
  if (faceCensor.manualZones.length > 0) faceCensor.applyManualZones(compCtx, videoEl, W, H);

  drawTextLayers(compCtx, W, H);
  drawStickers(compCtx, W, H);
  drawFrames(compCtx, W, H);
  drawWatermark(compCtx, W, H);
  webglFx.renderFrame(compositeCanvas);
  drawVignette(W, H);
  updateTimeDisplay();
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ══════════════════════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-critical
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
init().catch(err => {
  console.error('Fatal init error:', err);
  progressLabel.textContent = `Init error: ${err.message}`;
});
