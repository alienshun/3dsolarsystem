/**
 * TLE 存储层（规格 §4.3：在线刷新 → IndexedDB 缓存；打包快照兜底）：
 * 加载优先级：IndexedDB 缓存 → 打包快照 public/tle/active.3le
 * 在线刷新：CelesTrak GP API 多组并集（active∪starlink∪oneweb）去重后写缓存。
 * CelesTrak 同组 2 小时内重复请求返回限流提示（非 TLE），此处按行过滤忽略。
 */
import { mergeDedup } from "../data/tle";

const DB_NAME = "solsim";
const STORE = "tle";
const KEY = "active";

export interface TleCache {
  text: string;
  fetchedAt: number;
}

const GROUPS = ["active", "starlink", "oneweb"];
const GP_URL = (g: string) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=3le`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCache(): Promise<TleCache | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as TleCache) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putCache(text: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ text, fetchedAt: Date.now() } satisfies TleCache, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* 缓存失败不致命，回退快照 */
  }
}

/** 打包快照（离线兜底） */
export async function loadSnapshot(base: string): Promise<string> {
  const res = await fetch(`${base}tle/active.3le`);
  if (!res.ok) throw new Error(`snapshot http ${res.status}`);
  return res.text();
}

/** 在线刷新：多组并集去重；限流/空组自动跳过 */
export async function refreshOnline(): Promise<string> {
  const texts: string[] = [];
  for (const g of GROUPS) {
    try {
      const res = await fetch(GP_URL(g));
      if (!res.ok) continue;
      const t = await res.text();
      if (t.includes("\n1 ") || t.startsWith("1 ")) texts.push(t);
    } catch {
      /* 单组失败忽略 */
    }
  }
  if (!texts.length) throw new Error("在线刷新无可用数据（可能离线或被限流）");
  return mergeDedup(texts);
}
