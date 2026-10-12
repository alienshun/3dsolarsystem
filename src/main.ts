/**
 * 主入口：数据流（规格 §2.2）
 *   时间 t → 天体力学解算（纯函数）→ 物理状态（AU/km）→ 显示变换 f → 渲染
 * 一切位置是 t 的纯函数：时间快进/倒放/跳转无状态漂移。
 */
import * as THREE from "three";
import { createScene } from "./render/scene";

window.addEventListener("error", (e) => {
  console.error("[page-error]", e.message, `${e.filename}:${e.lineno}:${e.colno}`);
});
import { buildBodies, applyDisplayPositions, applyTruePositions, setScaleMode, spinAngle, type SimBody, type ScaleMode } from "./render/bodies";
import { OrbitLines } from "./render/orbits";
import { AsteroidBelt } from "./render/belt";
import { applyShapes, updateShapeLod } from "./render/shapes";
import { applyRealTextures } from "./render/textures";
import { Labels } from "./render/labels";
import { setupUI, type SimState } from "./ui/controls";
import { InfoCard } from "./ui/infocard";
import { setupSatPanel } from "./ui/satpanel";
import { SatelliteCloud } from "./render/satellites";
import { parse3le, isFeatured, FEATURED, type TleEntry } from "./data/tle";
import { getCache, putCache, loadSnapshot, refreshOnline } from "./core/tlestore";
import { gstime } from "satellite.js";
import { PLANETS } from "./data/planets";
import { MOONS } from "./data/moons";
import { SMALL_BODIES } from "./data/sbdb";
import { planetHeliocentric, moonRelative, type PlanetElements } from "./core/elements";
import { grPerihelionDegPerCy, LIGHT_MIN_PER_AU } from "./core/relativity";
import { dateToJD, daysSinceJ2000, jdToDate } from "./core/time";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
const kit = createScene(canvas);
const reg = buildBodies(kit.world);
applyRealTextures(reg);
applyShapes(reg);
const orbits = new OrbitLines(kit.world, reg);
const belt = new AsteroidBelt(kit.world);

const state: SimState = {
  jd: dateToJD(new Date()),
  rate: 1, // 由滑杆初始化覆盖
  paused: false,
  direction: 1,
  followId: null,
  selectedId: null,
  showOrbits: true,
  showLabels: true,
  showMoons: true,
  trueScale: false,
  grEnabled: true,
  showBelt: true,
  orbitOff: new Set<string>(),
  apparent: false,
  showAtmo: true,
  showMag: false,
};

/* ─────────────────────────── 物理层（纯函数） ─────────────────────────── */

function grRate(a: number, e: number): number {
  return state.grEnabled ? grPerihelionDegPerCy(a, e) : 0;
}

/** 日心状态；表观位置模式取 t − r/c 时刻（光行时，迭代 1 次，规格 §4.5-C） */
function helioState(el: PlanetElements, jd: number) {
  const gr = grRate(el.a, el.e);
  let st = planetHeliocentric(el, jd, gr);
  if (state.apparent) {
    const ltDays = (st.rAU * LIGHT_MIN_PER_AU) / 1440;
    st = planetHeliocentric(el, jd - ltDays, gr);
  }
  return st;
}

function updatePhysics(jd: number) {
  const dJ2000 = daysSinceJ2000(jd);
  PLANETS.forEach((p) => {
    const b = reg.byId.get(p.id)!;
    const st = helioState(p.elements, jd);
    b.helioAU.set(st.x, st.y, st.z);
    b.rAU = st.rAU;
    b.aAU = st.aAU;
    b.e = st.e;
  });
  SMALL_BODIES.forEach((s) => {
    const b = reg.byId.get(s.id)!;
    const st = helioState(s.elements, jd);
    b.helioAU.set(st.x, st.y, st.z);
    b.rAU = st.rAU;
    b.aAU = st.aAU;
    b.e = st.e;
  });
  MOONS.forEach((m) => {
    const b = reg.byId.get(m.id)!;
    const rel = moonRelative(m.elements, jd);
    b.relKm.set(rel.x, rel.y, rel.z);
  });
  if (state.trueScale) applyTruePositions(reg);
  else applyDisplayPositions(reg);
  // 自转（显示层旋转，物理无关）
  for (const b of reg.all) {
    b.mesh.rotation.y = spinAngle(b, dJ2000);
    if (b.cloudMesh) b.cloudMesh.rotation.y = b.mesh.rotation.y * 1.08 + 0.7;
  }
}

