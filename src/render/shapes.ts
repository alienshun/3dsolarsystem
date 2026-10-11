/**
 * 真实形状网格管线（规格 §4.6）：
 * - 真实网格：NASA 3D Resources（public/shapes/：贝努 glb、丝川/爱神 stl，构建期已 decimate）
 * - 归一化：质心平移 → PCA 主惯性轴对齐（最小主轴→自转轴 Y，最大主轴→X）→ 缩放单位最大半径
 * - 兜底：无网格天体用「真实轴比椭球 + 位移噪声 + 撞击坑/颈部」程序化生成（规格 §4.6-5）
 * - LOD：屏幕半径 < 2.5px 回落低面数球（规格 §4.6-4 远距表示）
 * 自转由 bodies.spinAngle 按真实周期驱动（网格自转轴已对齐 Y）。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyRegistry, SimBody } from "./bodies";

interface Crater {
  dir: [number, number, number];
  r: number;
  depth: number;
}
interface ProcSpec {
  axis: [number, number, number];
  noise: number;
  seed: number;
  craters?: Crater[];
  waist?: number;
}
type ShapeSpec = { url: string; type: "glb" | "stl" } | ProcSpec;

const SHAPES: Record<string, ShapeSpec> = {
  bennu: { url: "shapes/bennu.glb", type: "glb" },
  itokawa: { url: "shapes/itokawa.stl", type: "stl" },
  eros: { url: "shapes/eros.stl", type: "stl" },
  phobos: {
    axis: [13.0, 11.4, 9.1], noise: 0.05, seed: 7,
    craters: [
      { dir: [0.93, 0.24, 0.28], r: 0.55, depth: 0.18 }, // Stickney
      { dir: [-0.6, 0.5, -0.4], r: 0.3, depth: 0.08 },
    ],
  },
  deimos: {
    axis: [7.8, 6.0, 5.1], noise: 0.07, seed: 11,
    craters: [{ dir: [0.4, 0.8, -0.3], r: 0.35, depth: 0.1 }],
  },
  "67p": { axis: [2.04, 1.66, 0.9], noise: 0.16, seed: 23, waist: 0.3 },
  haumea: { axis: [980, 759, 498], noise: 0.015, seed: 31 },
};

/* ─────────────────────────── 程序化噪声 ─────────────────────────── */

function hash3(x: number, y: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 144665);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number, seed: number): number {
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
function fbm3(x: number, y: number, z: number, seed: number, oct = 4): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, z * f, seed + i * 101);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

/* ─────────────────────────── 程序化网格 ─────────────────────────── */

function proceduralGeo(spec: ProcSpec): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 96, 64);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const maxAxis = Math.max(spec.axis[0], spec.axis[1], spec.axis[2]);
  const craters = (spec.craters ?? []).map((c) => ({ ...c, dir: norm3(c.dir) }));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1 + spec.noise * (fbm3(v.x * 2.1 + 13, v.y * 2.1 + 7, v.z * 2.1 + 31, spec.seed) - 0.5) * 2;
    for (const c of craters) {
      const dotc = Math.max(-1, Math.min(1, v.x * c.dir[0] + v.y * c.dir[1] + v.z * c.dir[2]));
      const ang = Math.acos(dotc);
      if (ang < c.r) {
        const t = ang / c.r;
        r -= c.depth * (0.5 + 0.5 * Math.cos(t * Math.PI));
        r += c.depth * 0.35 * Math.exp(-Math.pow((t - 0.85) / 0.18, 2)); // 坑缘隆起
      }
    }
    if (spec.waist) r *= 1 - spec.waist * Math.exp(-Math.pow(v.x / 0.3, 2)); // 双瓣颈部（67P）
    pos.setXYZ(
      i,
      (v.x * r * spec.axis[0]) / maxAxis,
      (v.y * r * spec.axis[1]) / maxAxis,
      (v.z * r * spec.axis[2]) / maxAxis,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function norm3(d: [number, number, number]): [number, number, number] {
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}

/* ─────────────────────────── 归一化（§4.6-2） ─────────────────────────── */

/** 3x3 实对称矩阵特征分解（解析法），返回特征值降序的 (值, 单位特征向量) */
function eigenSym3(a: number[][]): { val: number; vec: THREE.Vector3 }[] {
  const q = (a[0][0] + a[1][1] + a[2][2]) / 3;
  const p1 = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
  if (p1 < 1e-18) {
    return [0, 1, 2]
      .map((i) => ({ val: a[i][i], vec: new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0) }))
      .sort((x, y) => y.val - x.val);
  }
  const p2 = Math.sqrt(((a[0][0] - q) ** 2 + (a[1][1] - q) ** 2 + (a[2][2] - q) ** 2 + 2 * p1) / 6);
  const b = a.map((row, i) => row.map((v, j) => (i === j ? (v - q) / p2 : v / p2)));
  let r =
    (b[0][0] * (b[1][1] * b[2][2] - b[1][2] * b[2][1]) -
      b[0][1] * (b[1][0] * b[2][2] - b[1][2] * b[2][0]) +
      b[0][2] * (b[1][0] * b[2][1] - b[1][1] * b[2][0])) / 2;
  r = Math.max(-1, Math.min(1, r));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p2 * Math.cos(phi);
  const e3 = q + 2 * p2 * Math.cos(phi + (2 * Math.PI) / 3);
  const e2 = 3 * q - e1 - e3;
  const vecFor = (lam: number): THREE.Vector3 => {
    const m = [
      [a[0][0] - lam, a[0][1], a[0][2]],
      [a[1][0], a[1][1] - lam, a[1][2]],
      [a[2][0], a[2][1], a[2][2] - lam],
    ];
    const rows = m.map((row, i) => ({ i, n: Math.hypot(row[0], row[1], row[2]) })).sort((x, y) => y.n - x.n);
    const r1 = m[rows[0].i], r2 = m[rows[1].i];
    const v = new THREE.Vector3(
      r1[1] * r2[2] - r1[2] * r2[1],
      r1[2] * r2[0] - r1[0] * r2[2],
      r1[0] * r2[1] - r1[1] * r2[0],
    );
    if (v.lengthSq() < 1e-18) v.set(0, 1, 0);
    return v.normalize();
  };
  return [
    { val: e1, vec: vecFor(e1) },
    { val: e2, vec: vecFor(e2) },
    { val: e3, vec: vecFor(e3) },
  ].sort((x, y) => y.val - x.val);
}

