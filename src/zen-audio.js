/**
 * CENSOR ENGINE PRO — ZenAudio Engine v2
 * Música ambiental y acústica sintetizada: guitarra (Karplus-Strong),
 * piano (ADSR), flautas, pads, lofi. Sin archivos externos. Offline PWA.
 */
export class ZenAudioEngine {
  constructor() {
    this.audioCtx     = null;
    this.masterGain   = null;
    this.reverbNode   = null;
    this.currentNodes = [];
    this.currentSound = null;
    this.volume       = 0.55;
  }

  _init() {
    if (!this.audioCtx) {
      this.audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.volume;
      // Simple reverb via delay chain
      this.reverbNode = this._buildReverb();
      this.reverbNode.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  /** Schroeder reverb: 4 comb + 2 allpass filters */
  _buildReverb() {
    const ctx = this.audioCtx;
    const sr  = ctx.sampleRate;
    const len = Math.floor(sr * 2.2); // 2.2s impulse
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.18;
    conv.connect(g);
    return g;
  }

  /** Sends to both dry master and reverb */
  _dest(dryGain = 0.7) {
    const ctx = this.audioCtx;
    const dry = ctx.createGain(); dry.gain.value = dryGain;
    dry.connect(this.masterGain);
    const wet = ctx.createGain(); wet.gain.value = 1 - dryGain;
    wet.connect(this.reverbNode);
    // Return a merger node
    const merge = ctx.createChannelMerger ? ctx.createGain() : ctx.createGain();
    merge.connect(dry); merge.connect(wet);
    return merge;
  }

  _noise(duration = 4) {
    const ctx = this.audioCtx;
    const sr  = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(1, len, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    return src;
  }

  /** Karplus-Strong plucked string synthesis */
  _karplusStrong(freq, dur = 3.0, gain = 0.6) {
    const ctx       = this.audioCtx;
    const sr        = ctx.sampleRate;
    const period    = Math.max(2, Math.floor(sr / freq));
    const totalSamp = Math.floor(sr * dur);
    const buf       = ctx.createBuffer(1, totalSamp, sr);
    const d         = buf.getChannelData(0);

    // Seed with noise burst
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;

    // Run filter
    for (let i = 0; i < totalSamp; i++) {
      const j  = i % period;
      const j1 = (i + 1) % period;
      d[i]     = ring[j];
      ring[j1] = (ring[j] + ring[j1]) * 0.498; // averaging filter (dampening)
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(g);
    return { src, gain: g };
  }

  /** Piano tone: sine + harmonics + ADSR */
  _piano(freq, dur = 2.5, vel = 0.5) {
    const ctx   = this.audioCtx;
    const dest  = this._dest(0.6);
    const now   = ctx.currentTime;
    const nodes = [];

    const harmonics = [[1,0.5],[2,0.25],[3,0.12],[4,0.06],[6,0.03]];
    harmonics.forEach(([n, amp]) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = n === 1 ? 'sine' : 'sine';
      osc.frequency.value = freq * n;
      // ADSR: attack 10ms, decay 200ms, sustain 0.3, release
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vel * amp, now + 0.010);
      g.gain.exponentialRampToValueAtTime(vel * amp * 0.35, now + 0.22);
      g.gain.setValueAtTime(vel * amp * 0.35, now + dur - 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g); g.connect(dest);
      osc.start(now); osc.stop(now + dur + 0.1);
      nodes.push(osc, g);
    });
    nodes.push(dest);
    return nodes;
  }

  /** Flute: band-passed noise + sine fundamental */
  _flute(freq, dur = 1.8, vel = 0.4) {
    const ctx  = this.audioCtx;
    const dest = this._dest(0.55);
    const now  = ctx.currentTime;
    const nodes = [];

    // Breath noise
    const noise = this._noise(dur);
    const bp    = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(vel * 0.08, now + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(bp); bp.connect(ng); ng.connect(dest);
    noise.start(now); setTimeout(() => { try { noise.stop(); } catch(_){} }, dur * 1000 + 100);

    // Fundamental
    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    og.gain.setValueAtTime(0, now);
    og.gain.linearRampToValueAtTime(vel * 0.5, now + 0.08);
    og.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(og); og.connect(dest);
    osc.start(now); osc.stop(now + dur + 0.1);
    nodes.push(noise, bp, ng, osc, og, dest);
    return nodes;
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.audioCtx.currentTime, 0.05);
    }
  }

  stop() {
    this.currentNodes.forEach(n => {
      try { n.stop?.(); }      catch(_) {}
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
    const now   = ctx.currentTime;

    switch (soundId) {

      // ── GUITARRA ACÚSTICA (Karplus-Strong arpeggios) ───────────────────────
      case 'guitar': {
        // G major pentatonic: G2 B2 D3 G3 B3 D4
        const GMP = [98.0, 123.5, 146.8, 196.0, 246.9, 293.7];
        const dest = this._dest(0.55);
        const arpChords = [
          [0,2,4], [0,1,3], [0,2,5], [1,3,4]
        ];
        let chordIdx = 0;
        const playChord = () => {
          const chord = arpChords[chordIdx % arpChords.length];
          chordIdx++;
          chord.forEach((noteIdx, i) => {
            setTimeout(() => {
              const { src, gain: g } = this._karplusStrong(GMP[noteIdx], 4.5, 0.55);
              g.connect(dest);
              src.start();
              nodes.push(src, g);
            }, i * 90);
          });
        };
        playChord();
        const iv = setInterval(playChord, 3200);
        nodes.push(dest, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── GUITARRA ESPAÑOLA (Flamenco-style) ────────────────────────────────
      case 'guitar_flamenco': {
        const AMaj = [110.0, 138.6, 164.8, 220.0, 277.2, 329.6];
        const dest  = this._dest(0.5);
        const strums = [[0,1,2,3],[2,3,4,5],[0,2,4,5],[1,3,5]];
        let si = 0;
        const strum = () => {
          const chord = strums[si++ % strums.length];
          chord.forEach((ni, i) => {
            setTimeout(() => {
              const { src, gain: g } = this._karplusStrong(AMaj[ni], 3.8, 0.5 - i * 0.04);
              g.connect(dest);
              src.start();
              nodes.push(src, g);
            }, i * 55);
          });
        };
        strum();
        const iv = setInterval(strum, 2800);
        nodes.push(dest, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── PIANO AMBIENTAL ───────────────────────────────────────────────────
      case 'piano': {
        // C major 7th → Am9 → F maj9 → G9 chord progression
        const progressions = [
          [261.6, 329.6, 392.0, 493.9],  // Cmaj7
          [220.0, 261.6, 329.6, 440.0],  // Am
          [174.6, 220.0, 261.6, 349.2],  // Fmaj
          [196.0, 246.9, 293.7, 392.0],  // G
        ];
        let pi = 0;
        const playChord = () => {
          const chord = progressions[pi++ % progressions.length];
          chord.forEach((freq, i) => {
            const ns = this._piano(freq, 4.5, 0.4 - i * 0.03);
            nodes.push(...ns);
          });
        };
        playChord();
        const iv = setInterval(playChord, 4800);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── PIANO LLUVIA (Lo-fi chill piano) ─────────────────────────────────
      case 'piano_lofi': {
        // Single notes melody + rain bg
        const MELODY = [261.6, 293.7, 329.6, 349.2, 392.0, 329.6, 293.7, 261.6];
        let mi = 0;
        const playNote = () => {
          const ns = this._piano(MELODY[mi++ % MELODY.length], 2.0, 0.35);
          nodes.push(...ns);
        };
        playNote();
        const iv = setInterval(playNote, 700);
        // Rain background
        const noise = this._noise(2);
        const bp    = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
        const rg = ctx.createGain(); rg.gain.value = 0.12;
        noise.connect(bp); bp.connect(rg); rg.connect(this.masterGain);
        noise.start();
        nodes.push(noise, bp, rg, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── FLAUTA AMBIENTAL ──────────────────────────────────────────────────
      case 'flute': {
        // Pentatonic scale D4 E4 G4 A4 B4 D5
        const PEN = [293.7, 329.6, 392.0, 440.0, 493.9, 587.3];
        const PHRASING = [[0,2,4],[1,3],[0,1,2,3],[2,4,5],[0,3,5],[1,2,4]];
        let fi = 0;
        const phrase = () => {
          const seq = PHRASING[fi++ % PHRASING.length];
          seq.forEach((noteIdx, i) => {
            setTimeout(() => {
              const ns = this._flute(PEN[noteIdx], 1.5 + Math.random(), 0.42);
              nodes.push(...ns);
            }, i * 420 + Math.random() * 80);
          });
        };
        phrase();
        const iv = setInterval(phrase, 3500 + Math.random() * 1500);
        nodes.push({ stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── PAD AMBIENTAL (Warm ambient chords) ───────────────────────────────
      case 'ambient': {
        // Lush warm sawtooth pad through LPF + reverb
        const FREQS  = [55, 82.4, 110, 130.8, 164.8]; // A1 E2 A2 C3 E3
        const dest   = this._dest(0.35);
        const lp     = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        lp.connect(dest);
        FREQS.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const og  = ctx.createGain();
          osc.type  = i < 2 ? 'sawtooth' : 'sine';
          osc.frequency.value = f + Math.random() * 0.3; // slight detune
          og.gain.setValueAtTime(0, now);
          og.gain.linearRampToValueAtTime(0.06 / (i+1), now + 3.5);
          const lfo  = ctx.createOscillator();
          const lfoG = ctx.createGain();
          lfo.frequency.value = 0.08 + i * 0.03;
          lfoG.gain.value = 0.5;
          lfo.connect(lfoG); lfoG.connect(osc.frequency);
          osc.connect(og); og.connect(lp);
          osc.start(); lfo.start();
          nodes.push(osc, og, lfo, lfoG);
        });
        nodes.push(lp, dest);
        break;
      }

      // ── LOFI BEAT (Drums + pad + guitar) ─────────────────────────────────
      case 'lofi': {
        const dest = this._dest(0.65);
        // Kick drum
        const kick = () => {
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.frequency.setValueAtTime(160, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.12);
          g.gain.setValueAtTime(0.8, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(g); g.connect(dest); osc.start(); osc.stop(ctx.currentTime + 0.3);
        };
        // Snare (noise burst)
        const snare = () => {
          const n = this._noise(0.15); const g = ctx.createGain();
          const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1200;
          g.gain.setValueAtTime(0.5, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          n.connect(hp); hp.connect(g); g.connect(dest); n.start();
          setTimeout(() => { try { n.stop(); } catch(_){} }, 200);
          nodes.push(n, hp, g);
        };
        // Hi-hat
        const hihat = (vol=0.15) => {
          const n = this._noise(0.05); const g = ctx.createGain();
          const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=8000;
          g.gain.setValueAtTime(vol, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
          n.connect(hp); hp.connect(g); g.connect(dest); n.start();
          setTimeout(() => { try { n.stop(); } catch(_){} }, 100);
          nodes.push(n, hp, g);
        };
        // BPM 75 pattern: K _ _ S _ K _ S (lofi feel)
        const BPM  = 75;
        const beat = 60 / BPM * 1000;
        let step   = 0;
        const pattern = [1,0,0,1.5,0,1,0,1.5]; // 1=kick, 1.5=snare, 0=rest
        const hats    = [1,1,0,1,1,1,0,1]; // hi-hat pattern
        const iv = setInterval(() => {
          const s = step % 8;
          if (pattern[s] === 1) kick();
          if (pattern[s] === 1.5) snare();
          if (hats[s]) hihat(s % 2 === 0 ? 0.18 : 0.1);
          step++;
        }, beat / 2);
        // Simple bass: Karplus-Strong root notes
        const bassNote = () => {
          const { src, gain: g } = this._karplusStrong(55 * (Math.random() > 0.7 ? 1.5 : 1), 1.2, 0.7);
          g.connect(dest); src.start();
          nodes.push(src, g);
        };
        bassNote();
        const biv = setInterval(bassNote, beat * 4);
        nodes.push(dest, { stop: () => { clearInterval(iv); clearInterval(biv); }, disconnect: () => {} });
        break;
      }

      // ── CUENCOS TIBETANOS (Singing bowls) ─────────────────────────────────
      case 'bowl': {
        const dest = this._dest(0.4);
        const BOWL_FREQS = [256, 384, 512, 640]; // C4, G4, C5, E5
        const ringBowl = () => {
          BOWL_FREQS.forEach((f, i) => {
            const osc = ctx.createOscillator(); const og = ctx.createGain();
            osc.type='sine'; osc.frequency.value = f;
            // Slight wobble for authentic bowl sound
            const lfo = ctx.createOscillator(); const lg = ctx.createGain();
            lfo.frequency.value = 5.5; lg.gain.value = 0.8;
            lfo.connect(lg); lg.connect(osc.frequency);
            og.gain.setValueAtTime(0.3/(i+1), ctx.currentTime);
            og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 9);
            osc.connect(og); og.connect(dest);
            osc.start(); lfo.start();
            osc.stop(ctx.currentTime + 9.2); lfo.stop(ctx.currentTime + 9.2);
            nodes.push(osc, og, lfo, lg);
          });
        };
        ringBowl();
        const iv = setInterval(ringBowl, 10500);
        nodes.push(dest, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── CAMPANAS DE VIENTO ────────────────────────────────────────────────
      case 'bells': {
        const dest = this._dest(0.3);
        const BELL_NOTES = [523.2, 659.3, 783.9, 1046.5, 1318.5, 1568.0];
        const chime = () => {
          const f = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
          const { src, gain: g } = this._karplusStrong(f, 3.5, 0.35);
          // Karplus-Strong gives a natural bell-like decay
          g.connect(dest); src.start();
          nodes.push(src, g);
        };
        chime();
        const iv = setInterval(chime, 1800 + Math.random() * 2800);
        nodes.push(dest, { stop: () => clearInterval(iv), disconnect: () => {} });
        break;
      }

      // ── OM / DRONE ────────────────────────────────────────────────────────
      case 'om': {
        const dest = this._dest(0.45);
        const OM   = 136.1; // C#3
        [[1,0.4,'sawtooth'],[1.5,0.22,'sine'],[2,0.15,'sine'],[3,0.07,'sine']].forEach(([r,v,t]) => {
          const osc = ctx.createOscillator(); const og = ctx.createGain();
          const lp  = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
          osc.type = t; osc.frequency.value = OM * r; og.gain.value = v;
          og.gain.setValueAtTime(0, now); og.gain.linearRampToValueAtTime(v, now + 3);
          osc.connect(og); og.connect(lp); lp.connect(dest);
          osc.start(); nodes.push(osc, og, lp);
        });
        nodes.push(dest); break;
      }

      // ── BINAURAL ALPHA ────────────────────────────────────────────────────
      case 'binaural': {
        [['left',200],['right',210]].forEach(([side, freq]) => {
          const osc = ctx.createOscillator(); const og = ctx.createGain();
          const pan = ctx.createStereoPanner();
          osc.type='sine'; osc.frequency.value = freq;
          og.gain.value = 0.28; pan.pan.value = side==='left' ? -1 : 1;
          osc.connect(og); og.connect(pan); pan.connect(this.masterGain);
          osc.start(); nodes.push(osc, og, pan);
        }); break;
      }

      // ── LLUVIA ────────────────────────────────────────────────────────────
      case 'rain': {
        const noise = this._noise(2);
        const bp1   = ctx.createBiquadFilter(); bp1.type='bandpass'; bp1.frequency.value=1800; bp1.Q.value=0.7;
        const bp2   = ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=3800; bp2.Q.value=1.2;
        const g     = ctx.createGain(); g.gain.value=0.65;
        noise.connect(bp1); bp1.connect(g);
        noise.connect(bp2); bp2.connect(g);
        g.connect(this.masterGain); noise.start();
        nodes.push(noise, bp1, bp2, g); break;
      }

      // ── OCÉANO ────────────────────────────────────────────────────────────
      case 'ocean': {
        const noise = this._noise(5);
        const lp    = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=700;
        const g     = ctx.createGain(); g.gain.value=0.6;
        const lfo   = ctx.createOscillator(); lfo.frequency.value=0.1;
        const lfoG  = ctx.createGain(); lfoG.gain.value=0.3;
        lfo.connect(lfoG); lfoG.connect(g.gain);
        noise.connect(lp); lp.connect(g); g.connect(this.masterGain);
        noise.start(); lfo.start();
        nodes.push(noise, lp, g, lfo, lfoG); break;
      }

      // ── BOSQUE ────────────────────────────────────────────────────────────
      case 'forest': {
        const noise = this._noise(3);
        const lp    = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1100;
        const g     = ctx.createGain(); g.gain.value=0.18;
        noise.connect(lp); lp.connect(g); g.connect(this.masterGain); noise.start();
        const chirp = () => {
          const f=2200+Math.random()*2000; const osc=ctx.createOscillator(); const og=ctx.createGain();
          osc.frequency.value=f; og.gain.setValueAtTime(0,ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.18, ctx.currentTime+0.04);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.25);
          osc.connect(og); og.connect(this.masterGain);
          osc.start(); osc.stop(ctx.currentTime+0.3);
        };
        const iv = setInterval(chirp, 900+Math.random()*2200);
        nodes.push(noise, lp, g, { stop: ()=>clearInterval(iv), disconnect:()=>{} }); break;
      }

      // ── VIENTO ────────────────────────────────────────────────────────────
      case 'wind': {
        const noise = this._noise(3);
        const bp    = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=500; bp.Q.value=0.25;
        const g     = ctx.createGain(); g.gain.value=0.5;
        const lfo   = ctx.createOscillator(); lfo.frequency.value=0.06;
        const lfoF  = ctx.createGain(); lfoF.gain.value=180;
        lfo.connect(lfoF); lfoF.connect(bp.frequency);
        noise.connect(bp); bp.connect(g); g.connect(this.masterGain);
        noise.start(); lfo.start();
        nodes.push(noise, bp, g, lfo, lfoF); break;
      }

      // ── TORMENTA ──────────────────────────────────────────────────────────
      case 'thunder': {
        const noise = this._noise(2);
        const bp    = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1800; bp.Q.value=0.8;
        const gr    = ctx.createGain(); gr.gain.value=0.6;
        noise.connect(bp); bp.connect(gr); gr.connect(this.masterGain); noise.start();
        const rumble = () => {
          const rn=this._noise(1); const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=120;
          const rg=ctx.createGain(); rg.gain.value=0;
          rn.connect(lp); lp.connect(rg); rg.connect(this.masterGain); rn.start();
          const t=ctx.currentTime;
          rg.gain.linearRampToValueAtTime(1.2, t+0.1);
          rg.gain.exponentialRampToValueAtTime(0.001, t+2.5);
          setTimeout(()=>{ try{rn.stop();}catch(_){} }, 3000);
        };
        rumble();
        const iv=setInterval(rumble, 8000+Math.random()*12000);
        nodes.push(noise, bp, gr, { stop:()=>clearInterval(iv), disconnect:()=>{} }); break;
      }

      // ── ARROYO ────────────────────────────────────────────────────────────
      case 'stream': {
        const noise = this._noise(2);
        const hp    = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=800;
        const bp    = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2500; bp.Q.value=0.4;
        const g     = ctx.createGain(); g.gain.value=0.5;
        const lfo   = ctx.createOscillator(); lfo.frequency.value=0.22;
        const lfoG  = ctx.createGain(); lfoG.gain.value=0.18;
        lfo.connect(lfoG); lfoG.connect(g.gain);
        noise.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.masterGain);
        noise.start(); lfo.start();
        nodes.push(noise, hp, bp, g, lfo, lfoG); break;
      }

      // ── FUEGO ─────────────────────────────────────────────────────────────
      case 'fire': {
        const noise=this._noise(2); const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
        const g=ctx.createGain(); g.gain.value=0.4;
        const iv=setInterval(()=>{ g.gain.setTargetAtTime(0.28+Math.random()*0.28, ctx.currentTime, 0.04+Math.random()*0.1); }, 80+Math.random()*180);
        noise.connect(lp); lp.connect(g); g.connect(this.masterGain); noise.start();
        nodes.push(noise, lp, g, { stop:()=>clearInterval(iv), disconnect:()=>{} }); break;
      }

      // ── RUIDO BLANCO ──────────────────────────────────────────────────────
      case 'whitenoise': {
        const noise=this._noise(2); const g=ctx.createGain(); g.gain.value=0.55;
        noise.connect(g); g.connect(this.masterGain); noise.start();
        nodes.push(noise, g); break;
      }

      // ── RUIDO ROSA ────────────────────────────────────────────────────────
      case 'pinknoise': {
        const noise=this._noise(2);
        const b0=ctx.createBiquadFilter(); b0.type='lowshelf'; b0.frequency.value=200; b0.gain.value=6;
        const b1=ctx.createBiquadFilter(); b1.type='lowshelf'; b1.frequency.value=800; b1.gain.value=3;
        const g=ctx.createGain(); g.gain.value=0.3;
        noise.connect(b0); b0.connect(b1); b1.connect(g); g.connect(this.masterGain); noise.start();
        nodes.push(noise, b0, b1, g); break;
      }

      // ── NOCHE / GRILLOS ───────────────────────────────────────────────────
      case 'night': {
        const cricket=()=>{
          const osc=ctx.createOscillator(); const og=ctx.createGain();
          osc.type='sine'; osc.frequency.value=4200+Math.random()*400;
          og.gain.setValueAtTime(0,ctx.currentTime);
          og.gain.linearRampToValueAtTime(0.06, ctx.currentTime+0.015);
          og.gain.linearRampToValueAtTime(0, ctx.currentTime+0.04);
          osc.connect(og); og.connect(this.masterGain);
          osc.start(); osc.stop(ctx.currentTime+0.05);
        };
        const iv=setInterval(()=>{ for(let i=0;i<3;i++) setTimeout(cricket, i*35); }, 120+Math.random()*80);
        nodes.push({ stop:()=>clearInterval(iv), disconnect:()=>{} }); break;
      }

      // ── ESPACIO CÓSMICO ───────────────────────────────────────────────────
      case 'space': {
        const dest=this._dest(0.3);
        [40,60,80,120].forEach((f,i)=>{
          const osc=ctx.createOscillator(); const og=ctx.createGain();
          osc.type='sawtooth'; osc.frequency.value=f; og.gain.value=0.06/(i+1);
          const lfo=ctx.createOscillator(); const lg=ctx.createGain();
          lfo.frequency.value=0.03+i*0.01; lg.gain.value=f*0.2;
          lfo.connect(lg); lg.connect(osc.frequency);
          osc.connect(og); og.connect(dest);
          osc.start(); lfo.start(); nodes.push(osc,og,lfo,lg);
        });
        nodes.push(dest); break;
      }

      // ── RESPIRACIÓN ───────────────────────────────────────────────────────
      case 'breath': {
        const osc=ctx.createOscillator(); const og=ctx.createGain();
        osc.type='sine'; osc.frequency.value=110; og.gain.value=0;
        osc.connect(og); og.connect(this.masterGain); osc.start();
        let inhale=true;
        const cycle=()=>{
          const t=ctx.currentTime; const dur=inhale?4:6;
          og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value,t);
          og.gain.linearRampToValueAtTime(inhale?0.35:0.001, t+dur); inhale=!inhale;
        };
        cycle();
        const iv=setInterval(cycle, 4500);
        nodes.push(osc, og, { stop:()=>clearInterval(iv), disconnect:()=>{} }); break;
      }

      // ── 528 Hz SOLFEGGIO ─────────────────────────────────────────────────
      case 'hz528': {
        const dest=this._dest(0.4);
        [528,1056,264].forEach((f,i)=>{
          const osc=ctx.createOscillator(); const og=ctx.createGain();
          osc.type='sine'; osc.frequency.value=f; og.gain.value=0.22/(i+1);
          osc.connect(og); og.connect(dest); osc.start(); nodes.push(osc,og);
        });
        nodes.push(dest); break;
      }

      // ── CAFÉ ──────────────────────────────────────────────────────────────
      case 'cafe': {
        const noise=this._noise(3);
        const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1200; bp.Q.value=0.3;
        const g=ctx.createGain(); g.gain.value=0.22;
        noise.connect(bp); bp.connect(g); g.connect(this.masterGain); noise.start();
        const clink=()=>{
          const { src, gain: sg } = this._karplusStrong(900+Math.random()*600, 0.8, 0.12);
          sg.connect(this.masterGain); src.start(); nodes.push(src, sg);
        };
        const iv=setInterval(clink, 3000+Math.random()*5000);
        nodes.push(noise, bp, g, { stop:()=>clearInterval(iv), disconnect:()=>{} }); break;
      }
    }

    this.currentNodes = nodes;
  }
}
