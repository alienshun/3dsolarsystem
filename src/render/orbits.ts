/**
 * 轨道线：与天体共用同一映射（观赏 f 或真实 km），保证严丝合缝（规格 §4.2）。
 * - 行星：samplePlanetOrbit（AU）缓存 30 天；写出时按模式变换
 * - 卫星：sampleMoonOrbit（km，相对母行星）→ 观赏环带映射或真实偏移，每帧重算
 * - 真实比例下行星坐标达 4.5e9 km，超出 float32 顶点精度：几何存「样本−原点」，
 *   line.position = 原点，由 float64 矩阵合成抵消，顶点属性保持小值。
 */
import * as THREE from "three";
import { PLANETS } from "../data/planets";
import { MOONS } from "../data/moons";
import { SMALL_BODIES } from "../data/sbdb";
import { samplePlanetOrbit, sampleMoonOrbit, type PlanetElements } from "../core/elements";
import { grPerihelionDegPerCy } from "../core/relativity";
import { toDisplay, moonRingRadius, displayRadius, KM_PER_AU } from "./scale";
import type { BodyRegistry, ScaleMode } from "./bodies";

const PLANET_SEG = 320;
const SMALL_SEG = 360;
const MOON_SEG = 96;
const PLANET_REFRESH_DAYS = 30;

interface HelioLineDef {
  id: string;
  elements: PlanetElements;
  seg: number;
}

export class OrbitLines {
  private planetLines = new Map<string, THREE.Line>();
  private moonLines = new Map<string, THREE.Line>();
  private planetSamples = new Map<string, Float32Array>();
  private helioDefs: HelioLineDef[] = [];
  private grOn = false;
  private lastGrOn = false;
  private showHelio = true;
  private showMoonGlobal = true;
  /** 单天体轨道开关（规格外增量功能）：与全局开关相与 */
  private bodyOn = new Map<string, boolean>();
  private lastPlanetJd = Number.NaN;
  private lastOrigin = new THREE.Vector3(Number.NaN, 0, 0);
  private mode: ScaleMode = "display";

