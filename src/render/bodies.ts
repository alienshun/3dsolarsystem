/**
 * 天体网格构建与显示状态（规格 §4.2 观赏模式）：
 * - 程序化纹理（阶段 1；NASA 贴图为阶段 2）
 * - 每个天体：pivot（显示位置）→ tiltGroup（轴倾角）→ mesh（自转）
 * - 卫星显示轨道：方向取物理真方向，半径映射到母行星环带（scale.moonRingRadius）
 */
import * as THREE from "three";
import { PLANETS, SUN } from "../data/planets";
import { MOONS } from "../data/moons";
import { SMALL_BODIES } from "../data/sbdb";
import { displayRadius, moonRingRadius, toDisplay } from "./scale";
import { orbitalSpeed } from "../core/kepler";
import { REAL_TEXTURES } from "./textures";

export type BodyKind = "star" | "planet" | "moon" | "dwarf" | "comet" | "asteroid";

export interface SimBody {
  id: string;
  name: string;
  nameEn: string;
  kind: BodyKind;
  color: number;
  radiusKm: number;
  massKg: number;
  rotationHours: number;
  axialTiltDeg: number;
  fact: string;
  parentId: string | null;
  dispR: number;
  /** 显示位置节点（场景图） */
  pivot: THREE.Object3D;
  /** 自转网格 */
  mesh: THREE.Mesh;
  /** 卫星：显示轨道环带半径（显示单位）；轨道半长轴 km；轨道周期 天 */
  ringR?: number;
  ringAKm?: number;
  periodDays?: number;
  // ── 每帧更新的物理/显示状态 ──
  /** 日心物理位置（AU，Three 约定） */
  helioAU: THREE.Vector3;
  /** 卫星相对母行星物理位置（km，Three 约定） */
  relKm: THREE.Vector3;
  rAU: number;
  aAU: number;
  e: number;
  speedKmS: number;
  /** 显示位置（= pivot.position 引用） */
  dispPos: THREE.Vector3;
  /** 根空间位置（dispPos + world 偏移；相机/标签/拾取用此值） */
  rootPos: THREE.Vector3;
  /** 真实形状网格（归一化单位最大半径；§4.6）；null = 球体 */
  shapeGeo?: THREE.BufferGeometry | null;
  /** LOD 远距回落用低面数球 */
  proxyGeo?: THREE.BufferGeometry | null;
  shapeLod?: "shape" | "proxy";
}

export interface BodyRegistry {
  sun: SimBody;
  all: SimBody[];
  byId: Map<string, SimBody>;
  planets: SimBody[];
  moons: SimBody[];
  moonsOf: Map<string, SimBody[]>;
  dwarfs: SimBody[];
  comets: SimBody[];
  asteroids: SimBody[];
}

const GM_SUN = 1.32712440018e11; // km³/s²
const KM_PER_AU = 149597870.7;

/* ─────────────────────────── 程序化纹理 ─────────────────────────── */

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 经度方向周期连续的 2D 值噪声 + fbm */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144665);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * smooth(x * f, y * f); f *= 2; amp *= 0.5; }
    return s;
  };
  return fbm;
}

type TextureKind = "sun" | "earth" | "rocky" | "gas" | "ice" | "moon";