/* ─────────────────────────── 选中 / 跟随 / 拾取 ─────────────────────────── */

const infoCard = new InfoCard(reg);

function selectBody(id: string | null, follow = false) {
  state.selectedId = id;
  if (follow) state.followId = id;
  labels.setSelected(id);
  ui.setSelected(id, state.followId);
  if (id) infoCard.show(id);
  else infoCard.hide();
}

const labels = new Labels(reg, (id) => selectBody(id, true));

const ui = setupUI(state, reg, {
  onSelect: (id) => {
    if (id === null) {
      state.followId = null;
      ui.setSelected(state.selectedId, null);
    } else {
      selectBody(id, true);
    }
  },
  onVisibility: applyVisibility,
  onTrueScale: () => applyScaleMode(),
  onGR: (on) => orbits.setGR(on),
});

orbits.setGR(state.grEnabled);

function applyVisibility() {
  orbits.setVisible(state.showOrbits, state.showOrbits && state.showMoons);
  for (const b of reg.all) {
    if (b.id !== reg.sun.id) orbits.setBodyOrbit(b.id, !state.orbitOff.has(b.id));
    if (b.atmoMesh) b.atmoMesh.visible = state.showAtmo;
    if (b.cloudMesh) b.cloudMesh.visible = state.showAtmo;
    if (b.magGroup) b.magGroup.visible = state.showMag;
  }
  for (const m of reg.moons) m.pivot.visible = state.showMoons;
  belt.setVisible(state.showBelt);
}
applyVisibility();

/* ─────────────────────────── 人造卫星层（阶段 4） ─────────────────────────── */

const sats = new SatelliteCloud(kit.scene);
let showSats = true;
let satConst = FEATURED;
let satQuery = "";
let satEntries: TleEntry[] = [];
let satWorker: Worker | null = null;
let satBuf: Float32Array | null = null;
let lastPropReq = 0;
let selectedSatNorad: string | null = null;
let pendingSatNorad: string | null = null;
let stressMode = false;

const EARTH_R_KM = 6371;
const earthBody = () => reg.byId.get("earth")!;
const kmToScene = () => (state.trueScale ? 1 : earthBody().dispR / EARTH_R_KM);
// 屏幕空间恒定点径（约 6px）：随相机到地球距离自适应，缩放时卫星始终可见，
// 不再因世界尺寸固定而在远景缩成亚像素。
const dotSize = () => {
  const d = kit.camera.position.distanceTo(earthBody().rootPos);
  const halfFovTan = Math.tan((kit.camera.fov * Math.PI) / 360);
  const s = (6 * d * halfFovTan) / window.innerHeight;
  return Math.max(s, state.trueScale ? 1 : earthBody().dispR * 0.004);
};
const jdToMs = (jd: number) => jdToDate(jd).getTime();

function satMatches(e: TleEntry): boolean {
  if (satConst === FEATURED) {
    if (!isFeatured(e.name)) return false;
  } else if (satConst !== "全部" && e.constellation !== satConst) return false;
  if (satQuery) {
    const q = satQuery.toLowerCase();
    if (!e.name.toLowerCase().includes(q) && !e.norad.includes(q)) return false;
  }
  return true;
}

function applySatFilter() {
  const mask = new Uint8Array(satEntries.length);
  for (let i = 0; i < satEntries.length; i++) mask[i] = satMatches(satEntries[i]) ? 1 : 0;
  sats.setMask(mask);
  sats.setDotSize(dotSize());
  satPanel.setCount(satEntries.length ? `${sats.visibleCount} / ${satEntries.length} 颗` : "—");
}

function requestOrbit(norad: string) {
  const e = satEntries.find((x) => x.norad === norad);
  if (!e || !satWorker) return;
  const revPerDay = parseFloat(e.line1.slice(52, 63));
  const periodMin = revPerDay > 0 ? 1440 / revPerDay : 100;
  satWorker.postMessage({ type: "orbit", norad, timeMs: jdToMs(state.jd), minutes: periodMin, samples: 160 });
  const ageDays = (Date.now() - e.epochMs) / 86400000;
  satPanel.setWarn(ageDays > 30 ? `TLE 历元已 ${ageDays.toFixed(0)} 天，SGP4 精度随时间下降` : null);
}

