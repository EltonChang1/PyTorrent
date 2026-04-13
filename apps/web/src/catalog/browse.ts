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
  /** Override default limit when set */
  limit?: number;
};

/** Curated movie list slice (genre / sort); hits the daemon browse list endpoint. */
export async function fetchYtsCuratedList(
  api: ApiFn,
  params: YtsCuratedParams,
  defaultLimit = 24,
): Promise<{ items: CatalogItem[]; error?: string }> {
  const lim = params.limit ?? defaultLimit;
  const q = new URLSearchParams();
  q.set("limit", String(lim));
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

export async function fetchSearchCatalog(
  api: ApiFn,
  q: string,
  site: string,
  limit = 24,
): Promise<{ items: CatalogItem[]; error?: string }> {
  const query = q.trim();
  if (query.length < 2) return { items: [] };
  const r = await api(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}&site=${encodeURIComponent(site)}`,
  );
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
  // Do not send category=movies by default: many sites reject it (primary catalog: no trending/recent-by-category;
  // Pirate Bay trending only allows e.g. tv). That caused a first 404 on every row load in devtools.
  const r = await api(`${path}?site=${encodeURIComponent(site)}&limit=${limit}`);
  const j = (await r.json()) as { data?: CatalogItem[]; error?: string };
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
