import{r as _,j as b}from"../main-DSYrr8cF.js";import{t as L}from"./theme-color-CltKEOde.js";import{p as R}from"./useReducedMotion-6R2J0_eJ.js";const E=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`,C=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec3 u_brand;
uniform vec3 u_warning;
uniform vec3 u_danger;
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
  vec3 amberC = u_warning;
  vec3 redC = u_danger;

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
`;function g(t,a,e){const r=t.createShader(a);return r?(t.shaderSource(r,e),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(t.deleteShader(r),null)):null}function F(t){const a=g(t,t.VERTEX_SHADER,E),e=g(t,t.FRAGMENT_SHADER,C);if(!a||!e)return null;const r=t.createProgram();return r?(t.attachShader(r,a),t.attachShader(r,e),t.linkProgram(r),t.getProgramParameter(r,t.LINK_STATUS)?(t.deleteShader(a),t.deleteShader(e),r):(t.deleteProgram(r),null)):null}function k(){const t=_.useRef(null);return _.useEffect(()=>{const a=t.current;if(!a)return;const e=a.getContext("webgl2",{alpha:!0,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1});if(!e)return;const r=R(),i=F(e);if(!i)return;const p=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,p),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW);const v=e.getAttribLocation(i,"a_position"),x=e.getUniformLocation(i,"u_time"),A=e.getUniformLocation(i,"u_resolution");e.useProgram(i),e.enableVertexAttribArray(v),e.vertexAttribPointer(v,2,e.FLOAT,!1,0,0);const S=["brand","warning","danger"].map(o=>({role:o,location:e.getUniformLocation(i,"u_"+o)}));function l(){for(const{role:o,location:c}of S){const f=L(o).replace("#","");e.uniform3f(c,parseInt(f.slice(0,2),16)/255,parseInt(f.slice(2,4),16)/255,parseInt(f.slice(4,6),16)/255)}(s||r)&&u(d)}const y=performance.now();let n=0,s=!1,d=0;function u(o){e&&(d=o,e.uniform1f(x,o),e.drawArrays(e.TRIANGLES,0,6))}function h(){if(!a||!e)return;const o=Math.min(window.devicePixelRatio||1,1.5),c=a.clientWidth,f=a.clientHeight;a.width=Math.floor(c*o),a.height=Math.floor(f*o),e.viewport(0,0,a.width,a.height),e.uniform2f(A,a.width,a.height),(s||r)&&u(d)}l(),window.addEventListener("discammer:theme",l),h(),window.addEventListener("resize",h);function m(){if(!(s||!e)){if(u((performance.now()-y)/1e3),r){s=!0;return}n=requestAnimationFrame(m)}}const w=new IntersectionObserver(o=>{for(const c of o)c.isIntersecting&&!s&&!r?n||(n=requestAnimationFrame(m)):n&&(cancelAnimationFrame(n),n=0)},{threshold:0});return w.observe(a),m(),()=>{s=!0,w.disconnect(),n&&cancelAnimationFrame(n),window.removeEventListener("resize",h),window.removeEventListener("discammer:theme",l),e.deleteBuffer(p),e.deleteProgram(i)}},[]),b.jsx("canvas",{ref:t,"aria-hidden":"true",className:"absolute inset-0 w-full h-full pointer-events-none",style:{opacity:.2}})}export{k as default};
