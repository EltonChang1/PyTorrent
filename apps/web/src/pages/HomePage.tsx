import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import type { CatalogItem } from "../catalog/types";
import { fetchBrowseRow, fetchYtsCuratedList, type YtsCuratedParams } from "../catalog/browse";
import { HeroBanner } from "../components/HeroBanner";
import { ContentRow } from "../components/ContentRow";
import { TitleDetailModal } from "../components/TitleDetailModal";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";
import { ResumePlaybackRow } from "../components/ResumePlaybackRow";
import type { DashboardSettings } from "../lib/dashboardSettings";
import { defaultDashboardSettings, loadGuestDashboard } from "../lib/dashboardSettings";

type RowSource =
  | { kind: "browse"; browse: "trending" | "recent"; site: string }
  | { kind: "ytsJson"; params: YtsCuratedParams }
  | { kind: "recommend" };

type PrimaryRowSpec = { key: string; title: string; source: RowSource };

const STATIC_PRIMARY_ROWS: PrimaryRowSpec[] = [
  { key: "yts-trend", title: "Trending on YTS", source: { kind: "browse", browse: "trending", site: "yts" } },
  { key: "yts-recent", title: "Recently added (YTS)", source: { kind: "browse", browse: "recent", site: "yts" } },
  { key: "yts-horror", title: "Horror on YTS", source: { kind: "ytsJson", params: { genre: "Horror" } } },
  { key: "yts-comedy", title: "Comedy on YTS", source: { kind: "ytsJson", params: { genre: "Comedy" } } },
  { key: "yts-scifi", title: "Sci-Fi on YTS", source: { kind: "ytsJson", params: { genre: "Sci-Fi" } } },
  { key: "yts-action", title: "Action on YTS", source: { kind: "ytsJson", params: { genre: "Action" } } },
  {
    key: "yts-classics",
    title: "Highly rated classics",
    source: { kind: "ytsJson", params: { sort_by: "year", order_by: "asc", minimum_rating: 7 } },
  },
  { key: "yts-for-you", title: "Picked for you", source: { kind: "recommend" } },
];

const BACKUP_HOME_ROWS = [
  { key: "tgx-trend", title: "Trending on TorrentGalaxy", kind: "trending" as const, site: "tgx" },
  { key: "1337x-recent", title: "Recently added — 1337x", kind: "recent" as const, site: "1337x" },
  { key: "piratebay-trend", title: "Trending — The Pirate Bay", kind: "trending" as const, site: "piratebay" },
  { key: "limetorrent-recent", title: "Recent — LimeTorrents", kind: "recent" as const, site: "limetorrent" },
  { key: "kickass-trend", title: "Trending — Kickass", kind: "trending" as const, site: "kickass" },
] as const;

const PRIMARY_KEYS = STATIC_PRIMARY_ROWS.map((r) => r.key);
const ALL_KEYS = [...PRIMARY_KEYS, ...BACKUP_HOME_ROWS.map((r) => r.key)] as string[];

type RowState = { items: CatalogItem[]; loading: boolean; error?: string };

function emptyRows(loadingYts: boolean): Record<string, RowState> {
  const o: Record<string, RowState> = {};
  for (const k of ALL_KEYS) {
    const isYts = k.startsWith("yts-");
    o[k] = { items: [], loading: isYts ? loadingYts : false };
  }
  return o;
}

async function fetchPrimarySpec(
  api: AppOutletContext["api"],
  spec: PrimaryRowSpec,
  dash: DashboardSettings,
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
    const g = dash.favoriteGenres[0] || "Horror";
    const r = await fetchYtsCuratedList(api, { genre: g, sort_by: "download_count" });
    return { spec, items: r.items, error: r.error };
  } catch (e) {
    return { spec, items: [], error: String(e) };
  }
}

