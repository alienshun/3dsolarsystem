/**
 * 人造卫星点云渲染（规格 §4.3 阶段 4）：
 * - InstancedMesh 万级点云；位置由 Worker 回传的 ECI(TEME, km) 变换而来
 * - 变换链：ECI --Rz(GMST)ᵀ--> ECEF --赤道→黄道--> scene（x_ecl, z_ecl, −y_ecl）
 * - 缩放：true 模式 km→scene=1；display 模式按地球显示半径等比（satScale=earthDispR/6371）
 * - 选中目标精轨线：单周期采样点列画 Line
 * 过滤（星座/搜索）以实例缩放 0 折叠隐藏，保持 instance 数恒定。
 */
import * as THREE from "three";

const OBLIQUITY = (23.4392811 * Math.PI) / 180;
const COS_OBL = Math.cos(OBLIQUITY);
const SIN_OBL = Math.sin(OBLIQUITY);

/** ECEF(赤道, km) → scene 方向（不含平移/缩放） */
export function ecfToScene(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const ye = y * COS_OBL - z * SIN_OBL;
  const ze = y * SIN_OBL + z * COS_OBL;
  return out.set(x, ze, -ye);
}

/** ECI(TEME, km) → ECEF( km )，绕 Z 旋转 −GMST */
export function eciToEcf(x: number, y: number, z: number, gmst: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(gmst), s = Math.sin(gmst);
  return out.set(x * c + y * s, -x * s + y * c, z);
}

const _ecf = new THREE.Vector3();

export class SatelliteCloud {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private orbitLine: THREE.Line | null = null;
  private count = 0;
  private dotSize = 1;
  /** 每实例可见掩码（1 显示 / 0 折叠） */
  private mask: Uint8Array = new Uint8Array(0);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** 由 TLE 条目数重建点云（尺寸占位，位置由 update 填） */
  rebuild(count: number) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
    }
    this.count = count;
    this.mask = new Uint8Array(count).fill(1);
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    // 初始全部折叠在原点，等 update 填位置
    const m = this.mesh.instanceMatrix.array as Float32Array;
    m.fill(0);
    this.group.add(this.mesh);
  }

  /** 设置点尺寸与可见掩码（掩码长度需等于 count） */
  setDotSize(size: number) {
    this.dotSize = size;
  }

  setMask(mask: Uint8Array) {
    if (mask.length === this.count) this.mask = mask;
  }

  get visibleCount(): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) n += this.mask[i];
    return n;
  }

  /**
   * 每帧/每次 Worker 回传后更新实例位置。
   * @param buf ECI km，长度 3*count（NaN = 传播失败，折叠）
   * @param gmst 格林尼治恒星时（rad）
   * @param earthPos 地球 scene 位置
   * @param kmToScene km→scene 缩放
   */
  update(buf: Float32Array, gmst: number, earthPos: THREE.Vector3, kmToScene: number) {
    const mesh = this.mesh;
    if (!mesh || buf.length < this.count * 3) return;
    const m = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const o = i * 16;
      const x = buf[i * 3], y = buf[i * 3 + 1], z = buf[i * 3 + 2];
      if (!this.mask[i] || !Number.isFinite(x)) {
        m[o] = 0; m[o + 5] = 0; m[o + 10] = 0;
        m[o + 12] = 0; m[o + 13] = 0; m[o + 14] = 0;
        continue;
      }
      eciToEcf(x, y, z, gmst, _ecf);
      ecfToScene(_ecf.x, _ecf.y, _ecf.z, _ecf);
      const s = this.dotSize;
      m[o] = s; m[o + 5] = s; m[o + 10] = s;
      m[o + 12] = earthPos.x + _ecf.x * kmToScene;
      m[o + 13] = earthPos.y + _ecf.y * kmToScene;
      m[o + 14] = earthPos.z + _ecf.z * kmToScene;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** 选中目标精轨线（ECI km 点列） */
  setOrbitLine(buf: Float32Array, gmst: number, earthPos: THREE.Vector3, kmToScene: number) {
    this.clearOrbitLine();
    const n = Math.floor(buf.length / 3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = buf[i * 3], y = buf[i * 3 + 1], z = buf[i * 3 + 2];
      if (!Number.isFinite(x)) { pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0; continue; }
      eciToEcf(x, y, z, gmst, _ecf);
      ecfToScene(_ecf.x, _ecf.y, _ecf.z, _ecf);
      pos[i * 3] = earthPos.x + _ecf.x * kmToScene;
      pos[i * 3 + 1] = earthPos.y + _ecf.y * kmToScene;
      pos[i * 3 + 2] = earthPos.z + _ecf.z * kmToScene;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    this.orbitLine = new THREE.Line(geo, mat);
    this.orbitLine.frustumCulled = false;
    this.group.add(this.orbitLine);
  }

  clearOrbitLine() {
    if (this.orbitLine) {
      this.group.remove(this.orbitLine);
      this.orbitLine.geometry.dispose();
      (this.orbitLine.material as THREE.Material).dispose();
      this.orbitLine = null;
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  dispose() {
    this.clearOrbitLine();
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
      this.mesh = null;
    }
  }
}
