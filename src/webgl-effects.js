/**
 * CENSOR ENGINE PRO — WebGL Effects Engine
 * Renders creative visual effects via GLSL shaders on top of the composite frame.
 * Pipeline: 2D composite canvas → WebGL texture → shader → display canvas
 */

// ──────────────────────────────────────────────────────────────────────────────
// GLSL SHADERS
// ──────────────────────────────────────────────────────────────────────────────
const VERT_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord  = a_texCoord;
  }
`;

const FRAG_PASSTHROUGH = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_texCoord;
  void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
  }
`;

const FRAG_WARM = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    vec3 warm = vec3(
      min(c.r * 1.22, 1.0),
      min(c.g * 1.06, 1.0),
      max(c.b * 0.78, 0.0)
    );
    gl_FragColor = vec4(mix(c.rgb, warm, u_intensity), c.a);
  }
`;

const FRAG_COLD = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    vec3 cold = vec3(
      max(c.r * 0.80, 0.0),
      min(c.g * 1.03, 1.0),
      min(c.b * 1.30, 1.0)
    );
    gl_FragColor = vec4(mix(c.rgb, cold, u_intensity), c.a);
  }
`;

const FRAG_CINEMATIC = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    // Desaturate
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 desat = mix(c.rgb, vec3(lum), 0.25);
    // Crush blacks, lift midtones
    desat = max(desat - 0.05, 0.0);
    desat = pow(desat, vec3(0.92));
    // Subtle teal shadows / orange highlights
    vec3 shadows  = vec3(0.0, 0.04, 0.08);
    vec3 hilight  = vec3(0.06, 0.02, 0.0);
    desat += shadows * (1.0 - lum) * 0.5;
    desat += hilight * lum * 0.5;
    // Vignette
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.6, uv * 1.6);
    vign = clamp(vign, 0.35, 1.0);
    desat *= vign;
    gl_FragColor = vec4(mix(c.rgb, desat, u_intensity), c.a);
  }
`;

const FRAG_NEON = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform float     u_time;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // High contrast base
    vec3 high = pow(c.rgb, vec3(1.4));
    // Neon color shift: push into cyan/magenta
    vec3 neon = vec3(
      high.r * 0.6 + high.b * 0.4,
      high.g * 0.9,
      high.b * 0.7 + high.r * 0.3
    );
    // Scanline flicker for aesthetic
    float scan = 1.0 - 0.04 * mod(gl_FragCoord.y + u_time * 30.0, 4.0);
    neon *= scan;
    // Edge glow
    float edge = 1.0 - lum;
    neon += vec3(0.0, edge * 0.15, edge * 0.15);
    gl_FragColor = vec4(mix(c.rgb, neon, u_intensity), c.a);
  }
`;

const FRAG_NOIR = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // High contrast B&W
    float contrast = (lum - 0.5) * 1.5 + 0.5;
    contrast = clamp(contrast, 0.0, 1.0);
    // Film grain
    float grain = fract(sin(dot(v_texCoord, vec2(12.9898, 78.233))) * 43758.5453);
    contrast += (grain - 0.5) * 0.04;
    // Vignette
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.8, uv * 1.8);
    vign = clamp(vign, 0.2, 1.0);
    contrast *= vign;
    vec3 noir = vec3(contrast);
    gl_FragColor = vec4(mix(c.rgb, noir, u_intensity), c.a);
  }
