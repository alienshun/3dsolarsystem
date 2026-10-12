/**
 * UI 控制层：时间面板（暂停/倒放/流速/日期跳转/现在）、天体导航列表、
 * 显示开关。UI 只读写 SimState，物理与渲染各自订阅状态（规格 §2.2）。
 */
import { dateToJD, jdToDate, formatSimDate } from "../core/time";
import { sliderToRate, rateToSlider, formatRate, SLIDER_ONE_DAY } from "../render/scale";
import type { BodyRegistry } from "../render/bodies";

export interface SimState {
  jd: number;
  /** |天/秒| */
  rate: number;
  paused: boolean;
  direction: 1 | -1;
  followId: string | null;
  selectedId: string | null;
  showOrbits: boolean;
  showLabels: boolean;
  showMoons: boolean;
  /** 真实比例模式（1:1，km 单位 + 浮动原点） */
  trueScale: boolean;
  /** GR 深度 A：近日点进动修正（规格 §4.5） */
  grEnabled: boolean;
  /** 主小行星带点云 */
  showBelt: boolean;
  /** 单独隐藏轨道的天体 id 集合 */
  orbitOff: Set<string>;
  /** GR 深度 C：表观位置（光行时） */
  apparent: boolean;
  /** 大气与云层 */
  showAtmo: boolean;
  /** 磁场线 */
  showMag: boolean;
}

