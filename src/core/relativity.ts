/**
 * 广义相对论深度 A（规格 §4.5）：近日点进动解析修正。
 * Δϖ = 6πGM☉/(c²·a·(1−e²)) 每轨道周期（弧度），换算为 deg/世纪 后并入根数漂移。
 * 水星 ≈ 42.98″/世纪（验收 ≈ 43″/世纪）。
 */

const GM_SUN = 1.32712440018e11; // km³/s²
const C = 299792.458; // km/s
const KM_PER_AU = 149597870.7;

/** GR 近日点进动速率（deg/世纪）；aAU 半长轴，e 离心率 */
export function grPerihelionDegPerCy(aAU: number, e: number): number {
  const aKm = aAU * KM_PER_AU;
  const radPerOrbit = (6 * Math.PI * GM_SUN) / (C * C * aKm * (1 - e * e));
  const periodYears = Math.pow(aAU, 1.5);
  return ((radPerOrbit * (100 / periodYears)) * 180) / Math.PI;
}

/** 弧秒/世纪（信息展示与校验用） */
export function grPerihelionArcsecPerCy(aAU: number, e: number): number {
  return grPerihelionDegPerCy(aAU, e) * 3600;
}
