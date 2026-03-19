/**
 * CENSOR ENGINE PRO — Timeline Module
 * Canvas-based professional timeline with:
 * - Video track with generated thumbnails
 * - Effects track with colored markers
 * - Audio track visualization
 * - Draggable scrubber / playhead
 * - Zoom (1× – 16×)
 */

const TRACK_HEIGHT  = 38;
const RULER_HEIGHT  = 28;
const THUMB_W       = 80;
const THUMB_H       = TRACK_HEIGHT - 8;
const COLORS = {
  bg:         '#050000',
  trackBg:    'rgba(20,0,0,0.8)',
  trackBorder:'rgba(148,10,10,0.3)',
  thumb:      '#1a0000',
  ruler:      'rgba(148,10,10,0.5)',
  rulerText:  'rgba(255,255,255,0.4)',
  playhead:   '#19f9f9',
  videoTrack: 'rgba(148,10,10,0.25)',
  effectMark: 'rgba(25,249,249,0.6)',
  audioTrack: 'rgba(25,249,249,0.15)',
  audioBars:  'rgba(25,249,249,0.5)',
};

export class Timeline {
  /**
   * @param {HTMLCanvasElement} canvas     - main timeline canvas
   * @param {HTMLCanvasElement} rulerCanvas- ruler canvas
   * @param {HTMLElement}       playheadEl - playhead div
   * @param {HTMLElement}       scrollArea - scroll wrapper
   */
  constructor(canvas, rulerCanvas, playheadEl, scrollArea) {
    this.canvas      = canvas;
    this.ctx         = canvas.getContext('2d');
    this.rulerCanvas = rulerCanvas;
    this.rulerCtx    = rulerCanvas.getContext('2d');
    this.playheadEl  = playheadEl;
    this.scrollArea  = scrollArea;

    this.duration       = 0;
    this.currentTime    = 0;
    this.zoom           = 1;          // 1× – 16×
    this.pixelsPerSec   = 80;         // base pixels per second at zoom=1
    this.thumbnails     = [];         // ImageBitmap[]
    this.audioData      = null;       // Float32Array of normalized amplitudes
    this.effectMarkers  = [];         // [{time, effectName, color}]

    this._dragging    = false;
    this._onSeekCb    = null;

    this._bindEvents();
  }

  /** Register seek callback: fn(time) */
  onSeek(cb) { this._onSeekCb = cb; }

  // ─── Video loading ───────────────────────────────────────────────────────
  async loadVideo(videoEl) {
    this.duration    = videoEl.duration || 0;
    this.thumbnails  = [];
    this.effectMarkers = [];

    if (this.duration > 0) {
      await this._generateThumbnails(videoEl);
    }
    this._resize();
    this.render();
  }

  /** Generate thumbnails at regular intervals */
  async _generateThumbnails(video) {
    const thumbCount = Math.min(Math.ceil(this.duration / 2), 120);
    const interval   = this.duration / thumbCount;
    const tc         = document.createElement('canvas');
    tc.width  = THUMB_W;
    tc.height = THUMB_H;
    const tctx = tc.getContext('2d');

    const orig = video.currentTime;

    for (let i = 0; i <= thumbCount; i++) {
      const t = Math.min(i * interval, this.duration - 0.001);
      await this._seekVideo(video, t);
      tctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
      try {
        const bmp = await createImageBitmap(tc);
        this.thumbnails.push({ time: t, bmp });
      } catch (_) { /* skip */ }
    }

    // Restore
    await this._seekVideo(video, orig);
    this.render();
  }

  _seekVideo(video, time) {
    return new Promise(resolve => {
      if (Math.abs(video.currentTime - time) < 0.05) { resolve(); return; }
      video.currentTime = time;
      video.addEventListener('seeked', resolve, { once: true });
    });
  }

