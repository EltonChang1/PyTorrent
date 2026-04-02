import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import type { CatalogItem } from "../catalog/types";
import { fetchBrowseRow } from "../catalog/browse";
import { HeroBanner } from "../components/HeroBanner";
import { ContentRow } from "../components/ContentRow";
import { TitleDetailModal } from "../components/TitleDetailModal";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";

const YTS_HOME_ROWS = [
  { key: "yts-trend", title: "Trending on YTS", kind: "trending" as const, site: "yts" },
] as const;

const BACKUP_HOME_ROWS = [
  { key: "tgx-trend", title: "Trending on TorrentGalaxy", kind: "trending" as const, site: "tgx" },
  { key: "1337x-recent", title: "Recently added — 1337x", kind: "recent" as const, site: "1337x" },
  { key: "piratebay-trend", title: "Trending — The Pirate Bay", kind: "trending" as const, site: "piratebay" },
  { key: "limetorrent-recent", title: "Recent — LimeTorrents", kind: "recent" as const, site: "limetorrent" },
  { key: "kickass-trend", title: "Trending — Kickass", kind: "trending" as const, site: "kickass" },
] as const;

const ALL_KEYS = [...YTS_HOME_ROWS.map((r) => r.key), ...BACKUP_HOME_ROWS.map((r) => r.key)] as string[];

type RowState = { items: CatalogItem[]; loading: boolean; error?: string };

function emptyRows(loadingYts: boolean): Record<string, RowState> {
  const o: Record<string, RowState> = {};
  for (const k of ALL_KEYS) {
    const isYts = k.startsWith("yts-");
    o[k] = { items: [], loading: isYts ? loadingYts : false };
  }
  return o;
}

export function HomePage() {
  const { api, showToast, refreshTorrents, torrentRows, searchConfigured } =
    useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Record<string, RowState>>(() => emptyRows(true));
  const [catalogFallback, setCatalogFallback] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [heroItem, setHeroItem] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState<"full" | "stream" | null>(null);

  useEffect(() => {
    if (!searchConfigured) return;
    let cancelled = false;
    (async () => {
      const ytsResults = await Promise.all(
        YTS_HOME_ROWS.map((spec) => fetchBrowseRow(api, spec.kind, spec.site)),
      );
      if (cancelled) return;

      const ytsFailed = ytsResults.every(
        (r) => Boolean(r.error) || !Array.isArray(r.items) || r.items.length === 0,
      );

      if (ytsFailed) {
        setCatalogFallback(true);
        const backupResults = await Promise.all(
          BACKUP_HOME_ROWS.map((spec) => fetchBrowseRow(api, spec.kind, spec.site)),
        );
        if (cancelled) return;
        setRows((prev) => {
          const next = { ...prev };
          for (let i = 0; i < YTS_HOME_ROWS.length; i++) {
            const spec = YTS_HOME_ROWS[i];
            const { items, error } = ytsResults[i];
            next[spec.key] = { items, loading: false, error };
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
      setRows((prev) => {
        const next = { ...prev };
        for (let i = 0; i < YTS_HOME_ROWS.length; i++) {
          const spec = YTS_HOME_ROWS[i];
          const { items, error } = ytsResults[i];
          next[spec.key] = { items, loading: false, error };
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
  }, [api, searchConfigured]);

  useEffect(() => {
    const yts = rows["yts-trend"]?.items?.[0];
    if (yts) {
      setHeroItem(yts);
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
  }, [rows, catalogFallback]);

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

  const heroForBanner = useMemo(() => heroItem, [heroItem]);

  const rowsToRender = catalogFallback
    ? [...YTS_HOME_ROWS, ...BACKUP_HOME_ROWS]
    : [...YTS_HOME_ROWS];

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
        item={heroForBanner}
        onMoreInfo={() => heroForBanner && setSelected(heroForBanner)}
        onAddFull={() => heroForBanner?.magnet && addMagnet(heroForBanner.magnet, "full")}
        onAddStream={() => heroForBanner?.magnet && addMagnet(heroForBanner.magnet, "stream")}
        adding={adding}
        canAdd={Boolean(heroForBanner?.magnet)}
      />

      {catalogFallback ? (
        <p className="catalog-fallback-banner muted">
          YTS catalog unavailable — showing backup sources. Primary list:{" "}
          <code>YTS_BASE_URL</code> (default <code>https://www3.yts-official.to</code>).
        </p>
      ) : null}

      <div className="page-home-rows">
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
