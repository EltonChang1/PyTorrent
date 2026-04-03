/** Home page primary row keys + labels (dashboard hide/show and row order). */
export const HOME_ROW_OPTIONS: { key: string; label: string }[] = [
  { key: "yts-trend", label: "Trending on YTS" },
  { key: "yts-recent", label: "Recently added (YTS)" },
  { key: "yts-top10", label: "Top 10 on YTS" },
  { key: "yts-horror", label: "Horror on YTS" },
  { key: "yts-comedy", label: "Comedy on YTS" },
  { key: "yts-scifi", label: "Sci-Fi on YTS" },
  { key: "yts-action", label: "Action on YTS" },
  { key: "yts-classics", label: "Highly rated classics" },
  { key: "yts-pfy-0", label: "Picked for you — genre slot 1" },
  { key: "yts-pfy-1", label: "Picked for you — genre slot 2" },
  { key: "yts-pfy-2", label: "Picked for you — genre slot 3" },
  { key: "yts-similar", label: "More like your last watch" },
];

export const HOME_ROW_KEYS = HOME_ROW_OPTIONS.map((r) => r.key);

/** Merge saved order with any new keys (stable default order). */
export function normalizeHomeRowOrder(saved: string[] | undefined | null): string[] {
  const order = Array.isArray(saved) ? saved : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of order) {
    if (HOME_ROW_KEYS.includes(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of HOME_ROW_KEYS) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}