/** 质心平移 + 主轴对齐（最小主轴→Y 自转轴，最大主轴→X）+ 单位最大半径 */
function normalizeGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = src.index ? src : mergeVertices(src, 1e-4);
  geo.computeBoundingBox();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  c.divideScalar(pos.count);
  geo.translate(-c.x, -c.y, -c.z);

  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    cov[0][0] += v.x * v.x; cov[0][1] += v.x * v.y; cov[0][2] += v.x * v.z;
    cov[1][1] += v.y * v.y; cov[1][2] += v.y * v.z;
    cov[2][2] += v.z * v.z;
  }
  cov[1][0] = cov[0][1]; cov[2][0] = cov[0][2]; cov[2][1] = cov[1][2];
  const eig = eigenSym3(cov);
  const xRow = eig[0].vec; // 长轴
  const yRow = eig[2].vec; // 短轴 = 自转轴
  const zRow = new THREE.Vector3().crossVectors(xRow, yRow).normalize();
  const m = new THREE.Matrix4().set(
    xRow.x, xRow.y, xRow.z, 0,
    yRow.x, yRow.y, yRow.z, 0,
    zRow.x, zRow.y, zRow.z, 0,
    0, 0, 0, 1,
  );
  geo.applyMatrix4(m);

  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    maxR = Math.max(maxR, v.length());
  }
  const s = 1 / maxR;
  geo.scale(s, s, s);
  geo.computeVertexNormals();
  return geo;
}

/* ─────────────────────────── 应用与 LOD ─────────────────────────── */

function finalize(body: SimBody, geo: THREE.BufferGeometry) {
  body.shapeGeo = geo;
  body.proxyGeo = new THREE.SphereGeometry(1, 12, 8);
  const mat = body.mesh.material as THREE.MeshStandardMaterial;
  mat.map = null; // 形状网格无 UV，改用纯色光照
  mat.color.set(body.color).multiplyScalar(0.85);
  mat.roughness = 0.95;
  mat.needsUpdate = true;
  body.mesh.geometry = geo;
  body.shapeLod = "shape";
}

export function applyShapes(reg: BodyRegistry) {
  const gltf = new GLTFLoader();
  const stl = new STLLoader();
  for (const [id, spec] of Object.entries(SHAPES)) {
    const body = reg.byId.get(id);
    if (!body) continue;
    if ("axis" in spec) {
      finalize(body, normalizeGeometry(proceduralGeo(spec)));
      continue;
    }
    const url = import.meta.env.BASE_URL + spec.url;
    if (spec.type === "glb") {
      gltf.load(
        url,
        (g) => g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) finalize(body, normalizeGeometry(mesh.geometry.clone()));
        }),
        undefined,
        () => {}, // 离线/缺文件：保留球体
      );
    } else {
      stl.load(url, (geo) => finalize(body, normalizeGeometry(geo)), undefined, () => {});
    }
  }
}

/** 屏幕半径 < 2.5px 回落低面数球（远距点/公告牌表示，§4.6-4） */
export function updateShapeLod(reg: BodyRegistry, camera: THREE.PerspectiveCamera) {
  const h = window.innerHeight;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  for (const b of reg.all) {
    if (!b.shapeGeo) continue;
    const dist = b.rootPos.distanceTo(camera.position);
    const px = dist > 0 ? (b.dispR / (2 * dist * tanHalf)) * h : 1e9;
    const want = px < 2.5 ? "proxy" : "shape";
    if (want !== b.shapeLod) {
      b.shapeLod = want;
      b.mesh.geometry = want === "proxy" ? b.proxyGeo! : b.shapeGeo;
    }
  }
}
