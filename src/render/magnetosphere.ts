/**
 * 磁层偶极磁力线（规格 §6 阶段 3）：
 * - 偶极场线 r = L·sin²θ（θ 为磁余纬），L 以行星半径为单位
 * - 多个子午面绕磁轴旋转铺成偶极笼；磁轴相对自转轴有额外倾角
 * - 仅地球 / 木星 / 土星；尺度随 setScaleMode 同步（几何以行星半径为单位）
 * 可见性由 state.showMag 控制（main.ts）。
 */
import * as THREE from "three";
import type { SimBody } from "./bodies";

interface MagSpec {
  /** 磁轴相对自转轴的倾角（deg） */
  tiltDeg: number;
  /** L 壳（行星半径单位） */
  shells: number[];
  color: number;
  opacity: number;
}

const MAG: Record<string, MagSpec> = {
  earth: { tiltDeg: 11.0, shells: [2.2, 3.2, 4.5], color: 0x5aa0ff, opacity: 0.5 },
  jupiter: { tiltDeg: 9.6, shells: [2.4, 4.0, 6.5], color: 0xffc070, opacity: 0.45 },
  saturn: { tiltDeg: 0.96, shells: [2.2, 3.4, 5.0], color: 0xd8e0ff, opacity: 0.4 },
};

const AZIMUTHS = 8;
const SEGMENTS = 72;
// 场线两端在极点收拢，θ 避开奇异点
const THETA_MIN = 0.18;

function buildLines(spec: MagSpec): THREE.LineSegments {
  const verts: number[] = [];
  for (const L of spec.shells) {
    for (let a = 0; a < AZIMUTHS; a++) {
      const phi = (a / AZIMUTHS) * Math.PI * 2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      // 逐段折线 → LineSegments（成对顶点）
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = THETA_MIN + (Math.PI - 2 * THETA_MIN) * (i / SEGMENTS);
        const st = Math.sin(t);
        const r = L * st * st;
        // 以 +Y 为磁轴：x=r·sinθ·cosφ, y=r·cosθ, z=r·sinθ·sinφ
        const q = new THREE.Vector3(r * st * cp, r * Math.cos(t), r * st * sp);
        if (prev) verts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        prev = q;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: spec.color, transparent: true, opacity: spec.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.LineSegments(geo, mat);
}

/** 给行星挂磁层偶极线；返回组已加入 tiltGroup，尺度以行星半径为单位（setScaleMode 缩放） */
export function addMagnetosphere(b: SimBody, tiltGroup: THREE.Object3D) {
  const spec = MAG[b.id];
  if (!spec) return;
  const group = new THREE.Group();
  // 磁轴相对自转轴的额外倾角（tiltGroup 已承担自转轴倾角）
  group.rotation.z = (spec.tiltDeg * Math.PI) / 180;
  const lines = buildLines(spec);
  group.add(lines);
  group.scale.setScalar(b.dispR);
  tiltGroup.add(group);
  b.magGroup = group;
}