`;

const FRAG_VHS = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform float     u_time;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
  void main() {
    vec2 uv = v_texCoord;
    // Horizontal scan glitch
    float glitch = sin(uv.y * 80.0 + u_time * 5.0) * 0.003;
    glitch += rand(vec2(floor(uv.y * 40.0), floor(u_time * 3.0))) * 0.005;
    // Chromatic aberration
    vec4 cr = texture2D(u_texture, uv + vec2(glitch + 0.004, 0.0));
    vec4 cg = texture2D(u_texture, uv + vec2(glitch, 0.0));
    vec4 cb = texture2D(u_texture, uv + vec2(glitch - 0.004, 0.0));
    vec4 c  = vec4(cr.r, cg.g, cb.b, cg.a);
    // Scanlines
    float scan = 1.0 - 0.15 * mod(gl_FragCoord.y, 2.0);
    c.rgb *= scan;
    // Noise
    float noise = rand(uv + u_time * 0.01) * 0.05;
    c.rgb += noise;
    // Color bleed (warm tint)
    c.r = min(c.r * 1.1, 1.0);
    c.b = max(c.b * 0.85, 0.0);
    // Vignette
    vec2 vig = uv - 0.5;
    float vign = 1.0 - dot(vig * 1.5, vig * 1.5);
    c.rgb *= clamp(vign, 0.4, 1.0);
    gl_FragColor = vec4(mix(texture2D(u_texture, v_texCoord).rgb, c.rgb, u_intensity), c.a);
  }
`;

const FRAG_FLARE = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform float     u_time;
  uniform vec2      u_flarePos;   // 0..1 normalized position
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    vec2 uv     = v_texCoord;
    vec2 fPos   = u_flarePos;
    vec2 delta  = uv - fPos;
    float dist  = length(delta);

    // Core glow
    float glow  = 0.04 / (dist * 8.0 + 0.01);

    // Horizontal streak
    float strX  = pow(max(0.0, 1.0 - abs(delta.y) * 60.0), 2.0) * 0.15 / (dist + 0.02);

    // Anamorphic diagonal streaks
    float angle = atan(delta.y, delta.x);
    float streak1 = pow(max(0.0, 1.0 - abs(sin(angle - 0.2)) * 8.0), 3.0) * 0.08 / (dist + 0.02);
    float streak2 = pow(max(0.0, 1.0 - abs(sin(angle + 0.2)) * 8.0), 3.0) * 0.08 / (dist + 0.02);

    // Ghost flares along axis
    vec2 axis = fPos - 0.5;
    float ghost1 = 0.015 / (length(uv - (0.5 - axis * 0.6)) + 0.04);
    float ghost2 = 0.010 / (length(uv - (0.5 - axis * 1.2)) + 0.06);
    float ghost3 = 0.008 / (length(uv - (0.5 + axis * 0.4)) + 0.08);

    float flare = glow + strX + streak1 + streak2 + ghost1 + ghost2 + ghost3;
    flare = clamp(flare, 0.0, 1.0) * u_intensity;

    // Chromatic split on the flare
    vec3 flareColor = vec3(flare * 1.0, flare * 0.85, flare * 0.6);
    c.rgb += flareColor;
    c.rgb = clamp(c.rgb, 0.0, 1.0);
    gl_FragColor = c;
  }
`;

const FRAG_GLITCH = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform float     u_time;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
  void main() {
    vec2 uv = v_texCoord;
    float t = floor(u_time * 8.0);
    // Random horizontal slice glitch
    float sliceY = floor(rand(vec2(t, 0.0)) * 8.0) / 8.0;
    float sliceH = 0.05 + rand(vec2(t, 1.0)) * 0.08;
    float inSlice = step(sliceY, uv.y) * step(uv.y, sliceY + sliceH);
    float shift = (rand(vec2(t, 2.0)) - 0.5) * 0.12 * u_intensity;
    uv.x += shift * inSlice;
    uv.x  = fract(uv.x);
    // Chromatic aberration
    float ca = 0.006 * u_intensity;
    vec4 cr = texture2D(u_texture, vec2(uv.x + ca, uv.y));
    vec4 cg = texture2D(u_texture, uv);
    vec4 cb = texture2D(u_texture, vec2(uv.x - ca, uv.y));
    vec4 c  = vec4(cr.r, cg.g, cb.b, cg.a);
    // Scanlines
    float scan = 1.0 - 0.12 * mod(gl_FragCoord.y, 2.0);
    c.rgb *= scan;
    // Noise burst in glitch zones
    float noise = rand(uv + u_time) * 0.18 * inSlice * u_intensity;
    c.rgb = clamp(c.rgb + vec3(noise, noise * 0.3, noise * 0.8), 0.0, 1.0);
    vec4 orig = texture2D(u_texture, v_texCoord);
    gl_FragColor = vec4(mix(orig.rgb, c.rgb, u_intensity), orig.a);
  }
`;

