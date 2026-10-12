/**
 * TLE 解析与星座分类（规格 §4.3 阶段 4）：
 * - 3LE 文本 → { name, line1, line2 } 数组
 * - 星座按名称前缀归类（搜索/过滤用）
 * - 历元（epoch）解析：TLE 历元为 YYDDD.DDDDDDDD（儒略日年内天数）
 */

export interface TleEntry {
  name: string;
  line1: string;
  line2: string;
  /** NORAD 目录号 */
  norad: string;
  constellation: string;
  /** 历元（Unix ms） */
  epochMs: number;
}

/** 过滤下拉里的「重要」选项标签（精选标志性航天器，默认视图） */
export const FEATURED = "重要";

export const CONSTELLATIONS = [
  "Starlink", "OneWeb", "GPS", "GLONASS", "Galileo", "BeiDou", "Iridium",
  "空间站/载人", "气象", "对地观测", "CubeSat/商业", "其他",
] as const;

/** 精选「重要」航天器：载人空间站、旗舰科学/气象/对地观测任务（按名称匹配） */
const FEATURED_RULES: RegExp[] = [
  /^ISS \(ZARYA\)/i,
  /^CSS \((TIANHE|WENTIAN|MENGTIAN)\)/i,
  /^HST\b/i,
  /^GOES 1[6-9]\b/i,
  /^NOAA 2[01]\b/i,
  /^TERRA$/i,
  /^AQUA$/i,
  /^LANDSAT [89]\b/i,
  /^SENTINEL-[12][AB]\b/i,
  /^TERRASAR-X\b/i,
];

export function isFeatured(name: string): boolean {
  return FEATURED_RULES.some((re) => re.test(name));
}

const PREFIX_RULES: [RegExp, string][] = [
  [/^STARLINK/i, "Starlink"],
  [/^ONEWEB/i, "OneWeb"],
  [/^(GPS|NAVSTAR)/i, "GPS"],
  [/^GLONASS/i, "GLONASS"],
  [/^GALILEO/i, "Galileo"],
  [/^(BEIDOU|COMPASS)/i, "BeiDou"],
  [/^IRIDIUM/i, "Iridium"],
  [/^(ISS|ZARYA|TIANGONG|CSS|SHENZHOU|TIANHE|WENTIAN|MENGTIAN)/i, "空间站/载人"],
  [/^(NOAA|METEOR|METOP|GOES|HIMAWARI|FENGYUN|GK-|ELEKTRO)/i, "气象"],
  [/^(TERRA|AQUA|LANDSAT|SENTINEL|EOS|ALOS|SPOT|WORLDVIEW|GEOEYE|PLEIADES|GAOFEN|ZY-|CBERS)/i, "对地观测"],
  [/^(FLOCK|LEMUR|SWARM|PLANET|DOVE|SUPERDOVE|SPIRE|ICEYE|CAPILLA|HAWK|PATHFINDER)/i, "CubeSat/商业"],
];

export function classify(name: string): string {
  for (const [re, c] of PREFIX_RULES) if (re.test(name)) return c;
  return "其他";
}

/** TLE 历元 YYDDD.DDDDDDDD → Unix ms（YY < 57 视为 20YY，否则 19YY） */
export function parseEpochMs(line1: string): number {
  const yy = parseInt(line1.slice(18, 20), 10);
  const ddd = parseFloat(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(year, 0, 1) + (ddd - 1) * 86400000;
  return ms;
}

/** 解析 3LE 文本；跳过非 TLE 行（如 CelesTrak 限流提示） */
export function parse3le(text: string): TleEntry[] {
  const lines = text.split(/\r?\n/);
  const out: TleEntry[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const name = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1.startsWith("1 ") || !l2.startsWith("2 ")) continue;
    const norad = l1.slice(2, 7).trim();
    out.push({
      name, line1: l1, line2: l2, norad,
      constellation: classify(name),
      epochMs: parseEpochMs(l1),
    });
    i += 2;
  }
  return out;
}

/** 按 NORAD 去重合并多份 3LE 文本 */
export function mergeDedup(texts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i + 2 < lines.length; i++) {
      const l1 = lines[i + 1];
      if (!l1.startsWith("1 ") || !lines[i + 2].startsWith("2 ")) continue;
      const norad = l1.slice(2, 7).trim();
      if (seen.has(norad)) continue;
      seen.add(norad);
      out.push(lines[i].trim(), l1, lines[i + 2]);
      i += 2;
    }
  }
  return out.join("\n") + "\n";
}