function onSatMsg(ev: MessageEvent) {
  const msg = ev.data as { type: string; count?: number; buf?: Float32Array; norad?: string };
  if (msg.type === "ready") {
    sats.rebuild(msg.count ?? 0);
    applySatFilter();
    sats.setVisible(showSats);
    if (pendingSatNorad) {
      selectedSatNorad = pendingSatNorad;
      pendingSatNorad = null;
      satPanel.markSelected(selectedSatNorad);
      requestOrbit(selectedSatNorad);
      // 选中卫星时拉远取景，容纳 LEO→GEO 壳层与精轨线
      if (state.trueScale) {
        _dir.copy(kit.camera.position);
        if (_dir.lengthSq() < 1e-12) _dir.set(0, 0, 1);
        _dir.normalize();
        kit.controls.target.set(0, 0, 0);
        kit.camera.position.copy(_dir).multiplyScalar(earthBody().dispR * 12);
      }
    }
  } else if (msg.type === "positions" && msg.buf) {
    satBuf = msg.buf;
  } else if (msg.type === "orbit" && msg.buf && msg.norad === selectedSatNorad) {
    sats.setOrbitLine(msg.buf, gstime(state.jd), earthBody().rootPos, kmToScene());
  }
}

function initSats(text: string) {
  satEntries = parse3le(text);
  if (stressMode) {
    const base = satEntries.slice();
    while (satEntries.length < 10000) satEntries.push(...base.map((e) => ({ ...e })));
    satEntries = satEntries.slice(0, 10000);
  }
  satBuf = null;
  selectedSatNorad = null;
  sats.clearOrbitLine();
  if (satWorker) satWorker.terminate();
  satWorker = new Worker(new URL("./workers/satprop.ts", import.meta.url), { type: "module" });
  satWorker.onmessage = onSatMsg;
  satWorker.onerror = (e) => console.error("[satprop] worker error:", e.message);
  satWorker.postMessage({
    type: "init",
    names: satEntries.map((e) => e.name),
    line1: satEntries.map((e) => e.line1),
    line2: satEntries.map((e) => e.line2),
    norad: satEntries.map((e) => e.norad),
  });
}

const satPanel = setupSatPanel({
  onSearch: (q) => {
    satQuery = q;
    applySatFilter();
    satPanel.setResults(q ? satEntries.filter(satMatches).slice(0, 40).map((e) => ({ norad: e.norad, name: e.name, constellation: e.constellation })) : []);
  },
  onConst: (c) => { satConst = c; applySatFilter(); },
  onToggle: (v) => { showSats = v; sats.setVisible(v); },
  onRefresh: async () => {
    satPanel.setRefreshing(true);
    try {
      const text = await refreshOnline();
      await putCache(text);
      initSats(text);
      satPanel.setWarn(null);
    } catch (err) {
      satPanel.setWarn(`在线刷新失败：${(err as Error).message}`);
    } finally {
      satPanel.setRefreshing(false);
    }
  },
  onPick: (norad) => {
    selectedSatNorad = norad;
    satPanel.markSelected(norad);
    requestOrbit(norad);
  },
});

(async () => {
  let text: string | null = null;
  const cache = await getCache();
  if (cache?.text) text = cache.text;
  if (!text) {
    try { text = await loadSnapshot(import.meta.env.BASE_URL); } catch { text = null; }
  }
  if (text) initSats(text);
})();

// 屏幕空间拾取（保底像素半径，不对微小网格做 3D 射线；规格 §4.2）
const _proj = new THREE.Vector3();
function pickAt(sx: number, sy: number): SimBody | null {
  const w = window.innerWidth, h = window.innerHeight;
  const halfFovTan = Math.tan((kit.camera.fov * Math.PI) / 360);
  let best: SimBody | null = null;
  let bestScore = Infinity;
  for (const b of reg.all) {
    if (b.kind === "moon" && !state.showMoons) continue;
    _proj.copy(b.rootPos).project(kit.camera);
    if (_proj.z > 1 || _proj.z < -1) continue;
    const px = (_proj.x * 0.5 + 0.5) * w;
    const py = (-_proj.y * 0.5 + 0.5) * h;
    const dist = _proj.copy(b.rootPos).distanceTo(kit.camera.position);
    const pxRadius = dist > 0 ? (b.dispR / (2 * dist * halfFovTan)) * h : 8;
    const hitR = Math.max(pxRadius, b.kind === "moon" ? 10 : 14); // 保底命中像素
    const dx = sx - px, dy = sy - py;
    const d2 = dx * dx + dy * dy;
    if (d2 <= hitR * hitR) {
      const score = d2 / (hitR * hitR) + dist * 1e-6; // 平局时取近者
      if (score < bestScore) { bestScore = score; best = b; }
    }
  }
  return best;
}

