/**
 * 信息卡：选中天体的实时轨道状态 + 静态物理参数 + 趣味事实。
 * 实时字段由 main 每帧（节流）调用 update 刷新。
 */
import type { SimBody } from "../render/bodies";
import type { BodyRegistry } from "../render/bodies";
import { eclipticLongitude } from "../render/bodies";

const $ = (id: string) => document.getElementById(id)!;

const fmt = (v: number, digits = 2) =>
  v.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtSci = (v: number) => {
  const [m, e] = v.toExponential(3).split("e");
  return `${m} × 10^${Number(e)}`;
};

const KIND_LABEL: Record<string, string> = {
  star: "恒星 · G2V 主序星",
  planet: "行星",
  moon: "天然卫星",
  dwarf: "矮行星",
  comet: "彗星",
  asteroid: "小行星",
};

function rows(pairs: [string, string][]): string {
  return pairs.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join("");
}

export class InfoCard {
  private body: SimBody | null = null;

  constructor(private reg: BodyRegistry) {
    $("info-close").addEventListener("click", () => this.hide());
  }

  show(id: string) {
    const b = this.reg.byId.get(id);
    if (!b) return;
    this.body = b;
    $("info-card").classList.remove("hidden");
    $("info-title").textContent = `${b.name} · ${b.nameEn}`;
    $("info-type").textContent =
      b.kind === "moon"
        ? `天然卫星 · 母行星：${this.reg.byId.get(b.parentId!)?.name ?? "—"}`
        : KIND_LABEL[b.kind];

    const phys: [string, string][] = [
      ["赤道半径", `${fmt(b.radiusKm, b.radiusKm < 100 ? 1 : 1)} km`],
      ["质量", `${fmtSci(b.massKg)} kg`],
      ["自转周期", fmt(Math.abs(b.rotationHours), 1) + " 小时" + (b.rotationHours < 0 ? "（逆行）" : "")],
    ];
    if (b.kind === "planet" || b.kind === "dwarf") phys.push(["轴倾角", fmt(b.axialTiltDeg, 2) + "°"]);
    if (b.kind === "moon") {
      phys.push(["轨道半长轴", `${fmt(b.ringAKm!, 0)} km`], ["轨道周期", fmt(b.periodDays!, 3) + " 天"]);
    }
    if (b.kind === "dwarf" || b.kind === "comet" || b.kind === "asteroid") {
      const periodDays = 365.25 * Math.pow(b.aAU, 1.5);
      phys.push(
        ["轨道半长轴", `${fmt(b.aAU, 3)} AU`],
        ["轨道周期", periodDays > 730 ? `${fmt(periodDays / 365.25, 2)} 年` : `${fmt(periodDays, 1)} 天`],
        ["离心率", fmt(b.e, 4)],
      );
    }
    $("info-physical").innerHTML = rows(phys);
    $("info-fact").textContent = b.fact;
    this.refresh();
  }

  hide() {
    this.body = null;
    $("info-card").classList.add("hidden");
  }

  get currentId() { return this.body?.id ?? null; }

  /** 实时状态刷新 */
  refresh() {
    const b = this.body;
    if (!b) return;
    const live: [string, string][] = [];
    if (b.kind === "star") {
      live.push(["状态", "太阳系质心（原点）"]);
    } else {
      live.push(["日心距离", `${fmt(b.rAU, 4)} AU（${fmt(b.rAU * 149597870.7 / 1e6, 1)} 百万 km）`]);
      live.push(["轨道速度", `${fmt(b.speedKmS, 2)} km/s`]);
      live.push(["日心黄经", `${fmt(eclipticLongitude(b.helioAU), 2)}°`]);
      if (b.kind === "moon") {
        live.push(["距母行星", `${fmt(b.relKm.length(), 0)} km`]);
      }
    }
    $("info-live").innerHTML = rows(live);
  }
}
