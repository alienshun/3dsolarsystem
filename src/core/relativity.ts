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

/* ── 深度 C：时钟膨胀与光行时（规格 §4.5-C） ── */

const GM_EARTH = 398600.4418; // km³/s²

/** 1 AU 光行时（分钟） */
export const LIGHT_MIN_PER_AU = KM_PER_AU / C / 60;

/** 固有时率偏差 dτ/dt − 1 ≈ −GM/(rc²) − v²/(2c²)（r [km]、v [km/s]） */
export function clockRateDeviation(rKm: number, vKmS: number, gmKm3S2: number = GM_SUN): number {
  return -gmKm3S2 / (rKm * C * C) - (vKmS * vKmS) / (2 * C * C);
}

/** GPS 星载钟相对地表钟偏移 ≈ +38.6 μs/天（引力蓝移 +45.6 − 速度钟慢 −7.0） */
export function gpsClockOffsetUsPerDay(): number {
  const rGps = 26562, vGps = 3.874; // 中圆轨道 20180 km 高度
  const rSurf = 6371, vSurf = 0.465; // 赤道自转速度
  const d = clockRateDeviation(rGps, vGps, GM_EARTH) - clockRateDeviation(rSurf, vSurf, GM_EARTH);
  return d * 86400 * 1e6;
}
