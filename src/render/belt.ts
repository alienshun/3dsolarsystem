/**
 * 主小行星带点云（规格 §6 阶段 2）：数千颗合成小行星，根数按主带统计分布采样
 * （a ∈ [2.06, 3.28] AU 含 Kirkwood 间隙、e 偏瑞利、i 低倾角为主），位置为 t 的纯函数。
 * 渲染：THREE.Points（屏幕恒定像素大小），几何存「位置−原点」对抗 float32 精度。
 */
import * as THREE from "three";
import { solveKepler } from "../core/kepler";
import { toDisplay, KM_PER_AU } from "./scale";
import { daysSinceJ2000 } from "../core/time";

const N = 4000;
const DEG = Math.PI / 180;

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kirkwood 间隙（3:1、5:2、2:1 等共振）位置 */
const GAPS = [2.502, 2.825, 2.958, 3.279];

export class AsteroidBelt {
  readonly points: THREE.Points;
  private a = new Float64Array(N);
  private e = new Float64Array(N);
  private inc = new Float64Array(N);
  private node = new Float64Array(N);
  private peri = new Float64Array(N);
  private m0 = new Float64Array(N);
  private nRad = new Float64Array(N);
  private lastKey = "";

  constructor(world: THREE.Object3D) {
    const rnd = mulberry(20261011);
    for (let k = 0; k < N; k++) {
      let a = 0;
      do {
        a = 2.06 + rnd() * (3.28 - 2.06);
      } while (GAPS.some((g) => Math.abs(a - g) < 0.02));
      this.a[k] = a;
      this.e[k] = Math.min(0.25, 0.25 * Math.pow(rnd(), 1.8));
      this.inc[k] = 18 * Math.pow(rnd(), 2.0) * DEG;
      this.node[k] = rnd() * Math.PI * 2;
      this.peri[k] = rnd() * Math.PI * 2;
      this.m0[k] = rnd() * Math.PI * 2;
      this.nRad[k] = (2 * Math.PI) / (365.25 * Math.pow(a, 1.5));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const colors = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const t = 0.45 + rnd() * 0.35;
      colors[k * 3] = t;
      colors[k * 3 + 1] = t * (0.92 + rnd() * 0.06);
      colors[k * 3 + 2] = t * (0.8 + rnd() * 0.1);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    world.add(this.points);
  }

  setVisible(v: boolean) {
    this.points.visible = v;
  }

  update(jd: number, origin: THREE.Vector3, trueMode: boolean) {
    if (!this.points.visible) return;
    const key = `${jd}|${origin.x}|${origin.y}|${origin.z}|${trueMode ? 1 : 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const d = daysSinceJ2000(jd);
    const attr = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let k = 0; k < N; k++) {
      const e = this.e[k];
      const M = this.m0[k] + this.nRad[k] * d;
      const E = solveKepler(M, e);
      const r = this.a[k] * (1 - e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      const xp = r * Math.cos(nu);
      const yp = r * Math.sin(nu);
      const iR = this.inc[k], nodeR = this.node[k];
      const wR = this.peri[k] - nodeR;
      const cw = Math.cos(wR), sw = Math.sin(wR);
      const cO = Math.cos(nodeR), sO = Math.sin(nodeR);
      const ci = Math.cos(iR), si = Math.sin(iR);
      const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
      const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
      const ze = sw * si * xp + cw * si * yp;
      if (trueMode) {
        arr[k * 3] = xe * KM_PER_AU - origin.x;
        arr[k * 3 + 1] = ze * KM_PER_AU - origin.y;
        arr[k * 3 + 2] = -ye * KM_PER_AU - origin.z;
      } else {
        toDisplay(xe, ze, -ye, _v);
        arr[k * 3] = _v.x; arr[k * 3 + 1] = _v.y; arr[k * 3 + 2] = _v.z;
      }
    }
    attr.needsUpdate = true;
    this.points.position.copy(origin);
  }
}

const _v = new THREE.Vector3();
