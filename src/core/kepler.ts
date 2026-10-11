/**
 * 开普勒方程求解。
 * 规格 §4.1：e < 0.8 牛顿迭代（初值 E0 = M + e·sinM）；
 * 高偏心率（彗星 e→0.995）用 Danby 初值 + 保括弧牛顿（越界退化为二分），保证全局收敛。
 */

const TWO_PI = Math.PI * 2;

/** 角度归一到 [0, 2π) */
export function normalizeAngle(rad: number): number {
  let r = rad % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

/** 归一到 [-π, π) */
export function normalizeAnglePi(rad: number): number {
  let r = rad % TWO_PI;
  if (r < -Math.PI) r += TWO_PI;
  if (r >= Math.PI) r -= TWO_PI;
  return r;
}

/**
 * 解开普勒方程 M = E − e·sinE，返回偏近点角 E（弧度）。
 * @param M 平近点角（弧度，任意范围）
 * @param e 离心率（0 ≤ e < 1）
 */
export function solveKepler(M: number, e: number): number {
  const Mn = normalizeAnglePi(M);
  if (e < 0.8) {
    let E = Mn + e * Math.sin(Mn);
    for (let i = 0; i < 8; i++) {
      const f = E - e * Math.sin(E) - Mn;
      const fp = 1 - e * Math.cos(E);
      const dE = f / fp;
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  }
  // f(E) = E − e·sinE − Mn 在 [-π, π] 单调递增，维护 f 的符号括弧
  let lo = -Math.PI;
  let hi = Math.PI;
  let E = Mn + 0.85 * e * (Math.sin(Mn) >= 0 ? 1 : -1);
  if (E > hi) E = hi;
  if (E < lo) E = lo;
  for (let i = 0; i < 64; i++) {
    const f = E - e * Math.sin(E) - Mn;
    if (Math.abs(f) < 1e-12) return E;
    if (f > 0) hi = E;
    else lo = E;
    const fp = 1 - e * Math.cos(E);
    let En = E - f / fp;
    if (!Number.isFinite(En) || En <= lo || En >= hi) En = 0.5 * (lo + hi);
    if (Math.abs(En - E) < 1e-13) return En;
    E = En;
  }
  return E;
}

/**
 * 由偏近点角求真近点角 ν（弧度）与向径 r（与 a 同单位）。
 * tan(ν/2) = √((1+e)/(1−e))·tan(E/2)；r = a(1 − e·cosE)
 */
export function trueAnomaly(E: number, e: number): { nu: number; r: number } {
  const halfE = E / 2;
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(halfE), Math.sqrt(1 - e) * Math.cos(halfE));
  return { nu, r: NaN }; // r 由调用者用 a(1-e·cosE) 计算，避免重复传 a
}

/** vis-viva 轨道速度（km/s）：v = √(GM(2/r − 1/a))，r/a 单位 km */
export function orbitalSpeed(GM: number, rKm: number, aKm: number): number {
  return Math.sqrt(GM * (2 / rKm - 1 / aKm));
}
