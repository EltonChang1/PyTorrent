import type { ApiFn, CatalogItem } from "./types";

export async function fetchBrowseRow(
  api: ApiFn,
  kind: "trending" | "recent",
  site: string,
  limit = 24,
): Promise<{ items: CatalogItem[]; error?: string }> {
  const path = kind === "trending" ? "/browse/trending" : "/browse/recent";
  let r = await api(
    `${path}?site=${encodeURIComponent(site)}&limit=${limit}&category=${encodeURIComponent("movies")}`,
  );
  let j = (await r.json()) as { data?: CatalogItem[]; error?: string };
  if (!r.ok || j.error || !Array.isArray(j.data) || j.data.length === 0) {
    r = await api(`${path}?site=${encodeURIComponent(site)}&limit=${limit}`);
    j = (await r.json()) as { data?: CatalogItem[]; error?: string };
  }
  if (!r.ok) {
    return {
      items: [],
      error: typeof j?.error === "string" ? j.error : `HTTP ${r.status}`,
    };
  }
  return { items: Array.isArray(j.data) ? j.data : [] };
}

export function posterSrc(row: CatalogItem): string | undefined {
  const p = row.poster;
  if (!p) return undefined;
  if (typeof p === "string") return p;
  return p.length > 0 && typeof p[0] === "string" ? p[0] : undefined;
}
