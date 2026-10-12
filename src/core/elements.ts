/**
 * 根数漂移传播 + 开普勒解算 + 坐标旋转（规格 §4.1）。
 * 行星：JPL 近似根数（J2000 元 + 每世纪漂移率），1800–2050 精确。
 * 卫星：静态根数（J2000），相对母行星定义，解算后叠加母行星位置。
 *
 * 物理坐标系：日心黄道系（J2000 黄道），单位 AU / km。
 * 返回 Three.js 坐标：X = 黄道 x，Y = 黄道 z（北黄极），Z = −黄道 y。
 */
import { solveKepler, normalizeAnglePi } from "./kepler";
import { julianCenturies, daysSinceJ2000 } from "./time";

/** JPL 近似根数（行星）：a [AU, AU/cy], e, I [deg], L [deg, deg/cy], ϖ [deg, deg/cy], Ω [deg, deg/cy] */
export interface PlanetElements {
  a: number; aDot: number;
  e: number; eDot: number;
  i: number; iDot: number;
  L: number; LDot: number;
  peri: number; periDot: number; // ϖ 近日点黄经
  node: number; nodeDot: number; // Ω 升交点黄经
}

/** 卫星根数（J2000，静态）：a [km], P [天] */
export interface MoonElements {
  aKm: number;
  e: number;
  iDeg: number;       // 相对参考平面（母行星赤道面，月球相对黄道面）
  periodDays: number;
  nodeDeg: number;    // Ω
  argPeriDeg: number; // ω
  M0Deg: number;      // J2000 平近点角
}

export interface HeliocentricState {
  /** Three.js 坐标（AU） */
  x: number; y: number; z: number;
  /** 轨道根数快照 */
  aAU: number; e: number;
  /** 向径 AU */
  rAU: number;
}

const DEG = Math.PI / 180;

/** 传播行星根数到 T（世纪数）；grPeriDotDegPerCy 为 GR 近日点进动附加漂移（规格 §4.5-A） */
export function propagatePlanet(el: PlanetElements, T: number, grPeriDotDegPerCy = 0) {
  return {
    a: el.a + el.aDot * T,
    e: el.e + el.eDot * T,
    i: el.i + el.iDot * T,
    L: el.L + el.LDot * T,
    peri: el.peri + (el.periDot + grPeriDotDegPerCy) * T,
    node: el.node + el.nodeDot * T,
  };
}

/** 传播卫星平近点角（M = M0 + n·Δt，n = 360/P deg/day） */
export function moonMeanAngle(el: MoonElements, jd: number): number {
  const n = 360 / el.periodDays; // deg/day
  return (el.M0Deg + n * daysSinceJ2000(jd)) * DEG;
}

/**
 * 行星日心位置（AU）—— 开普勒解算管线完整六步。
 * 纯函数：位置只依赖 jd。
 */
export function planetHeliocentric(el: PlanetElements, jd: number, grPeriDotDegPerCy = 0): HeliocentricState {
  const T = julianCenturies(jd);
  const p = propagatePlanet(el, T, grPeriDotDegPerCy);

  // 平近点角 M = L − ϖ
  const M = normalizeAnglePi((p.L - p.peri) * DEG);
  const E = solveKepler(M, p.e);
  // 向径与真近点角
  const rAU = p.a * (1 - p.e * Math.cos(E));
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + p.e) * Math.sin(E / 2),
    Math.sqrt(1 - p.e) * Math.cos(E / 2)
  );

  // 轨道面坐标
  const xp = rAU * Math.cos(nu);
  const yp = rAU * Math.sin(nu);

  // Rz(Ω)·Rx(i)·Rz(ω) 旋入日心黄道系
  const iR = p.i * DEG, nodeR = p.node * DEG;
  const wR = (p.peri - p.node) * DEG; // ω = ϖ − Ω
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const cO = Math.cos(nodeR), sO = Math.sin(nodeR);
  const ci = Math.cos(iR), si = Math.sin(iR);

  const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const ze = sw * si * xp + cw * si * yp;

  // 黄道 (x,y,z) → Three.js (x, z, −y)：北黄极朝 +Y
  return { x: xe, y: ze, z: -ye, aAU: p.a, e: p.e, rAU };
}

/**
 * 卫星相对母行星的位置（km），参考平面由数据定义。
 * 返回 Three.js 坐标方向约定与行星一致（参考平面 = 局部 XZ 面）。
 */
export function moonRelative(el: MoonElements, jd: number): { x: number; y: number; z: number; rKm: number } {
  const M = moonMeanAngle(el, jd);
  const E = solveKepler(M, el.e);
  const rKm = el.aKm * (1 - el.e * Math.cos(E));
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + el.e) * Math.sin(E / 2),
    Math.sqrt(1 - el.e) * Math.cos(E / 2)
  );
  const xp = rKm * Math.cos(nu);
  const yp = rKm * Math.sin(nu);

  const iR = el.iDeg * DEG, nodeR = el.nodeDeg * DEG, wR = el.argPeriDeg * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const cO = Math.cos(nodeR), sO = Math.sin(nodeR);
  const ci = Math.cos(iR), si = Math.sin(iR);

  const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const ze = sw * si * xp + cw * si * yp;

  return { x: xe, y: ze, z: -ye, rKm };
}

/**
 * 轨道线采样：行星椭圆（给定 T 的根数），返回 Three.js 坐标点数组（AU）。
 */
export function samplePlanetOrbit(el: PlanetElements, jd: number, segments: number, grPeriDotDegPerCy = 0): Float32Array {
  const T = julianCenturies(jd);
  const p = propagatePlanet(el, T, grPeriDotDegPerCy);
  const iR = p.i * DEG, nodeR = p.node * DEG;
  const wR = (p.peri - p.node) * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const cO = Math.cos(nodeR), sO = Math.sin(nodeR);
  const ci = Math.cos(iR), si = Math.sin(iR);

  const out = new Float32Array((segments + 1) * 3);
  const b = p.a * Math.sqrt(1 - p.e * p.e);
  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    // 焦点（太阳）在原点的椭圆参数化：与 planetHeliocentric 的 ν 解算同轨
    const xp = p.a * (Math.cos(E) - p.e);
    const yp = b * Math.sin(E);
    const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
    const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
    const ze = sw * si * xp + cw * si * yp;
    out[s * 3] = xe;
    out[s * 3 + 1] = ze;
    out[s * 3 + 2] = -ye;
  }
  return out;
}

/** 卫星轨道线采样（km，相对母行星） */
export function sampleMoonOrbit(el: MoonElements, segments: number): Float32Array {
  const iR = el.iDeg * DEG, nodeR = el.nodeDeg * DEG, wR = el.argPeriDeg * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const cO = Math.cos(nodeR), sO = Math.sin(nodeR);
  const ci = Math.cos(iR), si = Math.sin(iR);

  const out = new Float32Array((segments + 1) * 3);
  const b = el.aKm * Math.sqrt(1 - el.e * el.e);
  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    const xp = el.aKm * (Math.cos(E) - el.e);
    const yp = b * Math.sin(E);
    const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
    const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
    const ze = sw * si * xp + cw * si * yp;
    out[s * 3] = xe;
    out[s * 3 + 1] = ze;
    out[s * 3 + 2] = -ye;
  }
  return out;
}