const FRAG_DREAM = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  void main() {
    vec4 c    = texture2D(u_texture, v_texCoord);
    float asp = u_resolution.x / u_resolution.y;
    // Soft bloom: sample nearby pixels and accumulate bright values
    vec3 bloom = vec3(0.0);
    float R = 6.0 / u_resolution.y;
    float total = 0.0;
    for (int i = -4; i <= 4; i++) {
      for (int j = -4; j <= 4; j++) {
        float fi = float(i); float fj = float(j);
        float w = exp(-(fi*fi + fj*fj) * 0.12);
        vec4 s = texture2D(u_texture, v_texCoord + vec2(fi * R / asp, fj * R));
        float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
        bloom += s.rgb * w * max(lum - 0.5, 0.0) * 3.0;
        total += w;
      }
    }
    bloom /= total;
    // Gentle desaturation
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 desat = mix(c.rgb, vec3(lum), 0.25);
    // Warm pastel tint
    vec3 dream = desat + bloom * 1.4;
    dream.r = min(dream.r * 1.06, 1.0);
    dream.b = min(dream.b * 1.04, 1.0);
    // Vignette (soft)
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.2, uv * 1.2);
    vign = clamp(vign, 0.55, 1.0);
    dream *= vign;
    gl_FragColor = vec4(mix(c.rgb, dream, u_intensity), c.a);
  }
`;

const FRAG_SEPIA = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c    = texture2D(u_texture, v_texCoord);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 sepia = vec3(
      clamp(lum * 1.07 + 0.12, 0.0, 1.0),
      clamp(lum * 0.92 + 0.04, 0.0, 1.0),
      clamp(lum * 0.78 - 0.03, 0.0, 1.0)
    );
    // Soft vignette
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.6, uv * 1.6);
    sepia *= clamp(vign, 0.4, 1.0);
    // Slight grain
    float grain = fract(sin(dot(v_texCoord, vec2(127.1, 311.7))) * 43758.55) * 0.03;
    sepia += grain;
    gl_FragColor = vec4(mix(c.rgb, sepia, u_intensity), c.a);
  }
`;

const FRAG_NEGATIVE = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c   = texture2D(u_texture, v_texCoord);
    vec3 neg = 1.0 - c.rgb;
    gl_FragColor = vec4(mix(c.rgb, neg, u_intensity), c.a);
  }
`;

const FRAG_MATRIX = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform float     u_time;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    // Green channel dominant (matrix look)
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 mat = vec3(0.0, lum * 1.3, lum * 0.18);
    // Falling "rain" columns of brightness
    float col    = floor(v_texCoord.x * 40.0);
    float speed  = 0.8 + rand(vec2(col, 0.0)) * 1.2;
    float offset = rand(vec2(col, 1.0));
    float rain   = fract(v_texCoord.y - u_time * speed + offset);
    float glow   = pow(rain, 8.0) * 0.6;
    mat.g  = clamp(mat.g + glow, 0.0, 1.0);
    // Scanlines
    float scan = 1.0 - 0.1 * mod(gl_FragCoord.y, 2.0);
    mat *= scan;
    // Slight vignette
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.5, uv * 1.5);
    mat *= clamp(vign, 0.5, 1.0);
    gl_FragColor = vec4(mix(c.rgb, mat, u_intensity), c.a);
  }
`;