let downX = 0, downY = 0, downT = 0;
canvas.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
canvas.addEventListener("pointerup", (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved < 5 && performance.now() - downT < 600) {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) selectBody(hit.id, false);
  }
});
canvas.addEventListener("dblclick", (e) => {
  if (!pickAt(e.clientX, e.clientY)) {
    state.followId = null;
    ui.setSelected(state.selectedId, null);
  }
});

/* ─────────────────────────── 真实比例：浮动原点 / 模式切换 ─────────────────────────── */

const ORIGIN_ZERO = new THREE.Vector3();
const originTrue = new THREE.Vector3();
let originBodyId = "sun";
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** 取景方向偏向向阳面：相机置于「天体→太阳」一侧，避免默认看到夜面 */
function sunwardDir(b: SimBody, fallback: THREE.Vector3): THREE.Vector3 {
  _tmp.copy(reg.sun.dispPos).sub(b.dispPos);
  if (_tmp.lengthSq() < 1e-12) return fallback;
  return _dir.copy(_tmp).normalize();
}

/** 切换比例模式：同步尺度、轨道线模式、控制器限位、星空挂载，并重定位相机 */
function applyScaleMode() {
  const mode: ScaleMode = state.trueScale ? "true" : "display";
  _dir.copy(kit.camera.position).sub(kit.controls.target);
  if (_dir.lengthSq() < 1e-12) _dir.set(0, 0, 1);
  _dir.normalize();
  setScaleMode(reg, mode);
  orbits.setMode(mode);
  sats.setDotSize(dotSize());
  updatePhysics(state.jd); // 先按新模式算一帧位置，重定位用新坐标
  const fb = state.followId ? reg.byId.get(state.followId) : null;
  if (state.trueScale) {
    kit.controls.minDistance = 0.5;
    kit.controls.maxDistance = 2e10;
    if (kit.starfield.parent !== kit.camera) {
      kit.scene.remove(kit.starfield);
      kit.camera.add(kit.starfield);
      kit.starfield.position.set(0, 0, 0);
    }
    originTrue.set(0, 0, 0);
    if (fb) originTrue.copy(fb.dispPos);
    originBodyId = fb ? fb.id : "sun";
    kit.world.position.copy(originTrue).negate();
    for (const b of reg.all) b.rootPos.copy(b.dispPos).add(kit.world.position);
    kit.controls.target.set(0, 0, 0);
    if (fb) sunwardDir(fb, _dir);
    kit.camera.position.copy(_dir).multiplyScalar(fb ? fb.dispR * 6 : 2.2e8);
  } else {
    kit.controls.minDistance = 0.02;
    kit.controls.maxDistance = 4000;
    if (kit.starfield.parent === kit.camera) {
      kit.camera.remove(kit.starfield);
      kit.scene.add(kit.starfield);
      kit.starfield.position.set(0, 0, 0);
    }
    kit.world.position.set(0, 0, 0);
    for (const b of reg.all) b.rootPos.copy(b.dispPos);
    if (fb) kit.controls.target.copy(fb.dispPos);
    else kit.controls.target.set(0, 0, 0);
    kit.camera.position.copy(kit.controls.target).addScaledVector(_dir, fb ? Math.max(fb.dispR * 6, 0.5) : 124);
    kit.camera.near = 0.002;
    kit.camera.far = 9000;
    kit.camera.updateProjectionMatrix();
  }
}

/* ─────────────────────────── 深链（?follow=<id>、?true=1） ─────────────────────────── */

const qs = new URLSearchParams(location.search);
const qsFollow = qs.get("follow");
if (qsFollow && reg.byId.has(qsFollow)) selectBody(qsFollow, true);
if (qs.get("true") === "1") {
  state.trueScale = true;
  (document.getElementById("chk-true") as HTMLInputElement).checked = true;
  applyScaleMode();
}
if (qs.get("apparent") === "1") {
  state.apparent = true;
  (document.getElementById("chk-apparent") as HTMLInputElement).checked = true;
}
if (qs.get("mag") === "1") {
  state.showMag = true;
  (document.getElementById("chk-mag") as HTMLInputElement).checked = true;
  applyVisibility();
}
const qsSat = qs.get("sat");
if (qsSat) pendingSatNorad = qsSat;
if (qs.get("stress") === "1") stressMode = true;

