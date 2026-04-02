import type { ApiFn, CatalogItem } from "./types";

const API_PREFIX = import.meta.env.DEV ? "/api" : "";

/** Dev: prefix `/catalog/*` so Vite proxies to the daemon. */
export function resolveCatalogMediaUrl(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/catalog/")) return `${API_PREFIX}${href}`;
  return null;
}

export type YtsCuratedParams = {
  genre?: string;
  sort_by?: string;
  order_by?: string;
  minimum_rating?: number;
};

/** YTS JSON API slice (genre / sort); uses daemon `/browse/yts/list`. */
export async function fetchYtsCuratedList(
  api: ApiFn,
  params: YtsCuratedParams,
  limit = 24,
): Promise<{ items: CatalogItem[]; error?: string }> {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("page", "1");
  if (params.genre) q.set("genre", params.genre);
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.order_by) q.set("order_by", params.order_by);
  if (params.minimum_rating != null) q.set("minimum_rating", String(params.minimum_rating));
  const r = await api(`/browse/yts/list?${q.toString()}`);
  const j = (await r.json()) as { data?: CatalogItem[]; error?: string };
  if (!r.ok) {
    return {
      items: [],
      error: typeof j?.error === "string" ? j.error : `HTTP ${r.status}`,
    };
  }
  return { items: Array.isArray(j.data) ? j.data : [] };
}

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

/** Ordered poster URLs (proxied `/catalog/image?…` or remote https, for fallback chain). */
export function posterUrlsList(row: CatalogItem): string[] {
  const p = row.poster;
  if (!p) return [];
  if (typeof p === "string") {
    const u = resolveCatalogMediaUrl(p);
    return u ? [u] : [];
  }
  if (!Array.isArray(p)) return [];
  const out: string[] = [];
  for (const x of p) {
    if (typeof x !== "string") continue;
    const u = resolveCatalogMediaUrl(x);
    if (u) out.push(u);
  }
  return out;
}

export function posterSrc(row: CatalogItem): string | undefined {
  return posterUrlsList(row)[0];
}
