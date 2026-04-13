import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import type { CatalogItem } from "../catalog/types";
import { fetchBrowseRow } from "../catalog/browse";
import {
  ALL_PRIMARY_ROW_KEYS,
  buildPrimaryRowSpecs,
  fetchPrimarySpec,
  filterVisibleSpecs,
  sortSpecsByRowOrder,
  type PrimaryRowSpec,
} from "../catalog/homeRowSpecs";
import { HeroBanner } from "../components/HeroBanner";
import { ContentRow } from "../components/ContentRow";
import { TitleDetailModal } from "../components/TitleDetailModal";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";
import { ResumePlaybackRow } from "../components/ResumePlaybackRow";
import { MyListRow } from "../components/MyListRow";
import type { DashboardSettings } from "../lib/dashboardSettings";
import { defaultDashboardSettings, loadGuestDashboard } from "../lib/dashboardSettings";
import { saveJobCatalogSnapshot } from "../lib/jobMeta";
import { getLastCatalogTitle, setLastCatalogTitle, subscribeLastCatalogTitle } from "../lib/lastCatalogTitle";
import { isInMyList, setMyListAll, toggleMyList } from "../lib/myList";

const BACKUP_HOME_ROWS = [
  { key: "tgx-trend", title: "Trending on TorrentGalaxy", kind: "trending" as const, site: "tgx" },
  { key: "1337x-recent", title: "Recently added — 1337x", kind: "recent" as const, site: "1337x" },
  { key: "piratebay-trend", title: "Trending — The Pirate Bay", kind: "trending" as const, site: "piratebay" },
  { key: "limetorrent-recent", title: "Recent — LimeTorrents", kind: "recent" as const, site: "limetorrent" },
  { key: "kickass-trend", title: "Trending — Kickass", kind: "trending" as const, site: "kickass" },
] as const;

const BACKUP_KEYS = BACKUP_HOME_ROWS.map((r) => r.key);
const ALL_KEYS = [...new Set([...ALL_PRIMARY_ROW_KEYS, ...BACKUP_KEYS])];

type BackupSpec = (typeof BACKUP_HOME_ROWS)[number];
type RenderSpec = PrimaryRowSpec | BackupSpec;

type RowState = { items: CatalogItem[]; loading: boolean; error?: string };

