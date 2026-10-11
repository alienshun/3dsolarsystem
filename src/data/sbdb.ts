/**
 * 矮行星 / 彗星 / 小行星（规格 §5：sbdb 构建期拉取打包）。
 * 根数源：src/data/sbdb-snapshot.json（scripts/fetch-sbdb.mjs 自 JPL sbdb 全精度拉取），
 * 此处把「历元 epoch 的 (a,e,i,Ω,ω,M)」换算为 J2000 平均根数格式（与行星管线共用 PlanetElements）：
 *   n = 360/P；M(J2000) = M(epoch) + n·(JD_J2000 − epoch)；ϖ = Ω+ω；L = M+ϖ；L̇ = n·36525。
 * 二体线性外推对短周期彗星数十年内足够观赏与教学；长期摄动不在本阶段范围。
 */
import type { PlanetElements } from "../core/elements";
import snapshot from "./sbdb-snapshot.json";

export type SmallBodyKind = "dwarf" | "comet" | "asteroid";

export interface SmallBodyDef {
  id: string;
  name: string;
  nameEn: string;
  kind: SmallBodyKind;
  color: number;
  radiusKm: number;
  massKg: number;
  rotationHours: number;
  axialTiltDeg: number;
  fact: string;
  elements: PlanetElements;
}

interface Meta {
  id: string;
  name: string;
  nameEn: string;
  color: number;
  radiusKm: number;
  massKg: number;
  rotationHours: number;
  axialTiltDeg: number;
  fact: string;
}

const META: Record<string, Meta> = {
  ceres: {
    id: "ceres", name: "谷神星", nameEn: "Ceres", color: 0xb8ae9c,
    radiusKm: 469.7, massKg: 9.39e20, rotationHours: 9.074, axialTiltDeg: 4.0,
    fact: "主带最大天体、唯一位于海王星轨道内的矮行星。Occator 撞击坑的亮斑是地下盐水喷发残留的碳酸钠。",
  },
  pluto: {
    id: "pluto", name: "冥王星", nameEn: "Pluto", color: 0xd8c2a0,
    radiusKm: 1188.3, massKg: 1.303e22, rotationHours: -153.29, axialTiltDeg: 122.5,
    fact: "柯伊伯带之王：氮冰冰川、心形 Sputnik 平原与稀薄大气。2015 年新视野号飞掠返回首批近照。",
  },
  haumea: {
    id: "haumea", name: "妊神星", nameEn: "Haumea", color: 0xe6e2d8,
    radiusKm: 780, massKg: 4.01e21, rotationHours: 3.9155, axialTiltDeg: 4.0,
    fact: "自转仅 3.9 小时，被甩成三轴椭球；带有一道环与一整个碰撞族碎片，表面几乎纯水冰。",
  },
  makemake: {
    id: "makemake", name: "鸟神星", nameEn: "Makemake", color: 0xd9b38c,
    radiusKm: 715, massKg: 3.1e21, rotationHours: 22.83, axialTiltDeg: 2.0,
    fact: "经典柯伊伯带天体，表面覆甲烷冰；2011 年掩星观测发现它有一颗小卫星 MK2。",
  },
  eris: {
    id: "eris", name: "阋神星", nameEn: "Eris", color: 0xf0ede6,
    radiusKm: 1163, massKg: 1.66e22, rotationHours: 15.77, axialTiltDeg: 4.0,
    fact: "质量最大的矮行星。2005 年它的发现直接促使 IAU 定义「行星」并把冥王星降级。",
  },
  "1P": {
    id: "halley", name: "哈雷彗星", nameEn: "1P/Halley", color: 0x9ab8a0,
    radiusKm: 5.5, massKg: 2.2e14, rotationHours: -52.8, axialTiltDeg: 0,
    fact: "最著名的周期彗星（76 年）。1986 年乔托号首次拍得彗核；猎户座流星雨源自它的尘埃。",
  },
  "2P": {
    id: "encke", name: "恩克彗星", nameEn: "2P/Encke", color: 0xb8a888,
    radiusKm: 2.4, massKg: 6.8e12, rotationHours: 11.6, axialTiltDeg: 0,
    fact: "已知周期最短的彗星（3.3 年）；喷流的非引力效应正缓慢缩小其轨道，金牛座流星流与它相关。",
  },
  "67P": {
    id: "67p", name: "67P/丘留莫夫–格拉西缅科", nameEn: "67P/Churyumov–Gerasimenko", color: 0xa89880,
    radiusKm: 1.86, massKg: 9.982e12, rotationHours: 12.4, axialTiltDeg: 55.0,
    fact: "罗塞塔号的目标彗星，鸭形双瓣结构；2014 年菲莱着陆器完成人类首次彗星表面着陆。",
  },
  "C/1995 O1": {
    id: "halebopp", name: "海尔-波普彗星", nameEn: "C/1995 O1 Hale-Bopp", color: 0xc8d8e8,
    radiusKm: 30, massKg: 1.3e16, rotationHours: 11.7, axialTiltDeg: 0,
    fact: "1997 年大彗星：肉眼可见 18 个月、周期约 2530 年，是 20 世纪最亮彗星之一。",
  },
  Bennu: {
    id: "bennu", name: "贝努", nameEn: "101955 Bennu", color: 0x8f8578,
    radiusKm: 0.245, massKg: 7.329e10, rotationHours: -4.296, axialTiltDeg: 178.0,
    fact: "陀螺形近地小行星；2023 年 OSIRIS-REx 带回 121 g 样品。形状模型来自 NASA 3D Resources。",
  },
  Itokawa: {
    id: "itokawa", name: "丝川", nameEn: "25143 Itokawa", color: 0x9a8f80,
    radiusKm: 0.16, massKg: 3.51e10, rotationHours: 12.132, axialTiltDeg: 178.0,
    fact: "碎石堆小行星；2005 年隼鸟号首次采样、2010 年返回，开启小行星采样返回时代。",
  },
  Eros: {
    id: "eros", name: "爱神星", nameEn: "433 Eros", color: 0xa8968a,
    radiusKm: 8.42, massKg: 6.687e15, rotationHours: 5.27, axialTiltDeg: 89.0,
    fact: "首颗被发现的近地小行星（1898）；2001 年 NEAR 鞋匠号成为首个环绕并着陆小行星的探测器。",
  },
};

const JD_J2000 = 2451545.0;

function toElements(b: (typeof snapshot)["bodies"][number]): PlanetElements {
  const { a, e, i, om, w, ma, per } = b.elements;
  const nDegPerDay = 360 / per;
  const mJ2000 = ma + nDegPerDay * (JD_J2000 - b.epoch);
  const peri = om + w;
  return {
    a, aDot: 0,
    e, eDot: 0,
    i, iDot: 0,
    L: mJ2000 + peri, LDot: nDegPerDay * 36525,
    peri, periDot: 0,
    node: om, nodeDot: 0,
  };
}

export const SMALL_BODIES: SmallBodyDef[] = snapshot.bodies.map((b) => {
  const m = META[b.id];
  return {
    ...m,
    kind: b.kind as SmallBodyKind,
    elements: toElements(b),
  };
});
