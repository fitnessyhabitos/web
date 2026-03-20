/**
 * CENSOR ENGINE PRO — Exporter Module
 *
 * Dual-path export:
 *  • Desktop / Android  →  MediaRecorder  (captureStream)
 *  • iOS (iPhone/iPad)  →  WebCodecs API  (VideoEncoder + mp4-muxer CDN)
 *
 * iOS notes:
 *  - Uses isConfigSupported() to find a valid H.264 codec + resolution.
 *  - If the canvas resolution is too high for any codec, downscales via
 *    an OffscreenCanvas so the VideoFrame dimensions always match the encoder.
 *  - Bitrate is capped at 8 Mbps (iOS hardware encoder limit).
 *  - Audio is not included (iOS WebCodecs AudioEncoder is unreliable).
 */

export class VideoExporter {
  constructor() {
    this.recorder       = null;
    this.chunks         = [];
    this.isRecording    = false;
    this.onProgress     = null;   // cb(pct, label)
    this.onComplete     = null;   // cb(blob, url)
    this.onError        = null;   // cb(err)
    this._ticker        = null;

    // WebCodecs path (iOS)
    this._wcEncoder     = null;
    this._wcMuxer       = null;
    this._wcTarget      = null;
    this._wcRafId       = null;
    this._wcFrameCount  = 0;
    this._wcLastTs      = -1;
    this._wcVideo       = null;
    this._wcScaleCanvas = null;   // downscale canvas (if resolution reduced)
    this._wcScaleCtx    = null;
    this._wcBridge      = null;   // 2D bridge — reads WebGL canvas safely on iOS
    this._wcBridgeCtx   = null;
    this._wcW           = 0;
    this._wcH           = 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
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
      this._finalizeWebCodecs();
    } else {
      clearInterval(this._ticker);
      this.isRecording = false;
      this.onProgress?.(99, 'Finalizando…');
      if (this.recorder?.state !== 'inactive') this.recorder.stop();
    }
  }

  cancel() {
    clearInterval(this._ticker);
    this.isRecording = false;

    if (this._wcEncoder) {
      cancelAnimationFrame(this._wcRafId);
      try { if (this._wcEncoder.state !== 'closed') this._wcEncoder.close(); } catch (_) {}
      this._wcEncoder     = null;
      this._wcMuxer       = null;
      this._wcTarget      = null;
      this._wcScaleCanvas = null;
      this._wcScaleCtx    = null;
      this._wcBridge      = null;
      this._wcBridgeCtx   = null;
      if (this._wcVideo) { this._wcVideo.pause(); this._wcVideo = null; }
    }

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

  /**
   * Find the best H.264 config supported by this device for the given size.
   * Tries multiple codec level strings and, if none work at full res, retries
   * at progressively lower resolutions (720p → 480p).
   */
  async _findSupportedConfig(W, H, bitrate, fps) {
    // H.264 codec strings ordered from best to safest quality
    const CODECS = [
      'avc1.640034',   // High L5.2  (up to 4K+)
      'avc1.640032',   // High L5.0
      'avc1.64002A',   // High L4.2
      'avc1.640029',   // High L4.1  (needed for 1080p portrait)
      'avc1.640028',   // High L4.0
      'avc1.4D4029',   // Main L4.1
      'avc1.4D4028',   // Main L4.0
      'avc1.4D401E',   // Main L3.0
      'avc1.42E01F',   // CB   L3.1
      'avc1.42E01E',   // CB   L3.0
    ];

    // Resolution ladder — always keeps aspect ratio, dims rounded to even
    const even = (n) => Math.max(2, n & ~1);
    const ladder = [
      { w: W,    h: H    },
      { w: 1280, h: even(Math.round(1280 * H / W)) },
      { w: 720,  h: even(Math.round(720  * H / W)) },
      { w: 480,  h: even(Math.round(480  * H / W)) },
    ].filter(r => r.w <= W && r.h <= H && r.w >= 2 && r.h >= 2)
     .map(r => ({ w: even(r.w), h: even(r.h) }));

    for (const { w, h } of ladder) {
      for (const codec of CODECS) {
        try {
          const res = await VideoEncoder.isConfigSupported({
            codec, width: w, height: h, bitrate, framerate: fps,
          });
          if (res.supported) {
            return { codec: res.config?.codec ?? codec, width: w, height: h };
          }
        } catch (_) {}
      }
    }
    return null;  // nothing supported
  }

  async _startWebCodecs(canvas, video, opts) {
    this.isRecording   = true;
    this._wcFrameCount = 0;
    this._wcLastTs     = -1;
    this._wcVideo      = video;

    this.onProgress?.(0, 'Iniciando…');

    // ── Load mp4-muxer ───────────────────────────────────────────────────
    let Muxer, ArrayBufferTarget;
    try {
      const mod = await import(
        'https://cdn.jsdelivr.net/npm/mp4-muxer@4/build/mp4-muxer.mjs'
      );
      Muxer            = mod.Muxer;
      ArrayBufferTarget = mod.ArrayBufferTarget;
    } catch (e) {
      console.warn('mp4-muxer CDN failed, trying MediaRecorder fallback', e);
      this.isRecording = false;
      await this._startMediaRecorder(canvas, null, video, opts);
      return;
    }

    // ── Find a working codec / resolution ─────────────────────────────────
    const canvasW   = canvas.width  & ~1;   // ensure even
    const canvasH   = canvas.height & ~1;
    const FPS       = 30;
    const bitrate   = Math.min(opts.bitrate || 4_000_000, 8_000_000); // iOS hw cap

    this.onProgress?.(2, 'Comprobando codec…');
    const config = await this._findSupportedConfig(canvasW, canvasH, bitrate, FPS);

    if (!config) {
      this.onError?.(new Error(
        'Este dispositivo no soporta VideoEncoder H.264. ' +
        'Prueba a reducir la resolución de exportación.'
      ));
      this.isRecording = false;
      return;
    }

    const { codec, width, height } = config;

    // ── 2D bridge canvas ─────────────────────────────────────────────────
    // iOS Safari cannot create VideoFrame directly from a WebGL canvas
    // (displayCanvas uses WebGL context). drawImage() CAN read a WebGL
    // framebuffer (because preserveDrawingBuffer=true is set) and writes it
    // into a 2D canvas, which VideoFrame accepts reliably.
    this._wcBridge    = document.createElement('canvas');
    this._wcBridge.width  = width;
    this._wcBridge.height = height;
    this._wcBridgeCtx = this._wcBridge.getContext('2d', { willReadFrequently: false });
    this._wcBridgeCtx.imageSmoothingEnabled = true;
    this._wcBridgeCtx.imageSmoothingQuality = 'high';

    // ── Optional downscale (only when native res > supported res) ────────
    if (width !== canvasW || height !== canvasH) {
      this.onProgress?.(3, `Escalando a ${width}×${height}…`);
    }
    // (downscaling is handled directly by drawing canvas → bridge at target dims)
    this._wcScaleCanvas = null;
    this._wcScaleCtx    = null;
    this._wcW = width;
    this._wcH = height;

    // ── Create muxer ─────────────────────────────────────────────────────
    const target = new ArrayBufferTarget();
    const muxer  = new Muxer({
      target,
      video:     { codec: 'avc', width, height },
      fastStart: 'in-memory',
    });

    // ── Create encoder ───────────────────────────────────────────────────
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          // iOS Safari omits colorSpace in decoderConfig; mp4-muxer crashes on null.
          // Inject BT.709 defaults so the muxer always has a valid value.
          if (meta?.decoderConfig && meta.decoderConfig.colorSpace == null) {
            meta.decoderConfig.colorSpace = {
              primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false
            };
          }
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          console.warn('[WC] muxer chunk skipped:', e.message);
        }
      },
      error: (e) => {
        this.isRecording = false;
        this.onError?.(new Error('Error de codificación: ' + (e.message ?? e)));
      },
    });

    encoder.configure({ codec, width, height, bitrate, framerate: FPS, latencyMode: 'quality' });

    this._wcEncoder = encoder;
    this._wcMuxer   = muxer;
    this._wcTarget  = target;

    // ── Rewind & play ─────────────────────────────────────────────────────
    video.currentTime = 0;
    await this._waitForSeek(video);

    const duration = video.duration || 1;
    this.onProgress?.(5, `Grabando ${width}×${height}…`);

    const captureFrame = () => {
      if (!this.isRecording || encoder.state === 'closed') return;
      const tsUs = Math.round(video.currentTime * 1_000_000);
      if (tsUs === this._wcLastTs) return;
      this._wcLastTs = tsUs;

      try {
        // Draw WebGL canvas → 2D bridge (also handles any resolution downscale)
        // This is the critical step: VideoFrame from 2D canvas is reliable on iOS.
        // VideoFrame from WebGL canvas directly throws "Encoding task failed".
        this._wcBridgeCtx.drawImage(canvas, 0, 0, width, height);
        const frame = new VideoFrame(this._wcBridge, { timestamp: tsUs });
        encoder.encode(frame, { keyFrame: this._wcFrameCount % 90 === 0 });
        frame.close();
        this._wcFrameCount++;
      } catch (_) {}

      const pct = Math.min((video.currentTime / duration) * 100, 97);
      this.onProgress?.(pct, `Grabando… ${Math.round(pct)}%`);
    };

    const rafLoop = () => {
      if (!this.isRecording) return;
      captureFrame();
      this._wcRafId = requestAnimationFrame(rafLoop);
    };

    await video.play();
    requestAnimationFrame(rafLoop);
    video.addEventListener('ended', () => this._finalizeWebCodecs(), { once: true });
  }

  async _finalizeWebCodecs() {
    cancelAnimationFrame(this._wcRafId);
    this.isRecording = false;
    this.onProgress?.(98, 'Codificando…');

    const encoder     = this._wcEncoder;
    const muxer       = this._wcMuxer;
    const target      = this._wcTarget;
    this._wcEncoder     = null;
    this._wcMuxer       = null;
    this._wcTarget      = null;
    this._wcScaleCanvas = null;
    this._wcScaleCtx    = null;
    this._wcBridge      = null;
    this._wcBridgeCtx   = null;
    this._wcVideo       = null;

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
      const sizeMB   = (blob.size / 1_048_576).toFixed(1);

      this.onProgress?.(100, `✓ Listo (${sizeMB} MB) — comparte para guardar en Fotos`);
      this.onComplete?.(blob, url);

      // ── iOS: Web Share API → save to Camera Roll ─────────────────────
      if (navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: 'video/mp4' });
          if (navigator.canShare({ files: [file] })) {
            // Small delay so onComplete UI updates first
            await new Promise(r => setTimeout(r, 600));
            await navigator.share({ files: [file], title: 'Video editado' });
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            return;
          }
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.warn('Share failed, opening in tab:', shareErr);
            // Open in new tab — user can tap & hold → Save to Photos
            window.open(url, '_blank');
          }
        }
      }

      // Fallback: anchor download
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
    let combined = videoStream;
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);
    }

    const recOpts = { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 };

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

    this.recorder.ondataavailable = (e) => { if (e.data?.size > 0) this.chunks.push(e.data); };
    this.recorder.onstop  = () => this._finalize(mimeType);
    this.recorder.onerror = (e) => { this.isRecording = false; this.onError?.(e.error); };

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

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Video editado' });
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          return;
        }
      } catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
    }

    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  _selectMimeType(preferred) {
    const candidates = [
      preferred,
      'video/mp4;codecs=avc1,mp4a.40.2',
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