export function HomePage() {
  const { api, showToast, refreshTorrents, torrentRows, searchConfigured, user } =
    useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  const [dash, setDash] = useState<DashboardSettings>(() => defaultDashboardSettings());
  const [rows, setRows] = useState<Record<string, RowState>>(() => emptyRows(true));
  const [catalogFallback, setCatalogFallback] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [heroItem, setHeroItem] = useState<CatalogItem | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const [adding, setAdding] = useState<"full" | "stream" | null>(null);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setDash(loadGuestDashboard());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/user/settings");
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as DashboardSettings;
        if (!cancelled) setDash({ ...defaultDashboardSettings(), ...j });
      } catch {
        if (!cancelled) setDash(loadGuestDashboard());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user]);

  const visiblePrimarySpecs = useMemo(() => {
    return STATIC_PRIMARY_ROWS.filter((spec) => {
      if (dash.hiddenRowKeys.includes(spec.key)) return false;
      if (spec.key === "yts-for-you" && !dash.showRecommendations) return false;
      return true;
    });
  }, [dash.hiddenRowKeys, dash.showRecommendations]);

  useEffect(() => {
    if (!searchConfigured) return;
    let cancelled = false;
    (async () => {
      const specs =
        visiblePrimarySpecs.length > 0
          ? visiblePrimarySpecs
          : STATIC_PRIMARY_ROWS.slice(0, 2);
      const results = await Promise.all(specs.map((spec) => fetchPrimarySpec(api, spec, dash)));
      if (cancelled) return;

      const trend = results.find((x) => x.spec.key === "yts-trend");
      const ytsFailed = !trend?.items?.length;

      if (ytsFailed) {
        setCatalogFallback(true);
        const backupResults = await Promise.all(
          BACKUP_HOME_ROWS.map((spec) => fetchBrowseRow(api, spec.kind, spec.site)),
        );
        if (cancelled) return;
        setRows(() => {
          const next = emptyRows(false);
          for (const k of PRIMARY_KEYS) {
            next[k] = { items: [], loading: false };
          }
          for (const br of results) {
            next[br.spec.key] = { items: br.items, loading: false, error: br.error };
          }
          for (let i = 0; i < BACKUP_HOME_ROWS.length; i++) {
            const spec = BACKUP_HOME_ROWS[i];
            const { items, error } = backupResults[i];
            next[spec.key] = { items, loading: false, error };
          }
          return next;
        });
        return;
      }

      setCatalogFallback(false);
      if (cancelled) return;
      setRows((prev) => {
        const next = { ...prev };
        for (const k of PRIMARY_KEYS) {
          next[k] = { items: [], loading: false };
        }
        for (const br of results) {
          next[br.spec.key] = { items: br.items, loading: false, error: br.error };
        }
        for (const spec of BACKUP_HOME_ROWS) {
          next[spec.key] = { items: [], loading: false };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [api, searchConfigured, visiblePrimarySpecs, dash.favoriteGenres.join("|"), dash.showRecommendations]);

  const heroPool = useMemo(() => {
    const trend = rows["yts-trend"]?.items ?? [];
    return trend.slice(0, 12);
  }, [rows]);

  useEffect(() => {
    setHeroIdx(0);
  }, [heroPool.length]);

  useEffect(() => {
    if (heroPool.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroPool.length);
    }, 14000);
    return () => window.clearInterval(id);
  }, [heroPool.length]);

  useEffect(() => {
    const fromTrend = heroPool[heroIdx] ?? heroPool[0];
    if (fromTrend) {
      setHeroItem(fromTrend);
      return;
    }
    if (catalogFallback) {
      for (const spec of BACKUP_HOME_ROWS) {
        const first = rows[spec.key]?.items?.[0];
        if (first) {
          setHeroItem(first);
          return;
        }
      }
    }
    setHeroItem(null);
  }, [rows, catalogFallback, heroPool, heroIdx]);

  const addMagnet = useCallback(
    async (magnet: string, mode: "full" | "stream") => {
      setAdding(mode);
      try {
        const r = await api("/torrents/magnet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ magnet, sequential: mode === "stream" }),
        });
        if (!r.ok) {
          showToast(await r.text(), "err");
          return;
        }
        const j = (await r.json()) as { name?: string; id?: string };
        showToast(`Added: ${j.name ?? "torrent"}`, "ok");
        setSelected(null);
        await refreshTorrents();
        if (mode === "stream" && j.id) navigate(`/watch?id=${encodeURIComponent(j.id)}`);
      } finally {
        setAdding(null);
      }
    },
    [api, showToast, refreshTorrents, navigate],
  );

  const openDetail = useCallback((item: CatalogItem) => setSelected(item), []);

  type RenderSpec = PrimaryRowSpec | (typeof BACKUP_HOME_ROWS)[number];
  const rowsToRender: RenderSpec[] = catalogFallback
    ? [...STATIC_PRIMARY_ROWS, ...BACKUP_HOME_ROWS]
    : visiblePrimarySpecs;

  if (!searchConfigured) {
    return (
      <div className="page-home page-narrow">
        <div className="empty-state">
          <h1 className="hero-title">Catalog unavailable</h1>
          <p className="muted">
            Start <code>pytorrentd</code> with the embedded catalog API, or run{" "}
            <a href="https://github.com/Ryuk-me/Torrent-Api-py" target="_blank" rel="noreferrer">
              Torrent-Api-py
            </a>{" "}
            and set <code>PYTORRENT_SEARCH_API_BASE</code>, then refresh.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-home">
      <HeroBanner
        item={heroItem}
        onMoreInfo={() => heroItem && setSelected(heroItem)}
        onAddFull={() => {
          if (!heroItem?.magnet) return;
          if (heroItem.torrents && heroItem.torrents.length > 1) {
            setSelected(heroItem);
            return;
          }
          void addMagnet(heroItem.magnet, "full");
        }}
        onAddStream={() => {
          if (!heroItem?.magnet) return;
          if (heroItem.torrents && heroItem.torrents.length > 1) {
            setSelected(heroItem);
            return;
          }
          void addMagnet(heroItem.magnet, "stream");
        }}
        adding={adding}
        canAdd={Boolean(heroItem?.magnet)}
      />

      {catalogFallback ? (
        <p className="catalog-fallback-banner muted">
          YTS catalog unavailable — showing backup sources. Primary list:{" "}
          <code>YTS_BASE_URL</code> (default <code>https://www3.yts-official.to</code>).
        </p>
      ) : null}

      <div className="page-home-rows">
        <ResumePlaybackRow />
        <ContinueWatchingRow jobs={torrentRows} />

        {rowsToRender.map((spec) => {
          const st = rows[spec.key] ?? { items: [], loading: true };
          return (
            <ContentRow
              key={spec.key}
              rowKey={spec.key}
              title={spec.title}
              items={st.items}
              loading={st.loading}
              error={st.error}
              onSelect={openDetail}
            />
          );
        })}
      </div>

      <TitleDetailModal
        item={selected}
        onClose={() => setSelected(null)}
        onAddFull={(m) => addMagnet(m, "full")}
        onAddStream={(m) => addMagnet(m, "stream")}
        adding={adding}
      />
    </div>
  );
}
