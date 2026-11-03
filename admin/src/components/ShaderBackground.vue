<script setup lang="ts">
// 噪波背景：WebGL 片元着色器渲染的“白色画布 + 边缘粉彩光晕”。
// 大面积白为主，薰衣草/粉/薄荷/蜜桃四色只在边缘以光晕形式缓慢流动作点缀。
// contained=true 时铺满最近定位父级，否则 fixed 全屏。
// WebGL 不可用时静默降级为纯白底。
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{ contained?: boolean }>(), { contained: false })

const host = ref<HTMLElement | null>(null)

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p){
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(in vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i = 0; i < 4; i++){
    v += a * vnoise(p);
    p = M * p + vec2(3.7, 1.9);
    a *= 0.55;
  }
  return v;
}
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  float t = uTime * 0.03;

  // 白色画布：彩色只是一圈贴边光晕，距边 15% 以内才有，中心大面积留白
  float dEdge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edge = 1.0 - smoothstep(0.02, 0.17, dEdge);

  // domain warp：让光晕边界有机、缓慢流动
  vec2 q = vec2(
    fbm(p * 1.2 + vec2(t * 0.55, 0.0)),
    fbm(p * 1.2 + vec2(4.7, 8.3) - vec2(0.0, t * 0.45))
  );
  float n = fbm(p * 1.5 + q * 1.25 + vec2(t * 0.20, -t * 0.16));

  // 光晕强弱：边缘 × 噪声起伏（有的地方亮一点，有的地方几乎全白）
  float glow = edge * (0.30 + 0.70 * smoothstep(0.35, 0.80, n));

  // 粉彩四色：薰衣草 / 粉 / 薄荷 / 蜜桃，按两个慢噪声混出区域色
  vec3 lav   = vec3(0.85, 0.83, 1.00);
  vec3 pink  = vec3(1.00, 0.86, 0.92);
  vec3 mint  = vec3(0.84, 0.96, 0.90);
  vec3 peach = vec3(1.00, 0.91, 0.81);
  float h1 = fbm(p * 0.9 + vec2(2.3, 8.1) + t * 0.30);
  float h2 = fbm(p * 0.9 + vec2(7.7, 1.2) - t * 0.24);
  vec3 tint = mix(
    mix(lav, pink, smoothstep(0.30, 0.70, h1)),
    mix(mint, peach, smoothstep(0.30, 0.70, h2)),
    0.45 + 0.25 * sin(t * 0.6 + p.x * 1.4)
  );

  vec3 col = mix(vec3(1.0), tint, glow * 0.45);

  // 两团极淡光斑漂浮在内容区后方：大面积仍近白，但玻璃卡的 blur/saturate 靠它们显形
  vec2 c1 = vec2(1.02, 0.68) + 0.05 * vec2(sin(t * 0.8), cos(t * 0.6));
  vec2 c2 = vec2(0.55, 0.18) + 0.05 * vec2(cos(t * 0.5), sin(t * 0.7));
  float blob = 0.20 * exp(-dot(p - c1, p - c1) * 1.6) + 0.14 * exp(-dot(p - c2, p - c2) * 1.9);
  col = mix(col, tint, blob);

  // 抖动防条带
  col += (hash(frag + fract(uTime) * vec2(13.1, 7.7)) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[ShaderBackground]', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

let raf = 0
let cleanup: (() => void) | null = null

onMounted(() => {
  const el = host.value
  if (!el) return
  const canvas = document.createElement('canvas')
  canvas.className = 'shaderbg__canvas'
  el.appendChild(canvas)

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  })
  if (!gl) return // 降级：纯白底

  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[ShaderBackground]', gl.getProgramInfoLog(prog))
    return
  }
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  const uRes = gl.getUniformLocation(prog, 'uRes')
  const uTime = gl.getUniformLocation(prog, 'uTime')

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const start = performance.now()
  let paused = false

  function resize() {
    const rect = el!.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl!.viewport(0, 0, w, h)
    }
  }

  function draw(now: number) {
    resize()
    gl!.uniform2f(uRes, canvas.width, canvas.height)
    gl!.uniform1f(uTime, (now - start) / 1000)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  function loop(now: number) {
    if (!paused) draw(now)
    raf = requestAnimationFrame(loop)
  }

  resize()
  draw(performance.now())
  if (!reduced) raf = requestAnimationFrame(loop)

  const onVis = () => {
    paused = document.hidden
  }
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVis)

  cleanup = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVis)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div ref="host" class="shaderbg" :class="{ 'shaderbg--contained': contained }" aria-hidden="true" />
</template>

<style scoped>
.shaderbg {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: #ffffff;
}

.shaderbg--contained {
  position: absolute;
  z-index: 0;
}

.shaderbg__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