export interface UIHooks {
  onSelect: (id: string | null) => void;
  onVisibility: () => void;
  onTrueScale: (on: boolean) => void;
  onGR: (on: boolean) => void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function setupUI(state: SimState, reg: BodyRegistry, hooks: UIHooks) {
  const btnReverse = $<HTMLButtonElement>("btn-reverse");
  const btnPause = $<HTMLButtonElement>("btn-pause");
  const rateSlider = $<HTMLInputElement>("rate-slider");
  const rateLabel = $("rate-label");
  const rateMid = $("rate-mid");
  const dateInput = $<HTMLInputElement>("date-input");
  const btnNow = $<HTMLButtonElement>("btn-now");
  const simDate = $("sim-date");
  const bodyList = $("body-list");
  const chkOrbits = $<HTMLInputElement>("chk-orbits");
  const chkLabels = $<HTMLInputElement>("chk-labels");
  const chkMoons = $<HTMLInputElement>("chk-moons");
  const chkTrue = $<HTMLInputElement>("chk-true");
  const chkGR = $<HTMLInputElement>("chk-gr");
  const chkBelt = $<HTMLInputElement>("chk-belt");
  const chkAtmo = $<HTMLInputElement>("chk-atmo");
  const chkMag = $<HTMLInputElement>("chk-mag");
  const chkApparent = $<HTMLInputElement>("chk-apparent");

  // ── 流速滑杆（对数：1 秒/秒 → 1 年/秒） ──
  rateSlider.value = String(SLIDER_ONE_DAY);
  state.rate = sliderToRate(SLIDER_ONE_DAY);
  rateMid.textContent = "1 天/秒";
  const refreshRate = () => {
    let r = sliderToRate(Number(rateSlider.value));
    if (Math.abs(r - 1) < 0.03) r = 1; // 吸附到 1 天/秒
    state.rate = r;
    rateLabel.textContent = formatRate(state.rate);
  };
  rateSlider.addEventListener("input", refreshRate);
  // 浏览器刷新可能恢复表单旧值，load 后重新初始化
  window.addEventListener("load", () => {
    rateSlider.value = String(SLIDER_ONE_DAY);
    refreshRate();
  });
  refreshRate();

  btnPause.addEventListener("click", () => {
    state.paused = !state.paused;
    btnPause.textContent = state.paused ? "▶" : "⏸";
    btnPause.classList.toggle("active", state.paused);
  });
  btnReverse.addEventListener("click", () => {
    state.direction = state.direction === 1 ? -1 : 1;
    btnReverse.classList.toggle("active", state.direction === -1);
  });
  btnNow.addEventListener("click", () => {
    state.jd = dateToJD(new Date());
    syncDateInput();
  });
  dateInput.addEventListener("change", () => {
    const d = new Date(dateInput.value);
    if (!isNaN(d.getTime())) state.jd = dateToJD(d);
  });

  function syncDateInput() {
    dateInput.value = toDateInputValue(jdToDate(state.jd));
  }
  syncDateInput();

  // ── 天体导航列表 ──
  const itemEls = new Map<string, HTMLDivElement>();
  const addItem = (id: string, name: string, color: number, isMoon: boolean) => {
    const el = document.createElement("div");
    el.className = "body-item" + (isMoon ? " moon" : "");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = "#" + color.toString(16).padStart(6, "0");
    if (isMoon) dot.style.width = dot.style.height = "6px";
    const label = document.createElement("span");
    label.textContent = name;
    el.append(dot, label);
    el.addEventListener("click", () => hooks.onSelect(id));
    if (id !== reg.sun.id) {
      const toggle = document.createElement("button");
      toggle.className = "orbit-toggle";
      const syncToggle = () => {
        const hidden = state.orbitOff.has(id);
        toggle.classList.toggle("off", hidden);
        toggle.textContent = hidden ? "○" : "●";
        toggle.title = hidden ? `显示 ${name} 轨道` : `隐藏 ${name} 轨道`;
      };
      toggle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (state.orbitOff.has(id)) state.orbitOff.delete(id);
        else state.orbitOff.add(id);
        syncToggle();
        hooks.onVisibility();
      });
      syncToggle();
      el.appendChild(toggle);
    }
    bodyList.appendChild(el);
    itemEls.set(id, el);
  };
  const addGroup = (title: string) => {
    const el = document.createElement("div");
    el.className = "group-title";
    el.textContent = title;
    bodyList.appendChild(el);
  };
  addItem(reg.sun.id, reg.sun.name, reg.sun.color, false);
  addGroup("行星");
  for (const p of reg.planets) {
    addItem(p.id, p.name, p.color, false);
    for (const m of reg.moonsOf.get(p.id) ?? []) addItem(m.id, m.name, m.color, true);
  }
  addGroup("矮行星");
  for (const d of reg.dwarfs) addItem(d.id, d.name, d.color, false);
  addGroup("彗星");
  for (const c of reg.comets) addItem(c.id, c.name, c.color, false);
  addGroup("小行星");
  for (const a of reg.asteroids) addItem(a.id, a.name, a.color, false);

  chkOrbits.addEventListener("change", () => { state.showOrbits = chkOrbits.checked; hooks.onVisibility(); });
  chkLabels.addEventListener("change", () => { state.showLabels = chkLabels.checked; hooks.onVisibility(); });
  chkMoons.addEventListener("change", () => { state.showMoons = chkMoons.checked; hooks.onVisibility(); });
  chkTrue.addEventListener("change", () => { state.trueScale = chkTrue.checked; hooks.onTrueScale(chkTrue.checked); });
  chkGR.addEventListener("change", () => { state.grEnabled = chkGR.checked; hooks.onGR(chkGR.checked); });
  chkBelt.addEventListener("change", () => { state.showBelt = chkBelt.checked; hooks.onVisibility(); });
  chkAtmo.addEventListener("change", () => { state.showAtmo = chkAtmo.checked; hooks.onVisibility(); });
  chkMag.addEventListener("change", () => { state.showMag = chkMag.checked; hooks.onVisibility(); });
  chkApparent.addEventListener("change", () => { state.apparent = chkApparent.checked; });

  // ── 每帧刷新（由 main 调用） ──
  return {
    update() {
      simDate.textContent = formatSimDate(state.jd);
      rateLabel.textContent = (state.direction === -1 ? "⏪ " : "") + formatRate(state.rate);
      // 日期输入框每帧同步（用户编辑中不抢值）
      if (document.activeElement !== dateInput) syncDateInput();
    },
    setSelected(id: string | null, followId: string | null) {
      for (const [bid, el] of itemEls) {
        el.classList.toggle("selected", bid === id);
        el.title = bid === followId ? "跟随中（双击空白处取消）" : "";
      }
      const follow = followId ? itemEls.get(followId) : null;
      for (const [, el] of itemEls) el.style.fontWeight = "";
      if (follow) follow.style.fontWeight = "700";
    },
    syncDateInput,
  };
}

export { rateToSlider };
