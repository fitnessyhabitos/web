/**
 * CENSOR ENGINE PRO — Zen Audio Engine
 * Synthesizes ambient soundscapes purely via Web Audio API.
 * No external audio files needed — works fully offline as PWA.
 */
export class ZenAudioEngine {
  constructor() {
    this.audioCtx     = null;
    this.masterGain   = null;
    this.currentNodes = [];
    this.currentSound = null;
    this.volume       = 0.55;
  }

  _init() {
    if (!this.audioCtx) {
      this.audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  _noise(duration = 4) {
    const sr  = this.audioCtx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.audioCtx.createBuffer(1, len, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    return src;
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.audioCtx.currentTime, 0.05);
    }
  }

  stop() {
    this.currentNodes.forEach(n => {
      try { n.stop?.(); } catch(_) {}
      try { n.disconnect?.(); } catch(_) {}
    });
    this.currentNodes = [];
    this.currentSound = null;
  }

  play(soundId) {
    this._init();
    this.stop();
    this.currentSound = soundId;
    const nodes = [];
    const ctx   = this.audioCtx;
    const dest  = this.masterGain;
    const now   = ctx.currentTime;

    switch (soundId) {

      case 'rain': {
        const noise = this._noise(2);
        const bp1   = ctx.createBiquadFilter();
        bp1.type = 'bandpass'; bp1.frequency.value = 1800; bp1.Q.value = 0.7;
        const bp2   = ctx.createBiquadFilter();
        bp2.type = 'bandpass'; bp2.frequency.value = 3800; bp2.Q.value = 1.2;
        const g     = ctx.createGain(); g.gain.value = 0.65;
        noise.connect(bp1); bp1.connect(g);
        noise.connect(bp2); bp2.connect(g);
        g.connect(dest); noise.start();
        nodes.push(noise, bp1, bp2, g);
        break;
      }

      case 'ocean': {
        const noise  = this._noise(5);
        const lp     = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 700;
        const g      = ctx.createGain(); g.gain.value = 0.6;
        const lfo    = ctx.createOscillator(); lfo.frequency.value = 0.1;
        const lfoG   = ctx.createGain(); lfoG.gain.value = 0.3;
        lfo.connect(lfoG); lfoG.connect(g.gain);
        noise.connect(lp); lp.connect(g); g.connect(dest);
        noise.start(); lfo.start();
        nodes.push(noise, lp, g, lfo, lfoG);
        break;
      }

      case 'wind': {
        const noise  = this._noise(3);
        const bp     = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.25;
        const g      = ctx.createGain(); g.gain.value = 0.5;
        const lfo    = ctx.createOscillator(); lfo.frequency.value = 0.06;
        const lfoF   = ctx.createGain(); lfoF.gain.value = 180;
        lfo.connect(lfoF); lfoF.connect(bp.frequency);
        noise.connect(bp); bp.connect(g); g.connect(dest);
        noise.start(); lfo.start();
        nodes.push(noise, bp, g, lfo, lfoF);
        break;
      }

      case 'forest': {
        // Background leaves + occasional bird chirp
        const noise = this._noise(3);
        const lp    = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1100;
        const g     = ctx.createGain(); g.gain.value = 0.18;
        noise.connect(lp); lp.connect(g); g.connect(dest); noise.start();
        const chirp = () => {
          const f   = 2200 + Math.random() * 2000;
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.frequency.value = f;
          og.gain.setValueAtTime(0, ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(og); og.connect(dest);
          osc.start(); osc.stop(ctx.currentTime + 0.3);
        };
        const iv = setInterval(chirp, 900 + Math.random() * 2200);
        nodes.push(noise, lp, g, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'fire': {
        const noise = this._noise(2);
        const lp    = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 900;
        const g     = ctx.createGain(); g.gain.value = 0.4;
        const crackle = () => {
          g.gain.setTargetAtTime(0.28 + Math.random() * 0.28, ctx.currentTime, 0.04 + Math.random() * 0.1);
        };
        const iv = setInterval(crackle, 80 + Math.random() * 180);
        noise.connect(lp); lp.connect(g); g.connect(dest); noise.start();
        nodes.push(noise, lp, g, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'bowl': {
        // Tibetan singing bowl @ 432 Hz
        const BOWL_FREQS = [432, 864, 1296, 1728];
        const ringBowl = () => {
          BOWL_FREQS.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const og  = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = f;
            og.gain.setValueAtTime(0.38 / (i + 1), ctx.currentTime);
            og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 9);
            osc.connect(og); og.connect(dest);
            osc.start(); osc.stop(ctx.currentTime + 9);
          });
        };
        ringBowl();
        const iv = setInterval(ringBowl, 10000);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'bells': {
        const BELL_NOTES = [523, 659, 784, 1047, 1319, 1568];
        const chime = () => {
          const f   = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          og.gain.setValueAtTime(0, ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.01);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.5);
          osc.connect(og); og.connect(dest);
          osc.start(); osc.stop(ctx.currentTime + 3.5);
        };
        chime();
        const iv = setInterval(chime, 2200 + Math.random() * 3200);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'binaural': {
        // 10 Hz alpha beat: left=200Hz right=210Hz
        [['left', 200], ['right', 210]].forEach(([side, freq]) => {
          const osc    = ctx.createOscillator();
          const og     = ctx.createGain();
          const panner = ctx.createStereoPanner();
          osc.type = 'sine'; osc.frequency.value = freq;
          og.gain.value = 0.28;
          panner.pan.value = side === 'left' ? -1 : 1;
          osc.connect(og); og.connect(panner); panner.connect(dest);
          osc.start(); nodes.push(osc, og, panner);
        });
        break;
      }

      case 'om': {
        // Om drone @ 136.1 Hz (OM frequency, C#3)
        const OM = 136.1;
        [[1, 0.45, 'sawtooth'], [1.5, 0.28, 'sine'], [2, 0.18, 'sine'], [3, 0.08, 'sine']].forEach(([r, vol, type]) => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = type; osc.frequency.value = OM * r;
          og.gain.value = vol;
          osc.connect(og); og.connect(dest); osc.start();
          nodes.push(osc, og);
        });
        break;
      }

      case 'sensual': {
        // Slow warm Cm9 chord with slight vibrato
        const CM9 = [130.81, 155.56, 196.00, 233.08, 293.66];
        CM9.forEach((f, i) => {
          const osc  = ctx.createOscillator();
          const og   = ctx.createGain();
          const lfo  = ctx.createOscillator();
          const lfoG = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          og.gain.value = 0.11;
          lfo.frequency.value = 0.45 + i * 0.07;
          lfoG.gain.value = 1.2;
          lfo.connect(lfoG); lfoG.connect(osc.frequency);
          osc.connect(og); og.connect(dest);
          osc.start(); lfo.start();
          nodes.push(osc, og, lfo, lfoG);
        });
        break;
      }

      case 'whitenoise': {
        const noise = this._noise(2);
        const g     = ctx.createGain(); g.gain.value = 0.55;
        noise.connect(g); g.connect(dest); noise.start();
        nodes.push(noise, g);
        break;
      }

      case 'pinknoise': {
        // Pink noise via successive filtering of white noise
        const noise = this._noise(2);
        const b0 = ctx.createBiquadFilter(); b0.type = 'lowshelf'; b0.frequency.value = 200; b0.gain.value = 6;
        const b1 = ctx.createBiquadFilter(); b1.type = 'lowshelf'; b1.frequency.value = 800; b1.gain.value = 3;
        const g   = ctx.createGain(); g.gain.value = 0.3;
        noise.connect(b0); b0.connect(b1); b1.connect(g); g.connect(dest); noise.start();
        nodes.push(noise, b0, b1, g);
        break;
      }

      case 'thunder': {
        // Rain + periodic thunder rumble
        const noise = this._noise(2);
        const bp    = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
        const gr    = ctx.createGain(); gr.gain.value = 0.6;
        noise.connect(bp); bp.connect(gr); gr.connect(dest); noise.start();
        const rumble = () => {
          const rn = this._noise(1);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
          const rg = ctx.createGain(); rg.gain.value = 0;
          rn.connect(lp); lp.connect(rg); rg.connect(dest); rn.start();
          const t = ctx.currentTime;
          rg.gain.linearRampToValueAtTime(1.2, t + 0.1);
          rg.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
          setTimeout(() => { try { rn.stop(); } catch(_){} }, 3000);
        };
        rumble();
        const iv = setInterval(rumble, 8000 + Math.random() * 12000);
        nodes.push(noise, bp, gr, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'stream': {
        // Flowing water stream — higher frequency turbulence
        const noise = this._noise(2);
        const hp    = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
        const bp    = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.4;
        const g     = ctx.createGain(); g.gain.value = 0.5;
        const lfo   = ctx.createOscillator(); lfo.frequency.value = 0.22;
        const lfoG  = ctx.createGain(); lfoG.gain.value = 0.18;
        lfo.connect(lfoG); lfoG.connect(g.gain);
        noise.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
        noise.start(); lfo.start();
        nodes.push(noise, hp, bp, g, lfo, lfoG);
        break;
      }

      case 'night': {
        // Cricket chirping — modulated high-frequency oscillators
        const cricket = () => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = 4200 + Math.random() * 400;
          og.gain.setValueAtTime(0, ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.015);
          og.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.04);
          osc.connect(og); og.connect(dest);
          osc.start(); osc.stop(ctx.currentTime + 0.05);
        };
        const iv = setInterval(() => {
          for (let i = 0; i < 3; i++) setTimeout(cricket, i * 35);
        }, 120 + Math.random() * 80);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'space': {
        // Cosmic drone — deep oscillators + slow filter sweep
        const freqs = [40, 60, 80, 120];
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sawtooth'; osc.frequency.value = f;
          og.gain.value = 0.06 / (i + 1);
          const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + i * 0.01;
          const lg  = ctx.createGain(); lg.gain.value = f * 0.2;
          lfo.connect(lg); lg.connect(osc.frequency);
          osc.connect(og); og.connect(dest);
          osc.start(); lfo.start();
          nodes.push(osc, og, lfo, lg);
        });
        break;
      }

      case 'breath': {
        // Deep breath guide — slow in/out amplitude modulation
        const osc  = ctx.createOscillator();
        const og   = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 110;
        og.gain.value = 0;
        osc.connect(og); og.connect(dest); osc.start();
        let inhale = true;
        const cycle = () => {
          const t   = ctx.currentTime;
          const dur = inhale ? 4 : 6; // 4s in, 6s out
          og.gain.cancelScheduledValues(t);
          og.gain.setValueAtTime(og.gain.value, t);
          og.gain.linearRampToValueAtTime(inhale ? 0.35 : 0.001, t + dur);
          inhale = !inhale;
        };
        cycle();
        const iv = setInterval(cycle, 4500);
        nodes.push(osc, og, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'crystal': {
        // Crystal/glass tones — pure high-frequency sines
        const CRYSTAL_FREQS = [1047, 1319, 1568, 2093, 2637];
        const pulse = () => {
          const f   = CRYSTAL_FREQS[Math.floor(Math.random() * CRYSTAL_FREQS.length)];
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          og.gain.setValueAtTime(0, ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.008);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
          osc.connect(og); og.connect(dest);
          osc.start(); osc.stop(ctx.currentTime + 2.6);
        };
        pulse();
        const iv = setInterval(pulse, 1500 + Math.random() * 2000);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      case 'hz528': {
        // 528 Hz "DNA repair" healing tone + harmonics
        [528, 1056, 264].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          og.gain.value = 0.22 / (i + 1);
          osc.connect(og); og.connect(dest); osc.start();
          nodes.push(osc, og);
        });
        break;
      }

      case 'cafe': {
        // Café ambience: filtered noise + soft chatter + cups
        const noise = this._noise(3);
        const bp    = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.3;
        const g     = ctx.createGain(); g.gain.value = 0.22;
        noise.connect(bp); bp.connect(g); g.connect(dest); noise.start();
        // Subtle cup clinks
        const clink = () => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = 900 + Math.random() * 600;
          og.gain.setValueAtTime(0.06, ctx.currentTime);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc.connect(og); og.connect(dest);
          osc.start(); osc.stop(ctx.currentTime + 0.9);
        };
        const iv = setInterval(clink, 3000 + Math.random() * 5000);
        nodes.push(noise, bp, g, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }
    }

    this.currentNodes = nodes;
  }
}