/* ─────────────────────────── 主循环 ─────────────────────────── */

const _delta = new THREE.Vector3();
let lastInfo = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1); // 后台切回不跳变
  if (!state.paused) state.jd += state.direction * state.rate * dt;

  updatePhysics(state.jd);

  if (state.trueScale) {
    // 浮动原点：跟随目标每帧贴合；未跟随则仅在「最近天体」变化时迁移原点，
    // 相机/目标同步平移 −Δ，保持取景不变且根空间坐标小（float32 精度）
    const fb = state.followId ? reg.byId.get(state.followId) : null;
    if (fb) {
      // 原点每帧贴合跟随目标 → 目标根空间位置恒为 0，相机无需平移；
      // 仅切换跟随对象时按当前视线方向重新取景
      const jumped = originBodyId !== fb.id;
      originBodyId = fb.id;
      originTrue.copy(fb.dispPos);
      if (jumped) {
        _dir.copy(kit.camera.position).sub(kit.controls.target);
        if (_dir.lengthSq() < 1e-12) _dir.set(0, 0, 1);
        _dir.normalize();
        sunwardDir(fb, _dir);
        kit.controls.target.set(0, 0, 0);
        kit.camera.position.copy(_dir).multiplyScalar(fb.dispR * 6);
      }
    } else {
      let best = Infinity;
      let bestId = originBodyId;
      for (const b of reg.all) {
        _proj.copy(b.dispPos).add(kit.world.position);
        const d2 = _proj.distanceToSquared(kit.camera.position);
        if (d2 < best) { best = d2; bestId = b.id; }
      }
      if (bestId !== originBodyId) {
        originBodyId = bestId;
        _tmp.copy(reg.byId.get(bestId)!.dispPos).sub(originTrue);
        originTrue.copy(reg.byId.get(bestId)!.dispPos);
        kit.camera.position.sub(_tmp);
        kit.controls.target.sub(_tmp);
      }
    }
    kit.world.position.copy(originTrue).negate();
  } else {
    kit.world.position.set(0, 0, 0);
  }
  kit.sunLight.position.copy(reg.sun.dispPos);
  for (const b of reg.all) b.rootPos.copy(b.dispPos).add(kit.world.position);

  orbits.update(state.jd, state.trueScale ? originTrue : ORIGIN_ZERO);
  belt.update(state.jd, state.trueScale ? originTrue : ORIGIN_ZERO, state.trueScale);

  // 人造卫星：Worker 节流请求传播（~8Hz），主线程每帧用最新位置更新点云
  if (showSats && satBuf && satWorker) {
    const nowMs = performance.now();
    if (nowMs - lastPropReq > 120) {
      lastPropReq = nowMs;
      satWorker.postMessage({ type: "prop", timeMs: jdToMs(state.jd) });
    }
    sats.setDotSize(dotSize()); // 屏幕空间恒定点径，随缩放自适应
    sats.update(satBuf, gstime(state.jd), earthBody().rootPos, kmToScene());
  }

  // 跟随（观赏模式）：相机与目标整体平移，保留用户当前视角；
  // 真实比例模式由浮动原点承担，无需此步
  if (state.followId && !state.trueScale) {
    const b = reg.byId.get(state.followId);
    if (b) {
      _delta.copy(b.rootPos).sub(kit.controls.target);
      kit.controls.target.copy(b.rootPos);
      kit.camera.position.add(_delta);
    }
  }

  // 真实比例：near/far 随目标距离动态收紧（配合 LogarithmicDepthBuffer）
  if (state.trueScale) {
    const d = kit.camera.position.distanceTo(kit.controls.target);
    kit.camera.near = Math.min(10, Math.max(1e-4, d * 1e-4));
    kit.camera.far = Math.max(2e4, d * 1e3);
    kit.camera.updateProjectionMatrix();
  }

  kit.controls.update();
  updateShapeLod(reg, kit.camera);
  labels.update(kit.camera, state);
  ui.update();
  const now = performance.now();
  if (now - lastInfo > 100) { infoCard.refresh(); lastInfo = now; }
  kit.renderer.render(kit.scene, kit.camera);
}
frame();