const FRAG_SUNSET = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c   = texture2D(u_texture, v_texCoord);
    float y  = v_texCoord.y;
    // Gradient: warm orange at top, deep purple at bottom
    vec3 sunTop = vec3(1.0, 0.45, 0.1);
    vec3 sunBot = vec3(0.35, 0.0, 0.45);
    vec3 grad   = mix(sunTop, sunBot, y);
    // Blend with source using screen mode for highlights
    vec3 screen = 1.0 - (1.0 - c.rgb) * (1.0 - grad * 0.6);
    // Boost saturation slightly
    float lum = dot(screen, vec3(0.299, 0.587, 0.114));
    screen = mix(vec3(lum), screen, 1.3);
    // Vignette
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.4, uv * 1.4);
    screen *= clamp(vign, 0.45, 1.0);
    screen  = clamp(screen, 0.0, 1.0);
    gl_FragColor = vec4(mix(c.rgb, screen, u_intensity), c.a);
  }
`;

const FRAG_INFRARED = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  varying vec2 v_texCoord;
  void main() {
    vec4 c    = texture2D(u_texture, v_texCoord);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // False-color heat map: blue(cold) -> cyan -> green -> yellow -> red -> white(hot)
    vec3 ir;
    if      (lum < 0.2)  ir = mix(vec3(0.0,0.0,0.5), vec3(0.0,0.0,1.0), lum / 0.2);
    else if (lum < 0.4)  ir = mix(vec3(0.0,0.0,1.0), vec3(0.0,1.0,1.0), (lum - 0.2) / 0.2);
    else if (lum < 0.6)  ir = mix(vec3(0.0,1.0,1.0), vec3(0.0,1.0,0.0), (lum - 0.4) / 0.2);
    else if (lum < 0.8)  ir = mix(vec3(0.0,1.0,0.0), vec3(1.0,1.0,0.0), (lum - 0.6) / 0.2);
    else                  ir = mix(vec3(1.0,1.0,0.0), vec3(1.0,1.0,1.0), (lum - 0.8) / 0.2);
    gl_FragColor = vec4(mix(c.rgb, ir, u_intensity), c.a);
  }
`;

const FRAG_SKETCH = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    vec2 px = 1.0 / u_resolution;
    // Sobel edge detection
    float gx = (
      -1.0 * texture2D(u_texture, v_texCoord + px * vec2(-1,-1)).r +
       1.0 * texture2D(u_texture, v_texCoord + px * vec2( 1,-1)).r +
      -2.0 * texture2D(u_texture, v_texCoord + px * vec2(-1, 0)).r +
       2.0 * texture2D(u_texture, v_texCoord + px * vec2( 1, 0)).r +
      -1.0 * texture2D(u_texture, v_texCoord + px * vec2(-1, 1)).r +
       1.0 * texture2D(u_texture, v_texCoord + px * vec2( 1, 1)).r
    );
    float gy = (
      -1.0 * texture2D(u_texture, v_texCoord + px * vec2(-1,-1)).r +
      -2.0 * texture2D(u_texture, v_texCoord + px * vec2( 0,-1)).r +
      -1.0 * texture2D(u_texture, v_texCoord + px * vec2( 1,-1)).r +
       1.0 * texture2D(u_texture, v_texCoord + px * vec2(-1, 1)).r +
       2.0 * texture2D(u_texture, v_texCoord + px * vec2( 0, 1)).r +
       1.0 * texture2D(u_texture, v_texCoord + px * vec2( 1, 1)).r
    );
    float edge = clamp(sqrt(gx*gx + gy*gy) * 4.0, 0.0, 1.0);
    // Paper-white background + pencil lines
    float lum  = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 paper = vec3(0.96, 0.94, 0.90);
    vec3 sketch = mix(paper, vec3(0.1, 0.1, 0.12), edge);
    // Subtle original color bleed
    sketch = mix(sketch, sketch * (0.5 + c.rgb * 0.6), 0.2);
    gl_FragColor = vec4(mix(c.rgb, sketch, u_intensity), c.a);
  }