  /** Load audio waveform data from AudioBuffer */
  loadAudioData(audioBuffer) {
    const raw    = audioBuffer.getChannelData(0);
    const bins   = 400;
    const step   = Math.floor(raw.length / bins);
    const data   = new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        max = Math.max(max, Math.abs(raw[i * step + j] || 0));
      }
      data[i] = max;
    }
    this.audioData = data;
    this.render();
  }

  addEffectMarker(time, effectName) {
    this.effectMarkers.push({ time, effectName });
    this.render();
  }

  clearEffectMarkers() {
    this.effectMarkers = [];
    this.render();
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  render() {
    if (!this.duration) {
      this._renderEmpty();
      return;
    }
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._renderVideoTrack(0);
    this._renderEffectsTrack(TRACK_HEIGHT);
    this._renderAudioTrack(TRACK_HEIGHT * 2);
    this._updatePlayhead();
    this._renderRuler();
  }

  _renderEmpty() {
    const { ctx, canvas } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.rulerText;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Load a video to see the timeline', canvas.width / 2, canvas.height / 2);
  }

  _renderVideoTrack(yOffset) {
    const { ctx } = this;
    const W = this._totalWidth();

    // Track background
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, yOffset, W, TRACK_HEIGHT);
    ctx.strokeStyle = COLORS.trackBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, yOffset, W, TRACK_HEIGHT);

    // Red video bar
    ctx.fillStyle = COLORS.videoTrack;
    ctx.fillRect(0, yOffset + 4, W, TRACK_HEIGHT - 8);

    // Thumbnails
    for (const { time, bmp } of this.thumbnails) {
      const x = this._timeToX(time);
      ctx.drawImage(bmp, x, yOffset + 4, THUMB_W, THUMB_H);
      // Separator line
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOffset + 4);
      ctx.lineTo(x, yOffset + TRACK_HEIGHT - 4);
      ctx.stroke();
    }
  }

  _renderEffectsTrack(yOffset) {
    const { ctx } = this;
    const W = this._totalWidth();

    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, yOffset, W, TRACK_HEIGHT);
    ctx.strokeStyle = COLORS.trackBorder;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, yOffset, W, TRACK_HEIGHT);

    for (const marker of this.effectMarkers) {
      const x = this._timeToX(marker.time);
      ctx.fillStyle = COLORS.effectMark;
      ctx.fillRect(x - 1, yOffset + 6, 3, TRACK_HEIGHT - 12);
      // Label
      ctx.fillStyle = 'rgba(25,249,249,0.8)';
      ctx.font      = 'bold 8px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(marker.effectName?.substring(0, 6) ?? '', x + 4, yOffset + 18);
    }
  }

  _renderAudioTrack(yOffset) {
    const { ctx } = this;
    const W = this._totalWidth();

    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, yOffset, W, TRACK_HEIGHT);
    ctx.strokeStyle = COLORS.trackBorder;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, yOffset, W, TRACK_HEIGHT);

    if (!this.audioData) return;

    const mid   = yOffset + TRACK_HEIGHT / 2;
    const amp   = (TRACK_HEIGHT - 12) / 2;
    const bins  = this.audioData.length;
    const barW  = W / bins;

    ctx.fillStyle = COLORS.audioBars;
    for (let i = 0; i < bins; i++) {
      const h = this.audioData[i] * amp;
      ctx.fillRect(i * barW, mid - h, Math.max(barW - 0.5, 0.5), h * 2);
    }

    // Cyan mid line
    ctx.strokeStyle = 'rgba(25,249,249,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();
  }

  _renderRuler() {
    const rc  = this.rulerCtx;
    const rw  = this.rulerCanvas.width;
    const rh  = this.rulerCanvas.height;
    rc.clearRect(0, 0, rw, rh);
    rc.fillStyle = 'rgba(5,0,0,0.9)';
    rc.fillRect(0, 0, rw, rh);

    if (!this.duration) return;

    const pps   = this.pixelsPerSec * this.zoom;
    const scroll= this.scrollArea.scrollLeft;

    // Determine tick interval
    let tickSec = 1;
    if (pps < 20)       tickSec = 10;
    else if (pps < 60)  tickSec = 5;
    else if (pps < 120) tickSec = 2;
    else if (pps > 300) tickSec = 0.5;
    else if (pps > 600) tickSec = 0.25;

    rc.strokeStyle = COLORS.ruler;
    rc.fillStyle   = COLORS.rulerText;
    rc.font        = '9px SF Mono, Fira Code, monospace';
    rc.textAlign   = 'center';
    rc.lineWidth   = 1;

    const startT = Math.floor((scroll / pps) / tickSec) * tickSec;
    const endT   = startT + rw / pps + tickSec;

    for (let t = startT; t <= endT; t += tickSec) {
      const x = t * pps - scroll;
      if (x < 0 || x > rw) continue;

      const isMajor = (t % (tickSec * 5)) < 0.001;
      const tickH   = isMajor ? 10 : 5;
      rc.beginPath();
      rc.moveTo(x, rh - tickH);
      rc.lineTo(x, rh);
      rc.stroke();

      if (isMajor || pps > 80) {
        rc.fillText(this._formatTime(t), x, rh - tickH - 2);
      }
    }

    // Playhead tick on ruler
    const phX = this.currentTime * pps - scroll;
    rc.strokeStyle = COLORS.playhead;
    rc.shadowColor = COLORS.playhead;
    rc.shadowBlur  = 6;
    rc.lineWidth   = 1.5;
    rc.beginPath();
    rc.moveTo(phX, 0);
    rc.lineTo(phX, rh);
    rc.stroke();
    rc.shadowBlur = 0;
  }

  _updatePlayhead() {
    if (!this.duration) return;
    const pps    = this.pixelsPerSec * this.zoom;
    const scroll = this.scrollArea.scrollLeft;
    const x      = this.currentTime * pps - scroll;
    this.playheadEl.style.left = `${x}px`;
  }

  // ─── Time ↔ Pixel ────────────────────────────────────────────────────────
  _timeToX(t) { return t * this.pixelsPerSec * this.zoom; }
  _xToTime(x) { return x / (this.pixelsPerSec * this.zoom); }
  _totalWidth() { return Math.max(this.duration * this.pixelsPerSec * this.zoom, 200); }

  // ─── Zoom ────────────────────────────────────────────────────────────────
  zoomIn()  { this.zoom = Math.min(this.zoom * 2, 16); this._resize(); this.render(); }
  zoomOut() { this.zoom = Math.max(this.zoom / 2, 0.25); this._resize(); this.render(); }

  _resize() {
    const W = Math.ceil(this._totalWidth());
    const H = TRACK_HEIGHT * 3;
    this.canvas.width  = Math.max(W, this.scrollArea.clientWidth || 800);
    this.canvas.height = H;
    this.scrollArea.style.setProperty('--tl-width', W + 'px');

    // Ruler
    this.rulerCanvas.width  = this.rulerCanvas.parentElement?.clientWidth || 800;
    this.rulerCanvas.height = RULER_HEIGHT;
  }

  // ─── Seek / Time update ──────────────────────────────────────────────────
  setTime(t) {
    this.currentTime = Math.max(0, Math.min(t, this.duration));
    this._updatePlayhead();
    this._renderRuler();

    // Auto-scroll to keep playhead visible
    const pps    = this.pixelsPerSec * this.zoom;
    const x      = this.currentTime * pps;
    const aw     = this.scrollArea.clientWidth;
    const scroll = this.scrollArea.scrollLeft;
    if (x < scroll + 40 || x > scroll + aw - 40) {
      this.scrollArea.scrollLeft = Math.max(0, x - aw / 3);
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────────
  _bindEvents() {
    const sa = this.scrollArea;

    const getTime = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x    = (e.clientX - rect.left) + sa.scrollLeft;
      return this._xToTime(x);
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      const t = getTime(e);
      this.currentTime = Math.max(0, Math.min(t, this.duration));
      this._onSeekCb?.(this.currentTime);
      this.render();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const t = getTime(e);
      this.currentTime = Math.max(0, Math.min(t, this.duration));
      this._onSeekCb?.(this.currentTime);
      this._updatePlayhead();
      this._renderRuler();
    });

    window.addEventListener('mouseup', () => { this._dragging = false; });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      this._dragging = true;
      const t = getTime(e.touches[0]);
      this.currentTime = Math.max(0, Math.min(t, this.duration));
      this._onSeekCb?.(this.currentTime);
      this.render();
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const t = getTime(e.touches[0]);
      this.currentTime = Math.max(0, Math.min(t, this.duration));
      this._onSeekCb?.(this.currentTime);
      this._updatePlayhead();
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => { this._dragging = false; });

    // Rerender on scroll
    sa.addEventListener('scroll', () => { this._updatePlayhead(); this._renderRuler(); });
  }

  _formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(sec < 60 ? 0 : 0);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
