/**
 * 行星根数：JPL "Approximate Positions of the Major Planets"（ssd.jpl.nasa.gov/planets/approx_pos.html）
 * 1800–2050 精确。a [AU, AU/cy]；e [–, /cy]；I [deg, /cy]；L [deg, /cy]；ϖ [deg, /cy]；Ω [deg, /cy]。
 * 表值 3000–3000AD 版本（Table 1：a e I L long.peri long.node）。
 * 每行: a, aDot, e, eDot, i, iDot, L, LDot, peri, periDot, node, nodeDot
 */
import type { PlanetElements } from "../core/elements";

export interface PlanetDef {
  id: string;
  name: string;
  nameEn: string;
  color: number;
  /** 赤道半径 km */
  radiusKm: number;
  /** 自转周期 小时（负 = 逆行，金星/天王星） */
  rotationHours: number;
  /** 轴倾角 deg */
  axialTiltDeg: number;
  /** 质量 kg（用于信息卡） */
  massKg: number;
  elements: PlanetElements;
  fact: string;
}

export const PLANETS: PlanetDef[] = [
  {
    id: "mercury", name: "水星", nameEn: "Mercury",
    color: 0x9c8f84, radiusKm: 2439.7, rotationHours: 1407.6, axialTiltDeg: 0.034,
    massKg: 3.301e23,
    elements: { a: 0.38709927, aDot: 0.00000037, e: 0.20563593, eDot: 0.00001906, i: 7.00497902, iDot: -0.00594749, L: 252.25032350, LDot: 149472.67411175, peri: 77.45779628, periDot: 0.16047689, node: 48.33076593, nodeDot: -0.12534081 },
    fact: "最小、最内侧的行星。昼夜温差约 610°C；近日点进动 43″/世纪是广义相对论的经典验证。",
  },
  {
    id: "venus", name: "金星", nameEn: "Venus",
    color: 0xe6c98f, radiusKm: 6051.8, rotationHours: -5832.5, axialTiltDeg: 177.36,
    massKg: 4.867e24,
    elements: { a: 0.72333566, aDot: 0.00000390, e: 0.00677672, eDot: -0.00004107, i: 3.39467605, iDot: -0.00078890, L: 181.97909950, LDot: 58517.81538729, peri: 131.60246718, periDot: 0.00268329, node: 76.67984255, nodeDot: -0.27769418 },
    fact: "自转方向与众不同（逆行），一天比一年还长。浓密 CO₂ 大气使其成为最热行星（表面 ~465°C）。",
  },
  {
    id: "earth", name: "地球", nameEn: "Earth",
    color: 0x4f7fd9, radiusKm: 6378.137, rotationHours: 23.9345, axialTiltDeg: 23.44,
    massKg: 5.972e24,
    elements: { a: 1.00000261, aDot: 0.00000562, e: 0.01671123, eDot: -0.00004392, i: -0.00001531, iDot: -0.01294668, L: 100.46457166, LDot: 35999.37244981, peri: 102.93768193, periDot: 0.32327364, node: 0.0, nodeDot: 0.0 },
    fact: "已知唯一存在生命的天体。液态水海洋覆盖 71% 表面；强大的磁场偏转太阳风。",
  },
  {
    id: "mars", name: "火星", nameEn: "Mars",
    color: 0xc96342, radiusKm: 3396.2, rotationHours: 24.6229, axialTiltDeg: 25.19,
    massKg: 6.417e23,
    elements: { a: 1.52371034, aDot: 0.00001847, e: 0.09339410, eDot: 0.00007882, i: 1.84969142, iDot: -0.00813131, L: -4.55343205, LDot: 19140.30268499, peri: -23.94362959, periDot: 0.44441088, node: 49.55953891, nodeDot: -0.29257343 },
    fact: "红色来自表面氧化铁。拥有太阳系最高的火山（奥林帕斯山，~22 km）与最大的峡谷（水手谷）。",
  },
  {
    id: "jupiter", name: "木星", nameEn: "Jupiter",
    color: 0xd8b48a, radiusKm: 71492, rotationHours: 9.925, axialTiltDeg: 3.13,
    massKg: 1.898e27,
    elements: { a: 5.20288700, aDot: -0.00011607, e: 0.04838624, eDot: -0.00013253, i: 1.30439695, iDot: -0.00183714, L: 34.39644051, LDot: 3034.74612775, peri: 14.72847983, periDot: 0.21252668, node: 100.47390909, nodeDot: 0.20469106 },
    fact: "质量为其他七大行星总和的 2.5 倍。大红斑是持续数百年的反气旋风暴；卫星数量超过 90 颗。",
  },
  {
    id: "saturn", name: "土星", nameEn: "Saturn",
    color: 0xe3d2a8, radiusKm: 60268, rotationHours: 10.656, axialTiltDeg: 26.73,
    massKg: 5.683e26,
    elements: { a: 9.53667594, aDot: -0.00125060, e: 0.05386179, eDot: -0.00050991, i: 2.48599187, iDot: 0.00193609, L: 49.95424423, LDot: 1222.49362201, peri: 92.59887831, periDot: -0.41897216, node: 113.66242448, nodeDot: -0.28867794 },
    fact: "密度低于水。壮观的环系主要由水冰构成，厚度仅数十米至一公里。",
  },
  {
    id: "uranus", name: "天王星", nameEn: "Uranus",
    color: 0x9fd6d9, radiusKm: 25559, rotationHours: -17.24, axialTiltDeg: 97.77,
    massKg: 8.681e25,
    elements: { a: 19.18916464, aDot: -0.00196176, e: 0.04725744, eDot: -0.00004397, i: 0.77263783, iDot: -0.00242939, L: 313.23810451, LDot: 428.48202785, peri: 170.95427630, periDot: 0.40805281, node: 74.01692503, nodeDot: 0.04240589 },
    fact: "躺着自转（轴倾角 97.8°），可能源于远古大撞击。甲烷大气吸收红光，使其呈青色。",
  },
  {
    id: "neptune", name: "海王星", nameEn: "Neptune",
    color: 0x4666e0, radiusKm: 24764, rotationHours: 16.11, axialTiltDeg: 28.32,
    massKg: 1.024e26,
    elements: { a: 30.06992276, aDot: 0.00026291, e: 0.00859048, eDot: 0.00005105, i: 1.77004347, iDot: 0.00035372, L: -55.12002969, LDot: 218.45945325, peri: 44.96476227, periDot: -0.32241464, node: 131.78422574, nodeDot: -0.00508664 },
    fact: "风速可达 2100 km/h，是太阳系最强。1846 年依据力学计算被「笔尖上发现」。",
  },
];

/** 太阳（中心天体，不参与开普勒解算） */
export const SUN = {
  id: "sun", name: "太阳", nameEn: "Sun",
  radiusKm: 696340,
  massKg: 1.989e30,
  color: 0xffdd88,
  fact: "占太阳系总质量的 99.86%。核心温度约 1500 万 K，通过质子-质子链聚变发光。光行时：到地球 8.3 分钟。",
};