/** 生成等距圆柱投影纹理（球面 UV） */
function makeTexture(kind: TextureKind, baseHex: number, seed: number, w: number, h: number, spot = false): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const fbm = makeNoise(seed);
  const br = (baseHex >> 16) & 255, bg = (baseHex >> 8) & 255, bb = baseHex & 255;
  const rnd = mulberry(seed * 7 + 13);

  for (let py = 0; py < h; py++) {
    const lat = (py / h - 0.5) * Math.PI; // -π/2..π/2
    for (let px = 0; px < w; px++) {
      const lon = (px / w) * Math.PI * 2;
      // 经度周期连续采样
      const nx = Math.cos(lon) * 2.2 + 17.3;
      const ny = Math.sin(lon) * 2.2 + 41.7;
      const nz = (lat + Math.PI / 2) * 2.2;
      const idx = (py * w + px) * 4;
      let r = br, g = bg, b = bb;

      if (kind === "sun") {
        const t = fbm(nx * 5.0, ny * 5.0 + nz * 2.6, 4);
        const gr = fbm(nx * 16, ny * 16 + nz * 9, 3) - 0.5; // 米粒组织
        const k = 0.94 + (t - 0.5) * 0.18 + gr * 0.07;
        r = Math.min(255, 255 * k); g = Math.min(255, 220 * k); b = Math.min(255, 140 * k);
      } else if (kind === "earth") {
        const land = fbm(nx * 1.6, ny * 1.6 + nz * 0.8, 5);
        const fine = fbm(nx * 11, ny * 11 + nz * 6, 3) - 0.5; // 高频细节
        const icy = Math.abs(lat) > 1.18 ? Math.min(1, (Math.abs(lat) - 1.18) * 6) : 0;
        // smoothstep 锐化海岸线
        const s = Math.max(0, Math.min(1, (land - 0.485) / 0.07));
        const coast = s * s * (3 - 2 * s);
        if (coast > 0.5) {
          const t = fbm(nx * 4, ny * 4 + nz * 2, 3);
          const green = 1 - Math.min(1, Math.abs(lat) / 1.25); // 热带更绿
          const v = fine * 26; // 地形斑驳
          r = 88 + t * 55 + (1 - green) * 34 + v; g = 96 + t * 46 + green * 42 + v; b = 58 + t * 26 + v * 0.5;
        } else {
          const deep = (0.485 - land) * 2.4;
          const shallow = (0.5 - coast) * 2; // 近岸浅水
          r = 22 + (1 - deep) * 30 + shallow * 26; g = 48 + (1 - deep) * 55 + shallow * 44; b = 110 + (1 - deep) * 70 + shallow * 34;
        }
        if (icy > 0) { r = r + (245 - r) * icy; g = g + (248 - g) * icy; b = b + (255 - b) * icy; }
        // 烘焙少量云纹（阶段 3 换独立云层）
        const cl = fbm(nx * 3 + 5.5, ny * 3 + nz * 1.5 + 9.1, 4);
        if (cl > 0.58) { const a = Math.min(0.75, (cl - 0.58) * 3.2); r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a; }
      } else if (kind === "gas" || kind === "ice") {
        const bandFreq = kind === "gas" ? 7.5 : 5.0;
        const turb = fbm(nx * 3.2, ny * 3.2 + nz * 2.4, 4) - 0.5;
        const fil = fbm(nx * 13, ny * 13 + nz * 7.5, 3) - 0.5; // 细丝湍流
        const band = Math.sin(lat * bandFreq + turb * 2.6 + fil * 1.4 + seed % 5) * 0.5
          + Math.sin(lat * bandFreq * 2.3 + turb * 1.7 + fil * 0.9) * 0.25
          + turb * 0.7;
        const k = 0.82 + band * 0.22 + fil * 0.06;
        r = Math.min(255, br * k + 18); g = Math.min(255, bg * k + 12); b = Math.min(255, bb * k + 8);
      } else {
        // rocky / moon：fbm 斑驳 + 明暗区 + 高频碎石
        const t = fbm(nx * 2.4, ny * 2.4 + nz * 1.2, 5);
        const sp = fbm(nx * 18, ny * 18 + nz * 10, 2) - 0.5; // 碎石斑点
        const k = 0.68 + t * 0.62 + sp * 0.16;
        r = Math.min(255, br * k); g = Math.min(255, bg * k); b = Math.min(255, bb * k);
        if (kind === "rocky" && Math.abs(lat) > 1.32) { // 极冠（火星等）
          const icy = Math.min(1, (Math.abs(lat) - 1.32) * 5);
          r += (238 - r) * icy; g += (240 - g) * icy; b += (245 - b) * icy;
        }
      }
      d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 撞击坑（rocky/moon）：数量与半径随纹理宽度缩放
  if (kind === "rocky" || kind === "moon") {
    const sc = w / 256; // 以 256 宽为基准
    const n = Math.round((kind === "moon" ? 90 : 40) * sc * sc);
    for (let i = 0; i < n; i++) {
      const cx = rnd() * w, cy = h * 0.12 + rnd() * h * 0.76;
      const rad = (2 + Math.pow(rnd(), 2.4) * (kind === "moon" ? 16 : 10)) * sc;
      const gr = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
      gr.addColorStop(0, "rgba(0,0,0,0.28)");
      gr.addColorStop(0.75, "rgba(0,0,0,0.14)");
      gr.addColorStop(0.92, "rgba(255,255,255,0.16)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 大红斑（木星）
  if (spot) {
    ctx.save();
    ctx.translate(w * 0.62, h * 0.62);
    ctx.scale(1, 0.55);
    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.055);
    gr.addColorStop(0, "rgba(200,80,50,0.95)");
    gr.addColorStop(0.7, "rgba(190,100,70,0.6)");
    gr.addColorStop(1, "rgba(190,120,90,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 土星环纹理（径向条带 + 卡西尼缝），配合 UV 重映射使用 */
function makeRingTexture(): THREE.CanvasTexture {
  const w = 512, h = 8;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const rnd = mulberry(99);
  for (let x = 0; x < w; x++) {
    const t = x / w; // 0 内缘 → 1 外缘
    let a = 0.0;
    if (t > 0.05 && t < 0.38) a = 0.30 + rnd() * 0.25;          // C 环
    if (t >= 0.38 && t < 0.62) a = 0.65 + rnd() * 0.3;          // B 环
    if (t >= 0.62 && t < 0.665) a = 0.03;                        // 卡西尼缝
    if (t >= 0.665 && t < 0.92) a = 0.42 + rnd() * 0.3;         // A 环
    if (t >= 0.80 && t < 0.815) a = 0.08;                        // 恩克缝
    const lum = 190 + rnd() * 50;
    ctx.fillStyle = `rgba(${lum},${lum * 0.93},${lum * 0.78},${a})`;
    ctx.fillRect(x, 0, 1, h);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunGlow(): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d")!;
  const gr = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,240,200,0.85)");
  gr.addColorStop(0.25, "rgba(255,200,110,0.35)");
  gr.addColorStop(0.6, "rgba(255,150,60,0.10)");
  gr.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  return spr;
}

/* ─────────────────────────── 构建 ─────────────────────────── */

const sphereGeo = new THREE.SphereGeometry(1, 40, 28);

/** 有真实贴图的天体用低分辨率程序化占位（异步替换），加快启动 */
function phW(id: string, full: number): number {
  return REAL_TEXTURES[id] ? 256 : full;
}

function makeBodyMesh(tex: THREE.Texture, radius: number, opts: { emissive?: boolean; segments?: number } = {}): THREE.Mesh {
  const geo = opts.segments ? new THREE.SphereGeometry(1, opts.segments, opts.segments / 2) : sphereGeo;
  const mat = opts.emissive
    ? new THREE.MeshBasicMaterial({ map: tex })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(radius);
  return mesh;
}

function addRings(tiltGroup: THREE.Object3D, planetR: number) {
  const inner = planetR * 1.28, outer = planetR * 2.35;
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  // UV 重映射：u = 径向位置
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: makeRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.95,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = "ring";
  ring.userData.r0 = planetR;
  ring.rotation.x = -Math.PI / 2;
  tiltGroup.add(ring);
}

export function buildBodies(world: THREE.Object3D): BodyRegistry {
  const byId = new Map<string, SimBody>();
  const all: SimBody[] = [];
  const planets: SimBody[] = [];
  const moons: SimBody[] = [];
  const dwarfs: SimBody[] = [];
  const comets: SimBody[] = [];
  const asteroids: SimBody[] = [];
  const moonsOf = new Map<string, SimBody[]>();

  // 太阳
  {
    const dispR = displayRadius(SUN.radiusKm);
    const pivot = new THREE.Object3D();
    const sw = phW(SUN.id, 1024);
    const mesh = makeBodyMesh(makeTexture("sun", 0xffcc66, 7, sw, sw / 2), dispR, { emissive: true, segments: 64 });
    pivot.add(mesh);
    const glow = makeSunGlow();
    glow.scale.setScalar(dispR * 5);
    pivot.add(glow);
    world.add(pivot);
    const b: SimBody = {
      id: SUN.id, name: SUN.name, nameEn: SUN.nameEn, kind: "star", color: SUN.color,
      radiusKm: SUN.radiusKm, massKg: SUN.massKg, rotationHours: 609.12, axialTiltDeg: 7.25,
      fact: SUN.fact, parentId: null, dispR, pivot, mesh,
      helioAU: new THREE.Vector3(), relKm: new THREE.Vector3(),
      rAU: 0, aAU: 0, e: 0, speedKmS: 0, dispPos: pivot.position,
      rootPos: new THREE.Vector3(),
    };
    byId.set(b.id, b); all.push(b);
  }

  // 行星
  const texKind: Record<string, TextureKind> = {
    mercury: "rocky", venus: "ice", earth: "earth", mars: "rocky",
    jupiter: "gas", saturn: "gas", uranus: "ice", neptune: "gas",
  };
  PLANETS.forEach((p, i) => {
    const dispR = displayRadius(p.radiusKm);
    const pivot = new THREE.Object3D();
    const tiltGroup = new THREE.Object3D();
    tiltGroup.rotation.z = (p.axialTiltDeg * Math.PI) / 180;
    const pw = phW(p.id, p.id === "earth" ? 2048 : 1024);
    const mesh = makeBodyMesh(makeTexture(texKind[p.id], p.color, 101 + i * 37, pw, pw / 2, p.id === "jupiter"), dispR);
    tiltGroup.add(mesh);
    pivot.add(tiltGroup);
    if (p.id === "saturn") addRings(tiltGroup, dispR);
    world.add(pivot);
    const b: SimBody = {
      id: p.id, name: p.name, nameEn: p.nameEn, kind: "planet", color: p.color,
      radiusKm: p.radiusKm, massKg: p.massKg, rotationHours: p.rotationHours, axialTiltDeg: p.axialTiltDeg,
      fact: p.fact, parentId: "sun", dispR, pivot, mesh,
      helioAU: new THREE.Vector3(), relKm: new THREE.Vector3(),
      rAU: p.elements.a, aAU: p.elements.a, e: p.elements.e, speedKmS: 0, dispPos: pivot.position,
      rootPos: new THREE.Vector3(),
    };
    byId.set(b.id, b); all.push(b); planets.push(b);
    moonsOf.set(b.id, []);
  });

  // 卫星：先算每个系统 a 范围 → 环带半径
  const aRange = new Map<string, { min: number; max: number }>();
  for (const m of MOONS) {
    const r = aRange.get(m.parent) ?? { min: Infinity, max: -Infinity };
    r.min = Math.min(r.min, m.elements.aKm);
    r.max = Math.max(r.max, m.elements.aKm);
    aRange.set(m.parent, r);
  }
  MOONS.forEach((m, i) => {
    const parent = byId.get(m.parent)!;
    const dispR = displayRadius(m.radiusKm);
    const range = aRange.get(m.parent)!;
    const ringR = moonRingRadius(m.elements.aKm, range.min, range.max, parent.dispR);
    const pivot = new THREE.Object3D();
    const tiltGroup = new THREE.Object3D();
    const mw = phW(m.id, m.id === "moon" ? 1024 : 512);
    const mesh = makeBodyMesh(makeTexture("moon", m.color, 911 + i * 53, mw, mw / 2), dispR);
    tiltGroup.add(mesh);
    pivot.add(tiltGroup);
    world.add(pivot);
    const b: SimBody = {
      id: m.id, name: m.name, nameEn: m.nameEn, kind: "moon", color: m.color,
      radiusKm: m.radiusKm, massKg: m.massKg, rotationHours: m.rotationHours, axialTiltDeg: 0,
      fact: m.fact, parentId: m.parent, dispR, pivot, mesh,
      ringR, ringAKm: m.elements.aKm, periodDays: m.elements.periodDays,
      helioAU: new THREE.Vector3(), relKm: new THREE.Vector3(),
      rAU: 0, aAU: m.elements.aKm / KM_PER_AU, e: m.elements.e, speedKmS: 0, dispPos: pivot.position,
      rootPos: new THREE.Vector3(),
    };
    byId.set(b.id, b); all.push(b); moons.push(b);
    moonsOf.get(m.parent)!.push(b);
  });

  // 矮行星 / 彗星 / 小行星：与行星同管线（日心开普勒），纹理按类别取程序化占位
  SMALL_BODIES.forEach((s, i) => {
    const dispR = displayRadius(s.radiusKm);
    const pivot = new THREE.Object3D();
    const tiltGroup = new THREE.Object3D();
    tiltGroup.rotation.z = (s.axialTiltDeg * Math.PI) / 180;
    const texKind: TextureKind = s.kind === "dwarf" ? (s.id === "ceres" ? "rocky" : "ice") : s.kind === "comet" ? "moon" : "rocky";
    const mesh = makeBodyMesh(makeTexture(texKind, s.color, 401 + i * 29, 256, 128), dispR);
    tiltGroup.add(mesh);
    pivot.add(tiltGroup);
    world.add(pivot);
    const b: SimBody = {
      id: s.id, name: s.name, nameEn: s.nameEn, kind: s.kind, color: s.color,
      radiusKm: s.radiusKm, massKg: s.massKg, rotationHours: s.rotationHours, axialTiltDeg: s.axialTiltDeg,
      fact: s.fact, parentId: "sun", dispR, pivot, mesh,
      helioAU: new THREE.Vector3(), relKm: new THREE.Vector3(),
      rAU: s.elements.a, aAU: s.elements.a, e: s.elements.e, speedKmS: 0, dispPos: pivot.position,
      rootPos: new THREE.Vector3(),
    };
    byId.set(b.id, b); all.push(b);
    if (s.kind === "dwarf") dwarfs.push(b);
    else if (s.kind === "comet") comets.push(b);
    else asteroids.push(b);
  });

  return { sun: all[0], all, byId, planets, moons, moonsOf, dwarfs, comets, asteroids };
}

/* ─────────────────────────── 每帧状态应用 ─────────────────────────── */

const _tmpV = new THREE.Vector3();

/** 由物理状态计算显示位置（纯显示层；仿真值不受影响） */
export function applyDisplayPositions(reg: BodyRegistry) {
  for (const b of reg.all) {
    if (b.kind === "moon") {
      const parent = reg.byId.get(b.parentId!)!;
      const rKm = b.relKm.length();
      if (rKm > 0 && b.ringR) {
        // 方向保留物理真方向，径向映射到环带并按 r/a 保留偏心率变化
        _tmpV.copy(b.relKm).normalize().multiplyScalar(b.ringR * (rKm / b.ringAKm!));
        b.dispPos.copy(parent.dispPos).add(_tmpV);
      } else {
        b.dispPos.copy(parent.dispPos);
      }
      b.helioAU.copy(parent.helioAU).addScaledVector(b.relKm, 1 / KM_PER_AU);
      b.rAU = b.helioAU.length();
      b.speedKmS = (2 * Math.PI * b.ringAKm!) / (b.periodDays! * 86400); // 圆轨道近似（信息卡展示）
    } else if (b.kind === "star") {
      b.dispPos.set(0, 0, 0);
    } else {
      toDisplay(b.helioAU.x, b.helioAU.y, b.helioAU.z, b.dispPos);
      b.speedKmS = orbitalSpeed(GM_SUN, b.rAU * KM_PER_AU, b.aAU * KM_PER_AU);
    }
  }
}

export type ScaleMode = "display" | "true";

/** 真实比例模式：位置 = 物理值（km），不做观赏压缩（规格 §6 阶段 2） */
export function applyTruePositions(reg: BodyRegistry) {
  for (const b of reg.all) {
    if (b.kind === "moon") {
      const parent = reg.byId.get(b.parentId!)!;
      b.dispPos.copy(parent.dispPos).add(b.relKm);
      b.helioAU.copy(parent.helioAU).addScaledVector(b.relKm, 1 / KM_PER_AU);
      b.rAU = b.helioAU.length();
      b.speedKmS = (2 * Math.PI * b.ringAKm!) / (b.periodDays! * 86400);
    } else if (b.kind === "star") {
      b.dispPos.set(0, 0, 0);
    } else {
      b.dispPos.copy(b.helioAU).multiplyScalar(KM_PER_AU);
      b.speedKmS = orbitalSpeed(GM_SUN, b.rAU * KM_PER_AU, b.aAU * KM_PER_AU);
    }
  }
}

/** 切换比例模式：网格 / 土星环 / 日光晕尺度与 dispR 同步 */
export function setScaleMode(reg: BodyRegistry, mode: ScaleMode) {
  for (const b of reg.all) {
    const r = mode === "true" ? b.radiusKm : displayRadius(b.radiusKm);
    b.dispR = r;
    b.mesh.scale.setScalar(r);
    b.pivot.traverse((o) => {
      const sprite = o as THREE.Sprite;
      if (sprite.isSprite) sprite.scale.setScalar(r * 5);
      if (o.name === "ring") o.scale.setScalar(r / (o.userData.r0 as number));
    });
  }
}

/** 自转角（弧度）：由儒略日与自转周期决定（纯函数） */
export function spinAngle(b: SimBody, daysSinceJ2000: number): number {
  return ((daysSinceJ2000 * 24) / b.rotationHours) * Math.PI * 2;
}

/** 黄经（deg）：Three 坐标 → 黄道经度（x_ecl = x, y_ecl = −z） */
export function eclipticLongitude(v: THREE.Vector3): number {
  const lam = Math.atan2(-v.z, v.x) * (180 / Math.PI);
  return lam < 0 ? lam + 360 : lam;
}
