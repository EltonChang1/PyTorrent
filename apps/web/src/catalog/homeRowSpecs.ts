import type { AppOutletContext } from "../appOutletContext";
import type { DashboardSettings } from "../lib/dashboardSettings";
import {
  fetchBrowseRow,
  fetchSearchCatalog,
  fetchYtsCuratedList,
  type YtsCuratedParams,
} from "./browse";
import type { CatalogItem } from "./types";

export type RowSource =
  | { kind: "browse"; browse: "trending" | "recent"; site: string }
  | { kind: "ytsJson"; params: YtsCuratedParams }
  | { kind: "similar" };

export type PrimaryRowSpec = { key: string; title: string; source: RowSource };

export const PFY_KEYS = ["yts-pfy-0", "yts-pfy-1", "yts-pfy-2"] as const;

const CORE_SPECS: PrimaryRowSpec[] = [
  {
    key: "yts-trend",
    title: "Trending on YTS",
    source: { kind: "ytsJson", params: { sort_by: "seeds", order_by: "desc" } },
  },
  {
    key: "yts-recent",
    title: "Recently added (YTS)",
    source: { kind: "ytsJson", params: { sort_by: "date_added", order_by: "desc" } },
  },
  {
    key: "yts-top10",
    title: "Top 10 on YTS",
    source: {
      kind: "ytsJson",
      params: { sort_by: "download_count", order_by: "desc", limit: 10 },
    },
  },
  { key: "yts-horror", title: "Horror on YTS", source: { kind: "ytsJson", params: { genre: "Horror" } } },
  { key: "yts-comedy", title: "Comedy on YTS", source: { kind: "ytsJson", params: { genre: "Comedy" } } },
  { key: "yts-scifi", title: "Sci-Fi on YTS", source: { kind: "ytsJson", params: { genre: "Sci-Fi" } } },
  { key: "yts-action", title: "Action on YTS", source: { kind: "ytsJson", params: { genre: "Action" } } },
  {
    key: "yts-classics",
    title: "Highly rated classics",
    source: { kind: "ytsJson", params: { sort_by: "year", order_by: "asc", minimum_rating: 7 } },
  },
];

const SIMILAR_SPEC: PrimaryRowSpec = {
  key: "yts-similar",
  title: "More like your last watch",
  source: { kind: "similar" },
};

/** All keys that may appear in row state (for empty row init). */
export const ALL_PRIMARY_ROW_KEYS: string[] = [
  ...CORE_SPECS.map((s) => s.key),
  ...PFY_KEYS,
  SIMILAR_SPEC.key,
];

export function buildPrimaryRowSpecs(dash: DashboardSettings): PrimaryRowSpec[] {
  const pfy: PrimaryRowSpec[] = [];
  if (dash.showRecommendations) {
    dash.favoriteGenres.slice(0, 3).forEach((g, i) => {
      const genre = (g ?? "").trim();
      if (!genre) return;
      pfy.push({
        key: PFY_KEYS[i],
        title: `Picked for you — ${genre}`,
        source: { kind: "ytsJson", params: { genre, sort_by: "download_count" } },
      });
    });
  }
  return [...CORE_SPECS, ...pfy, SIMILAR_SPEC];
}

export function filterVisibleSpecs(
  specs: PrimaryRowSpec[],
  dash: DashboardSettings,
  similarQuery: string | null,
): PrimaryRowSpec[] {
  return specs.filter((spec) => {
    if (dash.hiddenRowKeys.includes(spec.key)) return false;
    if (spec.key === SIMILAR_SPEC.key && (!similarQuery || similarQuery.length < 3)) return false;
    if ((PFY_KEYS as readonly string[]).includes(spec.key)) {
      if (!dash.showRecommendations) return false;
      const idx = (PFY_KEYS as readonly string[]).indexOf(spec.key);
      if (!dash.favoriteGenres[idx]?.trim()) return false;
    }
    return true;
  });
}

export function sortSpecsByRowOrder(specs: PrimaryRowSpec[], order: string[]): PrimaryRowSpec[] {
  if (!order.length) return specs;
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? 500 + specs.findIndex((s) => s.key === k) : i;
  };
  return [...specs].sort((a, b) => rank(a.key) - rank(b.key));
}

export async function fetchPrimarySpec(
  api: AppOutletContext["api"],
  spec: PrimaryRowSpec,
  similarQuery: string | null,
): Promise<{ spec: PrimaryRowSpec; items: CatalogItem[]; error?: string }> {
  try {
    if (spec.source.kind === "browse") {
      const r = await fetchBrowseRow(api, spec.source.browse, spec.source.site);
      return { spec, items: r.items, error: r.error };
    }
    if (spec.source.kind === "ytsJson") {
      const r = await fetchYtsCuratedList(api, spec.source.params);
      return { spec, items: r.items, error: r.error };
    }
    if (!similarQuery || similarQuery.length < 3) return { spec, items: [] };
    const r = await fetchSearchCatalog(api, similarQuery, "yts", 24);
    return { spec, items: r.items, error: r.error };
  } catch (e) {
    return { spec, items: [], error: String(e) };
  }
}