`;

const FRAG_BOKEH = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float     u_intensity;
  uniform vec2      u_resolution;
  varying vec2 v_texCoord;
  void main() {
    vec4 c = texture2D(u_texture, v_texCoord);
    float aspect = u_resolution.x / u_resolution.y;

    // Highlight bloom: accumulate bright pixels in a hexagonal pattern
    vec4 bloom = vec4(0.0);
    float total = 0.0;
    float R = 4.0 / u_resolution.y;

    for (int i = -3; i <= 3; i++) {
      for (int j = -3; j <= 3; j++) {
        // Hexagonal mask
        float fi = float(i);
        float fj = float(j);
        if (abs(fi) + abs(fj) > 4.0) continue;
        vec2 off = vec2(fi * R / aspect, fj * R);
        vec4 s = texture2D(u_texture, v_texCoord + off);
        float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
        float w = pow(max(lum - 0.55, 0.0), 1.5) + 0.01;
        bloom += s * w;
        total += w;
      }
    }
    if (total > 0.0) bloom /= total;

    // Vignette to strengthen center sharpness illusion
    vec2 uv = v_texCoord - 0.5;
    float vign = 1.0 - dot(uv * 1.2, uv * 1.2);
    vign = clamp(vign, 0.5, 1.0);

    vec3 result = c.rgb + bloom.rgb * u_intensity * 0.6;
    result *= vign;
    gl_FragColor = vec4(clamp(result, 0.0, 1.0), c.a);
  }
`;

// Shader registry
const SHADERS = {
  none:      { frag: FRAG_PASSTHROUGH },
  warm:      { frag: FRAG_WARM        },
  cold:      { frag: FRAG_COLD        },
  cinematic: { frag: FRAG_CINEMATIC   },
  neon:      { frag: FRAG_NEON        },
  noir:      { frag: FRAG_NOIR        },
  vhs:       { frag: FRAG_VHS         },
  flare:     { frag: FRAG_FLARE       },
  bokeh:     { frag: FRAG_BOKEH       },
  glitch:    { frag: FRAG_GLITCH      },
  dream:     { frag: FRAG_DREAM       },
  sepia:     { frag: FRAG_SEPIA       },
  negative:  { frag: FRAG_NEGATIVE    },
  matrix:    { frag: FRAG_MATRIX      },
  sunset:    { frag: FRAG_SUNSET      },
  infrared:  { frag: FRAG_INFRARED    },
  sketch:    { frag: FRAG_SKETCH      },
};

// ──────────────────────────────────────────────────────────────────────────────
export class WebGLEffectsEngine {
  constructor(canvas) {
    this.canvas   = canvas;
    this.gl       = null;
    this.programs = {};
    this.texture  = null;
    this.vao      = null;

    // State
    this.currentEffect = 'none';
    this.intensity     = 0.8;
    this.flarePos      = { x: 0.75, y: 0.25 };
    this.startTime     = performance.now();

    // Color correction uniforms (applied in color CC pass conceptually via CSS filter fallback)
    this.colorCorrection = {
      brightness: 0,
      contrast:   0,
      saturation: 0,
      exposure:   0,
      vignette:   0,
      sharpen:    0,
    };

    // Overlay text layers
    this.textLayers = [];
  }

