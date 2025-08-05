import{r as m,j as g}from"../main-DEf4c4jC.js";import{p as y}from"./useReducedMotion-B4V-q5C2.js";const b=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`,R=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
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
  vec3 cyanC  = vec3(0.395, 0.871, 0.941);  // #65def0
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
`;function w(t,r,e){const a=t.createShader(r);return a?(t.shaderSource(a,e),t.compileShader(a),t.getShaderParameter(a,t.COMPILE_STATUS)?a:(t.deleteShader(a),null)):null}function E(t){const r=w(t,t.VERTEX_SHADER,b),e=w(t,t.FRAGMENT_SHADER,R);if(!r||!e)return null;const a=t.createProgram();return a?(t.attachShader(a,r),t.attachShader(a,e),t.linkProgram(a),t.getProgramParameter(a,t.LINK_STATUS)?(t.deleteShader(r),t.deleteShader(e),a):(t.deleteProgram(a),null)):null}function C(){const t=m.useRef(null);return m.useEffect(()=>{const r=t.current;if(!r)return;const e=r.getContext("webgl2",{alpha:!0,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1});if(!e)return;const a=y(),i=E(e);if(!i)return;const d=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,d),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW);const u=e.getAttribLocation(i,"a_position"),x=e.getUniformLocation(i,"u_time"),A=e.getUniformLocation(i,"u_resolution");e.useProgram(i),e.enableVertexAttribArray(u),e.vertexAttribPointer(u,2,e.FLOAT,!1,0,0);const S=performance.now();let o=0,s=!1,h=0;function p(n){e&&(h=n,e.uniform1f(x,n),e.drawArrays(e.TRIANGLES,0,6))}function c(){if(!r||!e)return;const n=Math.min(window.devicePixelRatio||1,1.5),l=r.clientWidth,_=r.clientHeight;r.width=Math.floor(l*n),r.height=Math.floor(_*n),e.viewport(0,0,r.width,r.height),e.uniform2f(A,r.width,r.height),(s||a)&&p(h)}c(),window.addEventListener("resize",c);function f(){if(!(s||!e)){if(p((performance.now()-S)/1e3),a){s=!0;return}o=requestAnimationFrame(f)}}const v=new IntersectionObserver(n=>{for(const l of n)l.isIntersecting&&!s&&!a?o||(o=requestAnimationFrame(f)):o&&(cancelAnimationFrame(o),o=0)},{threshold:0});return v.observe(r),f(),()=>{s=!0,v.disconnect(),o&&cancelAnimationFrame(o),window.removeEventListener("resize",c),e.deleteBuffer(d),e.deleteProgram(i)}},[]),g.jsx("canvas",{ref:t,"aria-hidden":"true",className:"absolute inset-0 w-full h-full pointer-events-none",style:{opacity:.35}})}export{C as default};
