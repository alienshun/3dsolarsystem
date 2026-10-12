/**
 * 约 20 颗主要卫星：根数相对母行星赤道面定义（月球相对黄道面）。
 * a [km]、P [天] 取自 NASA NSSDCA / JPL Planetary Satellite Fact Sheets；
 * Ω/ω/M0 为 J2000 近似值（多数大卫星近圆近赤道，指向角精度要求低，
 * 阶段 1 验收只覆盖行星黄经 < 0.5°）。
 */
import type { MoonElements } from "../core/elements";

export interface MoonDef {
  id: string;
  name: string;
  nameEn: string;
  parent: string; // 母行星 id
  color: number;
  radiusKm: number;
  rotationHours: number; // 同步自转为主
  massKg: number;
  elements: MoonElements;
  fact: string;
}

export const MOONS: MoonDef[] = [
  // ── 地球 ─────────────────────────────────────────────
  {
    id: "moon", name: "月球", nameEn: "Moon", parent: "earth",
    color: 0xb8b4ad, radiusKm: 1737.4, rotationHours: 655.7, massKg: 7.346e22,
    // 相对黄道面：Ω=125.08°（缓慢退行），ω=ϖ−Ω=83.23−125.08
    elements: { aKm: 384400, e: 0.0549, iDeg: 5.145, periodDays: 27.321582, nodeDeg: 125.08, argPeriDeg: 318.15, M0Deg: 134.96 },
    fact: "地球唯一的天然卫星，正以每年约 3.8 cm 的速度远离地球。潮汐锁定使其永远以同一面朝向地球。",
  },
  // ── 火星 ─────────────────────────────────────────────
  {
    id: "phobos", name: "火卫一", nameEn: "Phobos", parent: "mars",
    color: 0x8a7d70, radiusKm: 11.27, rotationHours: 7.653, massKg: 1.066e16,
    elements: { aKm: 9376, e: 0.0151, iDeg: 1.093, periodDays: 0.31891, nodeDeg: 0, argPeriDeg: 0, M0Deg: 0 },
    fact: "形状不规则（约 27×22×18 km），轨道每世纪衰减 1.8 m，约 5000 万年后将坠毁或瓦解成环。",
  },
  {
    id: "deimos", name: "火卫二", nameEn: "Deimos", parent: "mars",
    color: 0x9c9086, radiusKm: 6.2, rotationHours: 30.298, massKg: 1.476e15,
    elements: { aKm: 23463, e: 0.00033, iDeg: 0.93, periodDays: 1.26244, nodeDeg: 0, argPeriDeg: 0, M0Deg: 180 },
    fact: "太阳系最小卫星之一，可能是一颗被火星引力捕获的小行星。表面尘埃层厚达 50 m。",
  },
  // ── 木星（伽利略卫星） ───────────────────────────────
  {
    id: "io", name: "木卫一", nameEn: "Io", parent: "jupiter",
    color: 0xe8d26a, radiusKm: 1821.6, rotationHours: 42.46, massKg: 8.932e22,
    elements: { aKm: 421700, e: 0.0041, iDeg: 0.05, periodDays: 1.769138, nodeDeg: 0, argPeriDeg: 0, M0Deg: 113.9 },
    fact: "太阳系火山活动最剧烈的天体，400 多座活火山。潮汐加热是能量来源，喷发物高达 500 km。",
  },
  {
    id: "europa", name: "木卫二", nameEn: "Europa", parent: "jupiter",
    color: 0xd9c9a8, radiusKm: 1560.8, rotationHours: 85.2, massKg: 4.8e22,
    elements: { aKm: 671034, e: 0.009, iDeg: 0.47, periodDays: 3.551181, nodeDeg: 0, argPeriDeg: 0, M0Deg: 146.2 },
    fact: "冰壳之下可能存在全球性液态水海洋，水量或为地球海洋两倍，是地外生命搜寻的首要目标。",
  },
  {
    id: "ganymede", name: "木卫三", nameEn: "Ganymede", parent: "jupiter",
    color: 0xa9a29a, radiusKm: 2634.1, rotationHours: 171.7, massKg: 1.482e23,
    elements: { aKm: 1070412, e: 0.0013, iDeg: 0.2, periodDays: 7.154553, nodeDeg: 0, argPeriDeg: 0, M0Deg: 327.1 },
    fact: "太阳系最大卫星，比水星还大。唯一拥有自身磁场的卫星。",
  },
  {
    id: "callisto", name: "木卫四", nameEn: "Callisto", parent: "jupiter",
    color: 0x8d8378, radiusKm: 2410.3, rotationHours: 400.5, massKg: 1.076e23,
    elements: { aKm: 1882709, e: 0.0074, iDeg: 0.19, periodDays: 16.689017, nodeDeg: 0, argPeriDeg: 0, M0Deg: 120.6 },
    fact: "太阳系撞击坑最密集的天体之一，表面年龄约 40 亿年。Valhalla 撞击坑直径达 3800 km。",
  },
  // ── 土星 ─────────────────────────────────────────────
  {
    id: "mimas", name: "土卫一", nameEn: "Mimas", parent: "saturn",
    color: 0xc4c0b8, radiusKm: 198.2, rotationHours: 22.62, massKg: 3.75e19,
    elements: { aKm: 185539, e: 0.0196, iDeg: 1.574, periodDays: 0.942422, nodeDeg: 0, argPeriDeg: 0, M0Deg: 60 },
    fact: "巨大的 Herschel 撞击坑（直径 130 km）使其神似「死星」。坑壁高达 6 km。",
  },
  {
    id: "enceladus", name: "土卫二", nameEn: "Enceladus", parent: "saturn",
    color: 0xf2f0ea, radiusKm: 252.1, rotationHours: 32.88, massKg: 1.08e20,
    elements: { aKm: 237948, e: 0.0047, iDeg: 0.01, periodDays: 1.370218, nodeDeg: 0, argPeriDeg: 0, M0Deg: 120 },
    fact: "南极「虎纹」裂隙喷发水冰羽流高达数百公里，证实冰下有液态海洋——土星 E 环的物质来源。",
  },
  {
    id: "tethys", name: "土卫三", nameEn: "Tethys", parent: "saturn",
    color: 0xd8d4cc, radiusKm: 531.1, rotationHours: 45.31, massKg: 6.17e20,
    elements: { aKm: 294619, e: 0.0001, iDeg: 1.12, periodDays: 1.887802, nodeDeg: 0, argPeriDeg: 0, M0Deg: 180 },
    fact: "几乎纯水冰构成，密度仅 0.98 g/cm³。表面有 450 km 长的伊塔卡峡谷。",
  },
  {
    id: "dione", name: "土卫四", nameEn: "Dione", parent: "saturn",
    color: 0xc8c4bc, radiusKm: 561.4, rotationHours: 65.69, massKg: 1.095e21,
    elements: { aKm: 377396, e: 0.0022, iDeg: 0.019, periodDays: 2.736915, nodeDeg: 0, argPeriDeg: 0, M0Deg: 240 },
    fact: "明亮的冰悬崖是古老地质活动的痕迹。与土卫十/十一共享轨道（特洛伊卫星）。",
  },
  {
    id: "rhea", name: "土卫五", nameEn: "Rhea", parent: "saturn",
    color: 0xbfbab2, radiusKm: 763.8, rotationHours: 108.4, massKg: 2.306e21,
    elements: { aKm: 527108, e: 0.0013, iDeg: 0.35, periodDays: 4.518212, nodeDeg: 0, argPeriDeg: 0, M0Deg: 300 },
    fact: "土星第二大卫星。2008 年证据暗示其周围可能存在稀薄的尘埃环——卫星拥有环尚属首次。",
  },
  {
    id: "titan", name: "土卫六", nameEn: "Titan", parent: "saturn",
    color: 0xe0a458, radiusKm: 2574.7, rotationHours: 382.7, massKg: 1.345e23,
    elements: { aKm: 1221870, e: 0.0288, iDeg: 0.3485, periodDays: 15.945421, nodeDeg: 0, argPeriDeg: 0, M0Deg: 30 },
    fact: "唯一拥有浓密大气的卫星（1.5 倍地球气压），表面有液态甲烷湖泊与河流。惠更斯号曾着陆（2005）。",
  },
  {
    id: "iapetus", name: "土卫八", nameEn: "Iapetus", parent: "saturn",
    color: 0x9a8f80, radiusKm: 734.5, rotationHours: 1904.2, massKg: 1.805e21,
    elements: { aKm: 3560820, e: 0.0286, iDeg: 7.57, periodDays: 79.3215, nodeDeg: 0, argPeriDeg: 0, M0Deg: 90 },
    fact: "阴阳脸：前导半球亮如雪，后随半球暗如沥青。赤道还有 20 km 高的神秘山脊。",
  },
  // ── 天王星 ───────────────────────────────────────────
  {
    id: "miranda", name: "天卫五", nameEn: "Miranda", parent: "uranus",
    color: 0xb5b0a8, radiusKm: 235.8, rotationHours: 33.92, massKg: 6.59e19,
    elements: { aKm: 129390, e: 0.0013, iDeg: 4.23, periodDays: 1.413479, nodeDeg: 0, argPeriDeg: 0, M0Deg: 150 },
    fact: "表面如同拼图：拥有太阳系最高悬崖维罗纳断崖（约 20 km），可能是远古撞击后重新聚合而成。",
  },
  {
    id: "ariel", name: "天卫一", nameEn: "Ariel", parent: "uranus",
    color: 0xc0bcb4, radiusKm: 578.9, rotationHours: 60.39, massKg: 1.353e21,
    elements: { aKm: 191020, e: 0.0012, iDeg: 0.26, periodDays: 2.520379, nodeDeg: 0, argPeriDeg: 0, M0Deg: 210 },
    fact: "天王星卫星中表面最年轻、最明亮，遍布巨大的地堑峡谷系统。",
  },
  {
    id: "umbriel", name: "天卫二", nameEn: "Umbriel", parent: "uranus",
    color: 0x8a857e, radiusKm: 584.7, rotationHours: 99.49, massKg: 1.172e21,
    elements: { aKm: 266000, e: 0.0039, iDeg: 0.205, periodDays: 4.144177, nodeDeg: 0, argPeriDeg: 0, M0Deg: 270 },
    fact: "天王星最暗的大卫星，表面古老坑洼。顶部有一个神秘的明亮环形物「Wunda」。",
  },
  {
    id: "titania", name: "天卫三", nameEn: "Titania", parent: "uranus",
    color: 0xb0a99f, radiusKm: 788.4, rotationHours: 209.0, massKg: 3.527e21,
    elements: { aKm: 435910, e: 0.0011, iDeg: 0.34, periodDays: 8.705872, nodeDeg: 0, argPeriDeg: 0, M0Deg: 330 },
    fact: "天王星最大卫星，太阳系第八大卫星。墨西拿峡谷绵延 1500 km。",
  },
  {
    id: "oberon", name: "天卫四", nameEn: "Oberon", parent: "uranus",
    color: 0x9e968c, radiusKm: 761.4, rotationHours: 323.1, massKg: 3.014e21,
    elements: { aKm: 583520, e: 0.0014, iDeg: 0.058, periodDays: 13.463234, nodeDeg: 0, argPeriDeg: 0, M0Deg: 45 },
    fact: "天王星最外侧大卫星，坑洼表面部分覆盖暗色物质，可能有内部分层结构。",
  },
  // ── 海王星 ───────────────────────────────────────────
  {
    id: "triton", name: "海卫一", nameEn: "Triton", parent: "neptune",
    color: 0xc9c2d4, radiusKm: 1353.4, rotationHours: -141.0, massKg: 2.139e22,
    // 逆行轨道：i=156.9°（>90°，相对海王星赤道），标准旋转公式自动产生逆行，无需额外标记
    elements: { aKm: 354759, e: 0.000016, iDeg: 156.885, periodDays: 5.876854, nodeDeg: 0, argPeriDeg: 0, M0Deg: 0 },
    fact: "太阳系唯一逆行的大型卫星，几乎可以肯定是被俘获的柯伊伯带天体。南极有氮冰间歇泉。",
  },
];