  init() {
    const gl = this.canvas.getContext('webgl', {
      alpha:                 false,
      antialias:             false,
      powerPreference:       'high-performance',
      preserveDrawingBuffer: true,  // needed for MediaRecorder + screenshot
    });

    if (!gl) throw new Error('WebGL not supported in this browser.');
    this.gl = gl;

    // Compile all shader programs
    for (const [name, def] of Object.entries(SHADERS)) {
      this.programs[name] = this._createProgram(gl, VERT_SHADER, def.frag);
    }

    // Fullscreen quad: positions [-1,1] and UVs [0,1]
    const positions = new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
       1,  1,  1, 0,
    ]);

    this._quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create reusable texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return this;
  }

  /**
   * Render a frame through the current effect shader.
   * @param {HTMLCanvasElement|HTMLVideoElement} source - input frame
   */
  renderFrame(source) {
    const gl = this.gl;
    if (!gl) return;

    // Sync canvas size to source
    const w = source.width  || source.videoWidth  || 1920;
    const h = source.height || source.videoHeight || 1080;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
    }
    // ALWAYS reset viewport — changing canvas.width/height preserves all GL state
    // (including the old viewport), so we must explicitly sync it every frame.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Upload source as texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (_) { return; }

    const prog = this.programs[this.currentEffect] || this.programs['none'];
    gl.useProgram(prog);

    // Bind quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    const aPos = gl.getAttribLocation(prog, 'a_position');
    const aTex = gl.getAttribLocation(prog, 'a_texCoord');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

    // Bind texture
    gl.uniform1i(gl.getUniformLocation(prog, 'u_texture'), 0);

    // Set common uniforms
    const tLoc = gl.getUniformLocation(prog, 'u_time');
    if (tLoc) gl.uniform1f(tLoc, (performance.now() - this.startTime) / 1000.0);

    const iLoc = gl.getUniformLocation(prog, 'u_intensity');
    if (iLoc) gl.uniform1f(iLoc, this.intensity);

    const rLoc = gl.getUniformLocation(prog, 'u_resolution');
    if (rLoc) gl.uniform2f(rLoc, w, h);

    const fLoc = gl.getUniformLocation(prog, 'u_flarePos');
    if (fLoc) gl.uniform2f(fLoc, this.flarePos.x, this.flarePos.y);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Draw text overlays using 2D context on top
    this._drawTextLayers(w, h);
  }

  /** Draw text overlay layers using 2D canvas context (separate pass) */
  _drawTextLayers(w, h) {
    if (!this.textLayers.length) return;
    // We paint text onto a temporary 2D canvas and composite via WebGL...
    // For simplicity, we use an overlaid 2D canvas managed by main.js
    // This method fires an event that main.js picks up:
    this._textRenderCallback?.(w, h, this.textLayers);
  }

  onTextRender(cb) { this._textRenderCallback = cb; }

  // ─── State setters ────────────────────────────────────────────────────────
  setEffect(name)    { this.currentEffect = SHADERS[name] ? name : 'none'; }
  setIntensity(v)    { this.intensity = Math.max(0, Math.min(v, 1)); }
  setFlareX(v)       { this.flarePos.x = Math.max(0, Math.min(v, 1)); }
  setFlareY(v)       { this.flarePos.y = Math.max(0, Math.min(v, 1)); }

  setColorCorrection(key, value) {
    if (key in this.colorCorrection) this.colorCorrection[key] = value;
  }

  resetColorCorrection() {
    for (const k of Object.keys(this.colorCorrection)) this.colorCorrection[k] = 0;
  }

  /** Build CSS filter string from color correction values for composite canvas */
  buildCSSFilter() {
    const cc = this.colorCorrection;
    const brightness  = 1 + cc.brightness / 100;
    const contrast    = 1 + cc.contrast   / 100;
    const saturation  = 1 + cc.saturation / 100;
    const exposure    = Math.pow(2, cc.exposure / 100);
    return `brightness(${(brightness * exposure).toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})`;
  }

  addTextLayer(layer) { this.textLayers.push(layer); }
  removeTextLayer(id) { this.textLayers = this.textLayers.filter(l => l.id !== id); }
  clearTextLayers()   { this.textLayers = []; }

  // ─── Internal helpers ─────────────────────────────────────────────────────
  _createProgram(gl, vertSrc, fragSrc) {
    const vert = this._compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
    const frag = this._compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
  }

  _compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    for (const prog of Object.values(this.programs)) gl.deleteProgram(prog);
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this._quadBuf);
    this.gl = null;
  }
}
