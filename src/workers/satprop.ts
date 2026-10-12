/**
 * SGP4 传播 Worker（规格 §4.3：传播放 Web Worker，satellite.js MIT）：
 * - init：twoline2satrec 建卫星记录
 * - prop：批量传播全部目标 → Float32Array ECI(km) 回传（transferable）
 * - orbit：单目标单周期采样 → 精轨线点列
 * 传播失败（decay/异常）位置写 NaN，渲染端跳过。
 */
import { twoline2satrec, propagate } from "satellite.js";

interface InitMsg { type: "init"; names: string[]; line1: string[]; line2: string[]; norad: string[] }
interface PropMsg { type: "prop"; timeMs: number }
interface OrbitMsg { type: "orbit"; norad: string; timeMs: number; minutes: number; samples: number }

let satrecs: ReturnType<typeof twoline2satrec>[] = [];
let noradIndex = new Map<string, number>();

function propagateAll(timeMs: number) {
  const n = satrecs.length;
  const buf = new Float32Array(n * 3);
  const date = new Date(timeMs);
  for (let i = 0; i < n; i++) {
    const pv = propagate(satrecs[i], date);
    const p = pv && (pv.position as { x: number; y: number; z: number } | null);
    if (p && Number.isFinite(p.x)) {
      buf[i * 3] = p.x; buf[i * 3 + 1] = p.y; buf[i * 3 + 2] = p.z;
    } else {
      buf[i * 3] = NaN; buf[i * 3 + 1] = NaN; buf[i * 3 + 2] = NaN;
    }
  }
  return buf;
}

self.onmessage = (e: MessageEvent<InitMsg | PropMsg | OrbitMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    satrecs = new Array(msg.line1.length);
    noradIndex = new Map();
    for (let i = 0; i < msg.line1.length; i++) {
      satrecs[i] = twoline2satrec(msg.line1[i], msg.line2[i]);
      noradIndex.set(msg.norad[i], i);
    }
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: "ready", count: satrecs.length });
  } else if (msg.type === "prop") {
    const buf = propagateAll(msg.timeMs);
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void })
      .postMessage({ type: "positions", timeMs: msg.timeMs, buf }, [buf.buffer]);
  } else if (msg.type === "orbit") {
    const idx = noradIndex.get(msg.norad);
    if (idx === undefined) return;
    const rec = satrecs[idx];
    const buf = new Float32Array(msg.samples * 3);
    const spanMs = msg.minutes * 60000;
    for (let s = 0; s < msg.samples; s++) {
      const t = msg.timeMs - spanMs / 2 + (spanMs * s) / (msg.samples - 1);
      const pv = propagate(rec, new Date(t));
      const p = pv && (pv.position as { x: number; y: number; z: number } | null);
      if (p && Number.isFinite(p.x)) {
        buf[s * 3] = p.x; buf[s * 3 + 1] = p.y; buf[s * 3 + 2] = p.z;
      } else {
        buf[s * 3] = NaN; buf[s * 3 + 1] = NaN; buf[s * 3 + 2] = NaN;
      }
    }
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void })
      .postMessage({ type: "orbit", norad: msg.norad, buf }, [buf.buffer]);
  }
};
