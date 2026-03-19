/**
 * CENSOR ENGINE PRO — Exporter Module
 * Captures the display canvas stream + mixed audio stream via MediaRecorder.
 * Downloads the result as WebM/MP4.
 */

export class VideoExporter {
  constructor() {
    this.recorder      = null;
    this.chunks        = [];
    this.isRecording   = false;
    this.onProgress    = null;  // cb(pct, label)
    this.onComplete    = null;  // cb(blob, url)
    this.onError       = null;  // cb(err)
    this._ticker       = null;
  }

  /**
   * Start export.
   * @param {HTMLCanvasElement} displayCanvas  - the WebGL output canvas
   * @param {MediaStream|null}  audioStream    - mixed audio from AudioMixer
   * @param {HTMLVideoElement}  video          - source video element
   * @param {object}            opts
   * @param {string}            opts.mimeType  - e.g. 'video/webm;codecs=vp9,opus'
   * @param {number}            opts.bitrate   - bits per second
   */
  async start(displayCanvas, audioStream, video, opts = {}) {
    if (this.isRecording) return;

    const mimeType = this._selectMimeType(opts.mimeType);
    const bitrate  = opts.bitrate || 15_000_000;

    // Build combined media stream
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

    // Configure recorder
    const recOpts = {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 192_000,
    };

    try {
      this.recorder = new MediaRecorder(combined, recOpts);
    } catch (err) {
      // Fallback: try without audio if codec unsupported
      try {
        this.recorder = new MediaRecorder(videoStream, { videoBitsPerSecond: bitrate });
      } catch (err2) {
        this.onError?.(new Error(`MediaRecorder not supported: ${err2.message}`));
        return;
      }
    }

    this.chunks    = [];
    this.isRecording = true;

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      this._finalize(mimeType);
    };

    this.recorder.onerror = (e) => {
      this.isRecording = false;
      this.onError?.(e.error);
    };

    // Rewind and play video for capture
    video.currentTime = 0;
    await this._waitForSeek(video);

    this.recorder.start(100); // collect in 100ms chunks
    this.onProgress?.(0, 'Recording… 0%');

    await video.play();

    const duration = video.duration;
    this._ticker = setInterval(() => {
      const pct = Math.min((video.currentTime / duration) * 100, 99);
      this.onProgress?.(pct, `Recording… ${Math.round(pct)}%`);
    }, 250);

    // Stop when video ends
    video.addEventListener('ended', () => this.stop(), { once: true });
  }

  /** Stop recording (can be called early) */
  stop() {
    if (!this.isRecording) return;
    clearInterval(this._ticker);
    this.isRecording = false;
    this.onProgress?.(99, 'Finalizing…');
    if (this.recorder?.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  /** Cancel and discard chunks */
  cancel() {
    clearInterval(this._ticker);
    this.isRecording = false;
    if (this.recorder?.state !== 'inactive') {
      try { this.recorder.stop(); } catch (_) {}
    }
    this.chunks   = [];
    this.recorder = null;
  }

  // ─── Internal ────────────────────────────────────────────────────────────
  _finalize(mimeType) {
    const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    const url  = URL.createObjectURL(blob);

    this.onProgress?.(100, 'Export complete!');
    this.onComplete?.(blob, url);

    // Auto-download
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `CensorEnginePro_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release URL after 60s
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  _selectMimeType(preferred) {
    const candidates = [
      preferred,
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].filter(Boolean);

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
  }

  _waitForSeek(video) {
    return new Promise(resolve => {
      if (video.readyState >= 2) { video.currentTime = 0; }
      video.addEventListener('seeked', resolve, { once: true });
      if (video.currentTime === 0) resolve();
    });
  }

  /** Returns list of supported MIME types for display in UI */
  static getSupportedFormats() {
    return [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].filter(t => MediaRecorder.isTypeSupported(t));
  }
}
