import type { ApiFn, CatalogItem } from "./types";

const API_PREFIX = import.meta.env.DEV ? "/api" : "";

/** Dev: prefix `/catalog/*` so Vite proxies to the daemon. */
export function resolveCatalogMediaUrl(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/catalog/")) return `${API_PREFIX}${href}`;
  return null;
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
