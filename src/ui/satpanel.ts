/**
 * 人造卫星面板（规格 §6 阶段 4：搜索 / 按星座过滤 / 在线刷新 / 精度警示）。
 * 纯 DOM 绑定，逻辑回调给 main；展示状态由 api 回写。
 */
import { CONSTELLATIONS, FEATURED } from "../data/tle";

export interface SatResult {
  norad: string;
  name: string;
  constellation: string;
}

export interface SatPanelHandlers {
  onSearch: (q: string) => void;
  onConst: (c: string) => void;
  onToggle: (visible: boolean) => void;
  onRefresh: () => void;
  onPick: (norad: string) => void;
}

export interface SatPanelApi {
  setCount: (text: string) => void;
  setWarn: (text: string | null) => void;
  setResults: (list: SatResult[]) => void;
  markSelected: (norad: string | null) => void;
  setRefreshing: (busy: boolean) => void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupSatPanel(h: SatPanelHandlers): SatPanelApi {
  const search = $<HTMLInputElement>("sat-search");
  const results = $("sat-results");
  const constSel = $<HTMLSelectElement>("sat-const");
  const chk = $<HTMLInputElement>("chk-sats");
  const count = $("sat-count");
  const warn = $("sat-warn");
  const refresh = $<HTMLButtonElement>("sat-refresh");

  constSel.innerHTML = [FEATURED, "全部", ...CONSTELLATIONS]
    .map((c) => `<option value="${c}">${c === "全部" ? "全部星座" : c}</option>`)
    .join("");
  constSel.value = FEATURED;

  let selectedNorad: string | null = null;

  search.addEventListener("input", () => h.onSearch(search.value.trim()));
  constSel.addEventListener("change", () => h.onConst(constSel.value));
  chk.addEventListener("change", () => h.onToggle(chk.checked));
  refresh.addEventListener("click", () => h.onRefresh());

  return {
    setCount(text) { count.textContent = text; },
    setWarn(text) {
      if (text === null) { warn.classList.add("hidden"); warn.textContent = ""; }
      else { warn.classList.remove("hidden"); warn.textContent = text; }
    },
    setResults(list) {
      results.innerHTML = "";
      for (const r of list.slice(0, 40)) {
        const div = document.createElement("div");
        div.className = "sat-item" + (r.norad === selectedNorad ? " selected" : "");
        div.dataset.norad = r.norad;
        div.textContent = `${r.name} · ${r.norad} · ${r.constellation}`;
        div.title = r.name;
        div.addEventListener("click", () => h.onPick(r.norad));
        results.appendChild(div);
      }
    },
    markSelected(norad) {
      selectedNorad = norad;
      for (const el of Array.from(results.children)) {
        el.classList.toggle("selected", (el as HTMLElement).dataset.norad === norad);
      }
    },
    setRefreshing(busy) {
      refresh.disabled = busy;
      refresh.textContent = busy ? "刷新中…" : "刷新";
    },
  };
}
