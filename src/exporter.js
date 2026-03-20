/**
 * CENSOR ENGINE PRO — Exporter Module
 *
 * Dual-path export:
 *  • Desktop / Android  →  MediaRecorder  (captureStream)
 *  • iOS (iPhone/iPad)  →  WebCodecs API  (VideoEncoder + mp4-muxer CDN)
 */

export class VideoExporter {
  constructor() {
    this.recorder      = null;
    this.chunks        = [];
    this.isRecording   = false;
    this.onProgress    = null;   // cb(pct, label)
    this.onComplete    = null;   // cb(blob, url)
    this.onError       = null;   // cb(err)
    this._ticker       = null;

    // WebCodecs path (iOS)
    this._wcEncoder    = null;
    this._wcMuxer      = null;
    this._wcTarget     = null;
    this._wcRafId      = null;
    this._wcFrameCount = 0;
    this._wcLastTs     = -1;
    this._wcVideo      = null;  // ref for cancel
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  /**
   * @param {HTMLCanvasElement} displayCanvas
   * @param {MediaStream|null}  audioStream
   * @param {HTMLVideoElement}  video
   * @param {object}            opts  { mimeType, bitrate }
   */
  async start(displayCanvas, audioStream, video, opts = {}) {
    if (this.isRecording) return;

    if (this._isIOS() && this._hasWebCodecs()) {
      await this._startWebCodecs(displayCanvas, video, opts);
    } else {
      await this._startMediaRecorder(displayCanvas, audioStream, video, opts);
    }
  }

  stop() {
    if (!this.isRecording) return;

    if (this._wcEncoder) {
      // WebCodecs path — finalize is triggered by video ended event
      // If user calls stop() manually, force finalize
      this._finalizeWebCodecs();
    } else {
      // MediaRecorder path
      clearInterval(this._ticker);
      this.isRecording = false;
      this.onProgress?.(99, 'Finalizando…');
      if (this.recorder?.state !== 'inactive') {
        this.recorder.stop();
      }
    }
  }

  cancel() {
    clearInterval(this._ticker);
    this.isRecording = false;

    // WebCodecs path
    if (this._wcEncoder) {
      cancelAnimationFrame(this._wcRafId);
      try {
        if (this._wcEncoder.state !== 'closed') this._wcEncoder.close();
      } catch (_) {}
      this._wcEncoder = null;
      this._wcMuxer   = null;
      this._wcTarget  = null;
      if (this._wcVideo) { this._wcVideo.pause(); this._wcVideo = null; }
    }

    // MediaRecorder path
    if (this.recorder?.state !== 'inactive') {
      try { this.recorder.stop(); } catch (_) {}
    }
    this.chunks   = [];
    this.recorder = null;
  }

  // ─── Platform detection ──────────────────────────────────────────────────
  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  _hasWebCodecs() {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  // ════════════════════════════════════════════════════════════════════════
  // PATH A — WebCodecs (iOS 16+)
  // ════════════════════════════════════════════════════════════════════════
  async _startWebCodecs(canvas, video, opts) {
    this.isRecording   = true;
    this._wcFrameCount = 0;
    this._wcLastTs     = -1;
    this._wcVideo      = video;

    this.onProgress?.(0, 'Cargando codificador…');

    // ── Load mp4-muxer from CDN ──────────────────────────────────────────
    let Muxer, ArrayBufferTarget;
    try {
      const mod = await import(
        'https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs'
      );
      Muxer            = mod.Muxer;
      ArrayBufferTarget = mod.ArrayBufferTarget;
    } catch (e) {
      console.warn('mp4-muxer load failed, falling back to MediaRecorder', e);
      this.isRecording = false;
      // Re-enter via MediaRecorder (no audio — iOS limitation)
      await this._startMediaRecorder(canvas, null, video, opts);
      return;
    }

    const W   = canvas.width;
    const H   = canvas.height;
    const FPS = 30;

    // ── Create muxer ─────────────────────────────────────────────────────
    const target = new ArrayBufferTarget();
    const muxer  = new Muxer({
      target,
      video:     { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory',
    });

    // ── Create video encoder ──────────────────────────────────────────────
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try { muxer.addVideoChunk(chunk, meta); } catch (_) {}
      },
      error: (e) => {
        this.isRecording = false;
        this.onError?.(e);
      },
    });

    try {
      encoder.configure({
        codec:        'avc1.42001f',   // H.264 Baseline
        width:        W,
        height:       H,
        bitrate:      opts.bitrate || 4_000_000,
        framerate:    FPS,
        latencyMode:  'quality',
      });
    } catch (cfgErr) {
      this.onError?.(new Error('VideoEncoder.configure failed: ' + cfgErr.message));
      this.isRecording = false;
      return;
    }

    this._wcEncoder = encoder;
    this._wcMuxer   = muxer;
    this._wcTarget  = target;

    // ── Rewind & play ─────────────────────────────────────────────────────
    video.currentTime = 0;
    await this._waitForSeek(video);

    const duration = video.duration || 1;
    this.onProgress?.(1, 'Grabando… 1%');

    const captureFrame = () => {
      if (!this.isRecording || encoder.state === 'closed') return;
      const tsUs = Math.round(video.currentTime * 1_000_000);
      if (tsUs === this._wcLastTs) return;  // no new frame yet
      this._wcLastTs = tsUs;

      try {
        const frame    = new VideoFrame(canvas, { timestamp: tsUs });
        const isKeyFrm = this._wcFrameCount % 90 === 0;
        encoder.encode(frame, { keyFrame: isKeyFrm });
        frame.close();
        this._wcFrameCount++;
      } catch (_) {}

      const pct = Math.min((video.currentTime / duration) * 100, 98);
      this.onProgress?.(pct, `Grabando… ${Math.round(pct)}%`);
    };

    const rafLoop = () => {
      if (!this.isRecording) return;
      captureFrame();
      this._wcRafId = requestAnimationFrame(rafLoop);
    };

    await video.play();
    requestAnimationFrame(rafLoop);

    // Auto-stop when video ends
    video.addEventListener('ended', () => this._finalizeWebCodecs(), { once: true });
  }

