/**
 * 大气与云层（规格 §6 阶段 3）：
 * - 大气 rim：菲涅尔边缘辉光壳（BackSide + 加色混合），按行星配色
 * - 云层：地球独立云球（程序化 fbm 云图，自转略快于地表）
 * - 天王星窄环：两道细环带（轴向倾角由 tiltGroup 承担）
 * 尺度随 setScaleMode 同步（bodies.ts 按 atmoMesh/cloudMesh/ring 名缩放）。
 */
import * as THREE from "three";
import type { SimBody } from "./bodies";

interface AtmoSpec {
  color: number;
  power: number;
  intensity: number;
  clouds?: boolean;
}

const ATMO: Record<string, AtmoSpec> = {
  earth: { color: 0x3a7bff, power: 3.0, intensity: 1.0, clouds: true },
  venus: { color: 0xe8cf9a, power: 2.4, intensity: 0.8 },
  mars: { color: 0xd89868, power: 3.5, intensity: 0.35 },
  jupiter: { color: 0xd8b088, power: 3.0, intensity: 0.4 },
  saturn: { color: 0xe8d0a0, power: 3.0, intensity: 0.35 },
  uranus: { color: 0x9ad8e8, power: 3.0, intensity: 0.45 },
  neptune: { color: 0x5878e8, power: 3.0, intensity: 0.5 },
};

/* ─────────────────────────── 程序化云图 ─────────────────────────── */

function hash3(x: number, y: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 144665);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm3(x: number, y: number, z: number, seed: number, oct = 5): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise3(x * f, y * f, z * f, seed + i * 101);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

/** 等距圆柱云图：球面采样保证经度无缝；阈值化 fbm + 纬度带调制 */
function makeCloudTexture(): THREE.CanvasTexture {
  const w = 512, h = 256;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    const lat = (py / h - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lon = (px / w) * Math.PI * 2;
      const nx = Math.cos(lon) * cl, ny = Math.sin(lon) * cl, nz = Math.sin(lat);
      // 赤道辐合带 + 中纬风暴带：纬度调制云量阈值
      const band = 0.52 + 0.1 * Math.sin(lat * 5.2) - 0.08 * Math.exp(-Math.pow(lat / 0.35, 2));
      const a = fbm3(nx * 3.1 + 11, ny * 3.1 + 5, nz * 3.1 + 23, 77);
      let alpha = (a - band) / 0.16;
      alpha = Math.max(0, Math.min(1, alpha));
      alpha *= 0.92;
      const idx = (py * w + px) * 4;
      d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
      d[idx + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ─────────────────────────── 大气 rim 壳 ─────────────────────────── */

function rimMaterial(spec: AtmoSpec): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(spec.color) },
      uPower: { value: spec.power },
      uIntensity: { value: spec.intensity },
    },
    vertexShader: /* glsl */ `
      uniform float uPower;
      varying float vF;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 v = normalize(-mv.xyz);
        vF = pow(1.0 - abs(dot(n, v)), uPower);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vF;
      void main() {
        gl_FragColor = vec4(uColor * vF * uIntensity, vF);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** 给行星挂大气壳（rim 挂 pivot，世界朝向）+ 地球云球（挂 tiltGroup，随轴倾角）；尺度初始按当前 dispR */
export function addAtmosphere(b: SimBody, tiltGroup: THREE.Object3D) {
  const spec = ATMO[b.id];
  if (!spec) return;
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), rimMaterial(spec));
  atmo.scale.setScalar(b.dispR * 1.06);
  atmo.renderOrder = 2;
  b.pivot.add(atmo);
  b.atmoMesh = atmo;
  if (spec.clouds) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 40),
      new THREE.MeshStandardMaterial({
        map: makeCloudTexture(), transparent: true, depthWrite: false, roughness: 1, metalness: 0,
      }),
    );
    cloud.scale.setScalar(b.dispR * 1.015);
    cloud.renderOrder = 1;
    tiltGroup.add(cloud);
    b.cloudMesh = cloud;
  }
}

/* ─────────────────────────── 天王星窄环 ─────────────────────────── */

function makeUranusRingTexture(): THREE.CanvasTexture {
  const w = 256, h = 4;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // ε 主环 + 内环带：窄而暗
  const bands: [number, number, number][] = [
    [0.62, 0.05, 0.5],
    [0.78, 0.03, 0.32],
    [0.3, 0.12, 0.12],
  ];
  for (const [c, hw, a] of bands) {
    const g = ctx.createLinearGradient((c - hw) * w, 0, (c + hw) * w, 0);
    g.addColorStop(0, "rgba(200,210,220,0)");
    g.addColorStop(0.5, `rgba(200,210,220,${a})`);
    g.addColorStop(1, "rgba(200,210,220,0)");
    ctx.fillStyle = g;
    ctx.fillRect((c - hw) * w, 0, hw * 2 * w, h);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addUranusRings(tiltGroup: THREE.Object3D, planetR: number) {
  const inner = planetR * 1.62, outer = planetR * 2.05;
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: makeUranusRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.9,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = "ring";
  ring.userData.r0 = planetR;
  ring.rotation.x = -Math.PI / 2;
  tiltGroup.add(ring);
}
