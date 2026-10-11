/**
 * 时间系统：内部统一儒略日（TT 时标），UI 显示转 UTC。
 * JD(TT) = JD(UTC) + TT-UTC（~69s，取常数近似，阶段 1 精度足够）
 */

const TT_MINUS_UTC_SEC = 69.184;
const DAY_MS = 86400000;

/** JavaScript Date (UTC) → 儒略日（TT 时标） */
export function dateToJD(date: Date): number {
  return date.getTime() / DAY_MS + 2440587.5 + TT_MINUS_UTC_SEC / 86400;
}

/** 儒略日（TT）→ JavaScript Date（近似，忽略 TT-UTC 差） */
export function jdToDate(jd: number): Date {
  return new Date(Math.round((jd - 2440587.5) * DAY_MS));
}

/** 自 J2000.0 (JD 2451545.0 TT) 起的儒略世纪数 */
export function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

/** 儒略日 → 距 J2000.0 的天数 */
export function daysSinceJ2000(jd: number): number {
  return jd - 2451545.0;
}

/** 格式化仿真日期为 UTC 显示字符串 */
export function formatSimDate(jd: number): string {
  const d = jdToDate(jd);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1) +
    "-" + pad(d.getUTCDate()) +
    " " + pad(d.getUTCHours()) +
    ":" + pad(d.getUTCMinutes()) +
    ":" + pad(d.getUTCSeconds()) + " UTC"
  );
}

/** datetime-local 输入值 → Date（按本地时区解释再转 UTC 内部） */
export function localInputToDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