  async _finalizeWebCodecs() {
    cancelAnimationFrame(this._wcRafId);
    this.isRecording = false;
    this.onProgress?.(99, 'Codificando…');

    const encoder = this._wcEncoder;
    const muxer   = this._wcMuxer;
    const target  = this._wcTarget;

    this._wcEncoder = null;
    this._wcMuxer   = null;
    this._wcTarget  = null;
    this._wcVideo   = null;

    try {
      if (encoder && encoder.state !== 'closed') {
        await encoder.flush();
        encoder.close();
      }
      muxer?.finalize();

      const buffer   = target.buffer;
      const blob     = new Blob([buffer], { type: 'video/mp4' });
      const url      = URL.createObjectURL(blob);
      const filename = `VideoEditado_${Date.now()}.mp4`;

      this.onProgress?.(100, `✓ Listo (${(blob.size / 1_048_576).toFixed(1)} MB)`);
      this.onComplete?.(blob, url);

      // ── iOS: share sheet → save to Camera Roll ───────────────────────
      if (navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: 'video/mp4' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Video editado' });
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            return;
          }
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.warn('Share failed, falling back to download', shareErr);
          }
        }
      }

      // ── Fallback: open in new tab (tap & hold → Save to Photos) ──────
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

    } catch (finalErr) {
      this.onError?.(finalErr);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PATH B — MediaRecorder (Desktop / Android)
  // ════════════════════════════════════════════════════════════════════════
  async _startMediaRecorder(displayCanvas, audioStream, video, opts) {
    const mimeType = this._selectMimeType(opts.mimeType);
    const bitrate  = opts.bitrate || 15_000_000;

    const videoStream = displayCanvas.captureStream(60);
    let combined;

    if (audioStream && audioStream.getAudioTracks().length > 0) {
      combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);
    } else {
      combined = videoStream;
    }

    const recOpts = {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 192_000,
    };

    try {
      this.recorder = new MediaRecorder(combined, recOpts);
    } catch (_) {
      try {
        this.recorder = new MediaRecorder(videoStream, { videoBitsPerSecond: bitrate });
      } catch (err2) {
        this.onError?.(new Error(`MediaRecorder no soportado: ${err2.message}`));
        return;
      }
    }

    this.chunks      = [];
    this.isRecording = true;

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop  = () => this._finalize(mimeType);
    this.recorder.onerror = (e) => {
      this.isRecording = false;
      this.onError?.(e.error);
    };

    video.currentTime = 0;
    await this._waitForSeek(video);

    this.recorder.start(100);
    this.onProgress?.(0, 'Grabando… 0%');
    await video.play();

    const duration = video.duration;
    this._ticker = setInterval(() => {
      const pct = Math.min((video.currentTime / duration) * 100, 99);
      this.onProgress?.(pct, `Grabando… ${Math.round(pct)}%`);
    }, 250);

    video.addEventListener('ended', () => this.stop(), { once: true });
  }

  // ─── Internal ────────────────────────────────────────────────────────────
  async _finalize(mimeType) {
    const ext      = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `VideoEditado_${Date.now()}.${ext}`;
    const blob     = new Blob(this.chunks, { type: mimeType });
    const url      = URL.createObjectURL(blob);

    this.onProgress?.(100, `✓ Listo (${(blob.size / 1_048_576).toFixed(1)} MB)`);
    this.onComplete?.(blob, url);

    // iOS Web Share fallback for MediaRecorder path
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Video editado' });
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          return;
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Share failed:', e);
      }
    }

    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  _selectMimeType(preferred) {
    const candidates = [
      preferred,
      'video/mp4;codecs=avc1,mp4a.40.2',   // iOS Safari 15.4+
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].filter(Boolean);

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
  }

  _waitForSeek(video) {
    return new Promise(resolve => {
      if (video.currentTime === 0 && video.readyState >= 2) { resolve(); return; }
      video.addEventListener('seeked', resolve, { once: true });
      if (video.currentTime === 0) resolve();
    });
  }

  static getSupportedFormats() {
    return [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].filter(t => MediaRecorder.isTypeSupported(t));
  }
}