  constructor(world: THREE.Object3D, private reg: BodyRegistry) {
    for (const p of PLANETS) this.helioDefs.push({ id: p.id, elements: p.elements, seg: PLANET_SEG });
    for (const s of SMALL_BODIES) this.helioDefs.push({ id: s.id, elements: s.elements, seg: SMALL_SEG });
    for (const d of this.helioDefs) {
      const isPlanet = d.seg === PLANET_SEG;
      const color = isPlanet ? PLANETS.find((p) => p.id === d.id)!.color : SMALL_BODIES.find((s) => s.id === d.id)!.color;
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: isPlanet ? 0.38 : 0.3, depthWrite: false });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((d.seg + 1) * 3), 3));
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      world.add(line);
      this.planetLines.set(d.id, line);
    }
    // 卫星环带半径与 bodies.ts 相同算法（依赖 a 范围与母行星显示半径）
    const aRange = new Map<string, { min: number; max: number }>();
    for (const m of MOONS) {
      const r = aRange.get(m.parent) ?? { min: Infinity, max: -Infinity };
      r.min = Math.min(r.min, m.elements.aKm);
      r.max = Math.max(r.max, m.elements.aKm);
      aRange.set(m.parent, r);
    }
    for (const m of MOONS) {
      const mat = new THREE.LineBasicMaterial({ color: 0x8fa3cc, transparent: true, opacity: 0.22, depthWrite: false });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((MOON_SEG + 1) * 3), 3));
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.userData.parent = m.parent;
      const range = aRange.get(m.parent)!;
      const parent = reg.byId.get(m.parent)!;
      line.userData.ringR = moonRingRadius(m.elements.aKm, range.min, range.max, displayRadius(parent.radiusKm));
      line.userData.aKm = m.elements.aKm;
      world.add(line);
      this.moonLines.set(m.id, line);
    }
  }

  setVisible(showPlanetOrbits: boolean, showMoonOrbits: boolean) {
    this.showHelio = showPlanetOrbits;
    this.showMoonGlobal = showMoonOrbits;
    this.applyAll();
  }

  setBodyOrbit(id: string, on: boolean) {
    this.bodyOn.set(id, on);
    this.applyOne(id);
  }

  private applyOne(id: string) {
    const isMoon = this.moonLines.has(id);
    const line = this.planetLines.get(id) ?? this.moonLines.get(id);
    if (line) line.visible = (this.bodyOn.get(id) ?? true) && (isMoon ? this.showMoonGlobal : this.showHelio);
  }

  private applyAll() {
    for (const [id] of this.planetLines) this.applyOne(id);
    for (const [id] of this.moonLines) this.applyOne(id);
  }

  setMode(mode: ScaleMode) {
    this.mode = mode;
  }

  setGR(on: boolean) {
    this.grOn = on;
  }

  private grRate(el: PlanetElements): number {
    return this.grOn ? grPerihelionDegPerCy(el.a, el.e) : 0;
  }

  update(jd: number, origin: THREE.Vector3) {
    // 轨道样本（30 天以上跨度或 GR 开关变化才重算，根数漂移极慢）
    const refreshed = !(Math.abs(jd - this.lastPlanetJd) < PLANET_REFRESH_DAYS) || this.grOn !== this.lastGrOn;
    if (refreshed) {
      for (const d of this.helioDefs) {
        const phys = samplePlanetOrbit(d.elements, jd, d.seg, this.grRate(d.elements));
        let buf = this.planetSamples.get(d.id);
        if (!buf) {
          buf = new Float32Array((d.seg + 1) * 3);
          this.planetSamples.set(d.id, buf);
        }
        buf.set(phys);
      }
      this.lastPlanetJd = jd;
      this.lastGrOn = this.grOn;
    }
    const originMoved = !origin.equals(this.lastOrigin);
    if (refreshed || originMoved) {
      for (const d of this.helioDefs) {
        const line = this.planetLines.get(d.id)!;
        const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const s0 = this.planetSamples.get(d.id)!;
        for (let s = 0; s <= d.seg; s++) {
          const ax = s0[s * 3], ay = s0[s * 3 + 1], az = s0[s * 3 + 2];
          if (this.mode === "display") {
            toDisplay(ax, ay, az, _v);
            arr[s * 3] = _v.x - origin.x; arr[s * 3 + 1] = _v.y - origin.y; arr[s * 3 + 2] = _v.z - origin.z;
          } else {
            arr[s * 3] = ax * KM_PER_AU - origin.x;
            arr[s * 3 + 1] = ay * KM_PER_AU - origin.y;
            arr[s * 3 + 2] = az * KM_PER_AU - origin.z;
          }
        }
        attr.needsUpdate = true;
        line.position.copy(origin);
      }
    }
    // 卫星轨道（跟随母行星位置，每帧重算）
    for (const m of MOONS) {
      const line = this.moonLines.get(m.id)!;
      if (!line.visible) continue;
      const parent = this.reg.byId.get(m.parent)!;
      const ringR = line.userData.ringR as number;
      const aKm = line.userData.aKm as number;
      const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const phys = sampleMoonOrbit(m.elements, MOON_SEG);
      const arr = attr.array as Float32Array;
      for (let s = 0; s <= MOON_SEG; s++) {
        const x = phys[s * 3], y = phys[s * 3 + 1], z = phys[s * 3 + 2];
        let px = x, py = y, pz = z;
        if (this.mode === "display") {
          const r = Math.sqrt(x * x + y * y + z * z) || 1;
          const k = (ringR * (r / aKm)) / r;
          px = x * k; py = y * k; pz = z * k;
        }
        arr[s * 3] = parent.dispPos.x + px - origin.x;
        arr[s * 3 + 1] = parent.dispPos.y + py - origin.y;
        arr[s * 3 + 2] = parent.dispPos.z + pz - origin.z;
      }
      attr.needsUpdate = true;
      line.position.copy(origin);
    }
    this.lastOrigin.copy(origin);
  }
}

const _v = new THREE.Vector3();
