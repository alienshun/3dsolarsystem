/**
 * 显示变换 f（规格 §4.2，观赏模式）：
 * - 日心距离：d′ = (d/1AU)^γ · K，γ = 0.4，K = 30（地球轨道 ≈ 30 单位）
 * - 天体半径：幂律夸张 R′ = C·R_km^0.4 + 保底最小值
 * - 卫星系统：相对母行星的方向保留，轨道半径按对数压缩映射到
 *   [1.8·R′planet, 5·R′planet] 环带内（否则物理 AU 尺度下卫星与行星重叠）
 * 仿真层（AU/km）永远不感知这些变换；一切只在渲染入口应用。
 */
import * as THREE from "three";

export const GAMMA_VIEW = 0.4;
export const DIST_K = 30;
export const RADIUS_C = 0.02;
export const RADIUS_P = 0.4;
export const MIN_DISPLAY_RADIUS = 0.08;
export const KM_PER_AU = 149597870.7;

/** 日心距离 AU → 显示单位 */
export function displayDistance(rAU: number): number {
  return Math.pow(Math.max(rAU, 1e-12), GAMMA_VIEW) * DIST_K;
}

/** 真实半径 km → 显示半径（对数式夸张 + 保底） */
export function displayRadius(radiusKm: number): number {
  return Math.max(MIN_DISPLAY_RADIUS, RADIUS_C * Math.pow(radiusKm, RADIUS_P));
}

/** 日心物理向量（AU，Three 坐标系）→ 显示向量（径向幂缩放） */
export function toDisplay(xAU: number, yAU: number, zAU: number, out: THREE.Vector3): THREE.Vector3 {
  const r = Math.sqrt(xAU * xAU + yAU * yAU + zAU * zAU);
  if (r < 1e-15) return out.set(0, 0, 0);
  const s = displayDistance(r) / r;
  return out.set(xAU * s, yAU * s, zAU * s);
}

/**
 * 卫星轨道环带半径（显示单位）：
 * 系统内按 ln(a) 在 [1.8R, 5R] 之间对数排布；单卫星系统取 3R。
 */
export function moonRingRadius(aKm: number, aMinKm: number, aMaxKm: number, planetDisplayR: number): number {
  if (aMaxKm <= aMinKm * 1.0001) return 3.0 * planetDisplayR;
  const t = Math.log(aKm / aMinKm) / Math.log(aMaxKm / aMinKm);
  return planetDisplayR * (1.8 + 3.2 * t);
}

/** 流速滑杆（0..1000）→ 天/秒，对数映射 [1 秒/秒, 1 年/秒] */
const LOG_MIN = Math.log10(1 / 86400);
const LOG_MAX = Math.log10(365.25);
export function sliderToRate(v: number): number {
  const t = Math.min(1, Math.max(0, v / 1000));
  return Math.pow(10, LOG_MIN + (LOG_MAX - LOG_MIN) * t);
}
export function rateToSlider(rate: number): number {
  const t = (Math.log10(rate) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.round(Math.min(1, Math.max(0, t)) * 1000);
}
/** 1 天/秒对应的滑杆位置 */
export const SLIDER_ONE_DAY = rateToSlider(1);

/** 流速可读文本 */
export function formatRate(rateDaysPerSec: number): string {
  const s = rateDaysPerSec * 86400;
  const fmt = (v: number, unit: string) => {
    const dec = v >= 100 ? 0 : v >= 10 ? 1 : Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2;
    return `${v.toFixed(dec)} ${unit}/秒`;
  };
  if (s < 90) return fmt(s, "秒");
  const m = s / 60;
  if (m < 90) return fmt(m, "分");
  const h = m / 60;
  if (h < 24) return fmt(h, "小时");
  const d = h / 24;
  if (d < 300) return fmt(d, "天");
  const mo = d / 30.44;
  if (mo < 18) return fmt(mo, "月");
  return fmt(d / 365.25, "年");
}
