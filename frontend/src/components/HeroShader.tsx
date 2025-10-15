import { themeColor } from '../utils/theme';
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../utils/useReducedMotion';

/**
 * Full-bleed hero shader — a slow flowing dataflow visualization.
 *
 * Concept: diagonal streaks of dim cyan/amber/red light traveling from
 * top-right to bottom-left, like CRT phosphor decay across a fiber-optic
 * monitor. Specific to DiScammer (analyst's console) — not generic particles.
 *
 * Strategy: a single full-screen quad rendered with a custom fragment shader
 * via raw WebGL2. This is intentionally lighter than spinning up three.js for
 * one effect — three.js for a single shader pass costs ~700KB. The shader IS
 * the brand artifact; everything else is plumbing.
 *
 * Progressive enhancement:
 *   - WebGL2 unsupported → returns null (the parent has a faint grid pattern
 *     as the static fallback)
 *   - prefers-reduced-motion → renders a single static frame, then stops
 *
 * Opacity capped at 0.35 via CSS so the shader sits *behind* the content
 * rather than competing with it. (Brand chrome rule: hero animations ≤ 0.4.)
 */

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Diagonal dataflow streaks: layered moving line bands rotated 30 degrees,
// each band a different palette color (cyan / amber / red) and speed.
// The streaks decay along their length (phosphor falloff). A faint
// vertical-scan noise wash adds CRT-monitor texture without becoming a
// generic "scanline" overlay.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec3 u_brand;
uniform vec2  u_resolution;

// Hash + value noise (small, cheap)
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// One layer of diagonal streaks. dir is the unit flow direction.
// freq = stripe density (lower = wider lanes). speed = drift along dir.
// width = lit portion of each stripe. seedOffset = decorrelates layers.
float streakLayer(vec2 p, vec2 dir, float freq, float speed, float width, float seedOffset) {
  // Project onto perpendicular axis -> picks which lane this pixel is in.
  vec2 perp = vec2(-dir.y, dir.x);
  float lane = dot(p, perp) * freq + seedOffset;
  float along = dot(p, dir) * freq * 0.6 + seedOffset * 13.7;

  // Lane index + position within lane
  float laneIdx = floor(lane);
  float laneFrac = fract(lane);

  // Each lane has its own random life parameter -> some lanes are inactive
  float laneSeed = hash(vec2(laneIdx, seedOffset));
  if (laneSeed < 0.55) return 0.0;

  // The streak head's position along the lane (drifting over time)
  float head = fract(along + u_time * speed + laneSeed * 3.7);

  // Distance from this pixel to the head, with phosphor decay tail
  float tail = exp(-head * 8.0);

  // How much of the lane width is lit
  float laneCenter = abs(laneFrac - 0.5);
  float lit = smoothstep(width, 0.0, laneCenter);

  return tail * lit * (0.4 + 0.6 * laneSeed);
}

void main() {
  // Normalize uv to aspect-corrected space so streaks don't squash
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

  // Flow direction: top-right -> bottom-left, ~30 deg below horizontal
  vec2 dir = normalize(vec2(-1.0, -0.55));

  // Three layered passes at different palette + speed
  float cyan  = streakLayer(p, dir, 14.0, 0.045, 0.16,  0.0);
  float amber = streakLayer(p, dir, 22.0, 0.030, 0.10,  37.2);
  float red   = streakLayer(p, dir, 30.0, 0.020, 0.08,  91.7);

  // Brand-tuned colors (match DESIGN.md tokens, not neon)
  vec3 cyanC = u_brand;
  vec3 amberC = vec3(0.957, 0.725, 0.396);  // #f4b965
  vec3 redC   = vec3(0.906, 0.400, 0.439);  // #e76670

  vec3 col = cyanC * cyan * 0.55
           + amberC * amber * 0.40
           + redC  * red   * 0.30;

  // Cool subtle CRT noise wash (under 4% intensity)
  float n = noise(uv * vec2(180.0, 480.0) + vec2(0.0, u_time * 0.4));
  col += vec3(0.012, 0.018, 0.024) * n;

  // Slight vignette so streaks fade at edges
  float vig = 1.0 - smoothstep(0.55, 1.05, length(p));
  col *= mix(0.6, 1.0, vig);

  fragColor = vec4(col, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const v = createShader(gl, gl.VERTEX_SHADER, VERT);
  const f = createShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

export default function HeroShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      // WebGL2 not supported -> static grid fallback in parent template
      return;
    }

    const reduce = prefersReducedMotion();

    const program = createProgram(gl);
    if (!program) return;

    // Fullscreen triangle pair (one triangle covering NDC would also work,
    // but two-triangle quad is more explicit)
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const brandLoc = gl.getUniformLocation(program, 'u_brand');
    function updateTheme() {
      const value = themeColor('brand').replace('#', '');
      gl!.uniform3f(brandLoc, parseInt(value.slice(0,2),16)/255, parseInt(value.slice(2,4),16)/255, parseInt(value.slice(4,6),16)/255);
      if (stopped || reduce) renderFrame(lastTime);
    }
    const start = performance.now();
    let frame = 0;
    let stopped = false;
    let lastTime = 0;

    function renderFrame(timeSeconds: number) {
      if (!gl) return;
      lastTime = timeSeconds;
      gl.uniform1f(timeLoc, timeSeconds);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function resize() {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      // Setting canvas.width clears the drawing buffer; when the rAF loop
      // isn't running (reduced motion / stopped) nothing would repaint it.
      if (stopped || reduce) renderFrame(lastTime);
    }

    updateTheme();
    window.addEventListener('discammer:theme', updateTheme);
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (stopped || !gl) return;
      renderFrame((performance.now() - start) / 1000);
      if (reduce) {
        // Render one frame and stop — respects prefers-reduced-motion
        stopped = true;
        return;
      }
      frame = requestAnimationFrame(draw);
    }

    // IntersectionObserver: pause when off-screen
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !stopped && !reduce) {
            if (!frame) frame = requestAnimationFrame(draw);
          } else {
            if (frame) {
              cancelAnimationFrame(frame);
              frame = 0;
            }
          }
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    draw();

    return () => {
      stopped = true;
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('discammer:theme', updateTheme);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.2 }}
    />
  );
}