function emptyRows(loadingYts: boolean): Record<string, RowState> {
  const o: Record<string, RowState> = {};
  for (const k of ALL_KEYS) {
    const isPrimary = ALL_PRIMARY_ROW_KEYS.includes(k);
    o[k] = { items: [], loading: isPrimary ? loadingYts : false };
  }
  return o;
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
  const [similarQ, setSimilarQ] = useState<string | null>(() => getLastCatalogTitle());
  const [refetchTick, setRefetchTick] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => subscribeLastCatalogTitle(() => setSimilarQ(getLastCatalogTitle())), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

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
        const j = (await r.json()) as Partial<DashboardSettings> & { myList?: CatalogItem[] };
        if (!cancelled) {
          setDash({ ...defaultDashboardSettings(), ...j });
          if (Array.isArray(j.myList)) setMyListAll(j.myList);
        }
      } catch {
        if (!cancelled) setDash(loadGuestDashboard());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user]);

  const displaySpecs = useMemo(() => {
    const all = buildPrimaryRowSpecs(dash);
    const vis = filterVisibleSpecs(all, dash, similarQ);
    const sorted = sortSpecsByRowOrder(vis.length ? vis : all.slice(0, 2), dash.rowOrder);
    return sorted;
  }, [
    dash.hiddenRowKeys,
    dash.favoriteGenres,
    dash.showRecommendations,
    dash.rowOrder,
    similarQ,
  ]);

  useEffect(() => {
    if (!searchConfigured) return;
    let cancelled = false;
    (async () => {
      const specs = displaySpecs;
      const results = await Promise.all(specs.map((spec) => fetchPrimarySpec(api, spec, similarQ)));
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
          for (const k of ALL_PRIMARY_ROW_KEYS) {
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
        for (const k of ALL_PRIMARY_ROW_KEYS) {
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
  }, [api, searchConfigured, displaySpecs, similarQ, refetchTick]);

  const heroPool = useMemo(() => {
    const trend = rows["yts-trend"]?.items ?? [];
    return trend.slice(0, 12);
  }, [rows]);

  useEffect(() => {
    setHeroIdx(0);
  }, [heroPool.length]);

  useEffect(() => {
    if (reducedMotion) return;
    if (heroPool.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroPool.length);
    }, 14000);
    return () => window.clearInterval(id);
  }, [heroPool.length, reducedMotion]);

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
    async (magnet: string, mode: "full" | "stream", catalogItem: CatalogItem | null = null) => {
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
        if (j.id && catalogItem) saveJobCatalogSnapshot(j.id, catalogItem);
        setLastCatalogTitle(catalogItem?.name ?? j.name ?? null);
        showToast(`Added: ${j.name ?? "torrent"}`, "ok", { label: "My downloads", to: "/downloads" });
        setSelected(null);
        await refreshTorrents();
        if (mode === "stream" && j.id) navigate(`/watch?id=${encodeURIComponent(j.id)}`);
      } catch (e) {
        showToast(String(e), "err");
      } finally {
        setAdding(null);
      }
    },
    [api, showToast, refreshTorrents, navigate],
  );

  const openDetail = useCallback((item: CatalogItem) => setSelected(item), []);

  const rowsToRender: RenderSpec[] = useMemo(() => {
    if (catalogFallback) {
      return [...buildPrimaryRowSpecs(dash), ...BACKUP_HOME_ROWS];
    }
    return displaySpecs;
  }, [catalogFallback, dash, displaySpecs]);

  const bumpRefetch = useCallback(() => setRefetchTick((t) => t + 1), []);

  if (!searchConfigured) {
    return (
      <div className="page-home page-narrow">
        <div className="empty-state">
          <h1 className="hero-title">Catalog unavailable</h1>
          <p className="muted">
            To show the catalog in Torflix, start <code>pytorrentd</code> with the embedded catalog API, or run{" "}
            <a href="https://github.com/Ryuk-me/Torrent-Api-py" target="_blank" rel="noreferrer">
              Torrent-Api-py
            </a>{" "}
            and set <code>PYTORRENT_SEARCH_API_BASE</code>, then refresh.
          </p>
        </div>
      </div>
    );
  }

  let stagger = 0;
  const nextStagger = () => ++stagger;

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
          void addMagnet(heroItem.magnet, "full", heroItem);
        }}
        onAddStream={() => {
          if (!heroItem?.magnet) return;
          if (heroItem.torrents && heroItem.torrents.length > 1) {
            setSelected(heroItem);
            return;
          }
          void addMagnet(heroItem.magnet, "stream", heroItem);
        }}
        adding={adding}
        canAdd={Boolean(heroItem?.magnet)}
      />

      {catalogFallback ? (
        <p className="catalog-fallback-banner muted">
          YTS catalog unavailable — showing backup sources. Primary list:{" "}
          <code>YTS_BASE_URL</code> (default <code>https://yts.bz</code>).
        </p>
      ) : null}

      <div className="page-home-rows">
        <ResumePlaybackRow />
        <ContinueWatchingRow jobs={torrentRows} />
        <MyListRow onSelect={openDetail} staggerIndex={nextStagger()} />

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
              onRetry={bumpRefetch}
              staggerIndex={nextStagger()}
              showTop10Rank={spec.key === "yts-top10"}
              myListEnabled
              isInMyList={isInMyList}
              onMyListToggle={(item) => {
                toggleMyList(item);
              }}
            />
          );
        })}
      </div>

      <TitleDetailModal
        item={selected}
        onClose={() => setSelected(null)}
        onAddFull={(m, catalogItem) => addMagnet(m, "full", catalogItem)}
        onAddStream={(m, catalogItem) => addMagnet(m, "stream", catalogItem)}
        adding={adding}
      />
    </div>
  );
}
