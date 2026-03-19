/**
 * CENSOR ENGINE PRO — Audio Mixer Module
 * Web Audio API: mixes video original audio with background music track.
 * Features: per-track gain, music start offset, fade-out.
 */

export class AudioMixer {
  constructor() {
    this.ctx         = null;   // AudioContext
    this.videoNode   = null;   // MediaElementSourceNode from <video>
    this.musicBuffer = null;   // AudioBuffer of loaded music
    this.musicSource = null;   // BufferSourceNode (restart on each play)

    this.videoGain   = null;   // GainNode for video audio
    this.musicGain   = null;   // GainNode for music
    this.masterGain  = null;   // GainNode for combined output

    // Destination exposed for MediaRecorder
    this.destination = null;   // MediaStreamAudioDestinationNode

    // Settings
    this.videoVolume  = 1.0;
    this.musicVolume  = 0.5;
    this.musicStart   = 0;     // seconds into music file to start at
    this.musicFadeSec = 2;     // fade-out duration in seconds

    this._musicStarted     = false;
    this._musicPlayOffset  = 0;    // track where in music we are
    this._musicStartedAt   = 0;    // audioCtx.currentTime when music started
    this._videoEl          = null;
    this._onMusicEndCb     = null;
  }

  /**
   * Initialize with the video element.
   * Must be called after a user gesture (click) to avoid autoplay policy.
   */
  async init(videoElement) {
    if (this.ctx) return; // already initialized

    this._videoEl = videoElement;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Video audio source
    this.videoNode  = this.ctx.createMediaElementSource(videoElement);
    this.videoGain  = this.ctx.createGain();
    this.musicGain  = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();

    // Destination for MediaRecorder capture
    this.destination = this.ctx.createMediaStreamDestination();

    // Routing: video → videoGain → master → speakers + destination
    this.videoNode.connect(this.videoGain);
    this.videoGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.destination);

    this.videoGain.gain.value  = this.videoVolume;
    this.musicGain.gain.value  = this.musicVolume;
    this.masterGain.gain.value = 1.0;
  }

  /** Resume AudioContext (required after user interaction) */
  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  // ─── Music loading ───────────────────────────────────────────────────────
  /**
   * Load a music file from an ArrayBuffer.
   * @param {ArrayBuffer} arrayBuffer
   * @returns {AudioBuffer}
   */
  async loadMusic(arrayBuffer) {
    if (!this.ctx) return null;
    this.musicBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    return this.musicBuffer;
  }

  /** Load from File object */
  async loadMusicFile(file) {
    const buf = await file.arrayBuffer();
    return this.loadMusic(buf);
  }

  // ─── Playback control ────────────────────────────────────────────────────
  /**
   * Start music playback aligned to current video time.
   * @param {number} videoTime - current video playback position (seconds)
   */
  startMusic(videoTime = 0) {
    if (!this.ctx || !this.musicBuffer) return;
    this._stopMusicSource();

    // offset in music file = musicStart + videoTime  (modulo duration)
    const musicDuration = this.musicBuffer.duration;
    const offset        = (this.musicStart + videoTime) % musicDuration;

    this.musicSource = this.ctx.createBufferSource();
    this.musicSource.buffer = this.musicBuffer;
    this.musicSource.loop   = true;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0, offset);

    this._musicStarted   = true;
    this._musicPlayOffset = offset;
    this._musicStartedAt  = this.ctx.currentTime;
  }

  /** Stop music playback */
  stopMusic() {
    this._stopMusicSource();
    this._musicStarted = false;
  }

  _stopMusicSource() {
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch (_) {}
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }

  /**
   * Schedule a fade-out starting at `startTime` (audio context time).
   * @param {number} durationSec
   */
  scheduleFadeOut(startTime, durationSec) {
    if (!this.musicGain) return;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(startTime);
    g.setValueAtTime(this.musicVolume, startTime);
    g.linearRampToValueAtTime(0, startTime + durationSec);
  }

  /** Reset music gain after fade */
  resetMusicGain() {
    if (!this.musicGain) return;
    this.musicGain.gain.cancelScheduledValues(0);
    this.musicGain.gain.value = this.musicVolume;
  }

  // ─── Volume setters ──────────────────────────────────────────────────────
  setVideoVolume(v) {
    this.videoVolume = Math.max(0, Math.min(v, 1));
    if (this.videoGain) this.videoGain.gain.value = this.videoVolume;
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(v, 1));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  setMusicStart(sec) { this.musicStart = Math.max(0, sec); }
  setMusicFade(sec)  { this.musicFadeSec = Math.max(0, sec); }

  // ─── Sync ────────────────────────────────────────────────────────────────
  /**
   * Called when video seeks — restart music at correct offset.
   * @param {number} videoTime
   */
  onVideoSeeked(videoTime) {
    if (!this._musicStarted) return;
    this.startMusic(videoTime);
  }

  /**
   * Called every frame. Schedules fade-out near video end.
   * @param {number} videoTime
   * @param {number} videoDuration
   */
  tick(videoTime, videoDuration) {
    if (!this.ctx || !this._musicStarted) return;
    const remaining = videoDuration - videoTime;
    if (remaining <= this.musicFadeSec && remaining > 0) {
      const fadeStart = this.ctx.currentTime;
      this.scheduleFadeOut(fadeStart, remaining);
    }
  }

  // ─── MediaRecorder integration ───────────────────────────────────────────
  /** Returns the MediaStream with mixed audio for MediaRecorder */
  getAudioStream() {
    return this.destination?.stream ?? null;
  }

  get audioContext() { return this.ctx; }

  // ─── Cleanup ────────────────────────────────────────────────────────────
  destroy() {
    this._stopMusicSource();
    this.ctx?.close();
    this.ctx = null;
  }
}
