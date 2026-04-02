import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import type { CatalogItem } from "../catalog/types";
import { fetchBrowseRow } from "../catalog/browse";
import { HeroBanner } from "../components/HeroBanner";
import { ContentRow } from "../components/ContentRow";
import { TitleDetailModal } from "../components/TitleDetailModal";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";

const HOME_ROWS = [
  { key: "yts-trend", title: "Trending on YTS", kind: "trending" as const, site: "yts" },
  { key: "tgx-trend", title: "Trending on TorrentGalaxy", kind: "trending" as const, site: "tgx" },
  { key: "1337x-recent", title: "Recently added — 1337x", kind: "recent" as const, site: "1337x" },
  { key: "piratebay-trend", title: "Trending — The Pirate Bay", kind: "trending" as const, site: "piratebay" },
  { key: "limetorrent-recent", title: "Recent — LimeTorrents", kind: "recent" as const, site: "limetorrent" },
  { key: "kickass-trend", title: "Trending — Kickass", kind: "trending" as const, site: "kickass" },
] as const;

type RowState = { items: CatalogItem[]; loading: boolean; error?: string };

export function HomePage() {
  const { api, showToast, refreshTorrents, torrentRows, searchConfigured } =
    useOutletContext<AppOutletContext>();

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(HOME_ROWS.map((r) => [r.key, { items: [], loading: true }])),
  );
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [heroItem, setHeroItem] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!searchConfigured) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        HOME_ROWS.map(async (spec) => {
          const { items, error } = await fetchBrowseRow(api, spec.kind, spec.site);
          if (cancelled) return;
          setRows((prev) => ({
            ...prev,
            [spec.key]: { items, loading: false, error },
          }));
        }),
      );
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
    for (const spec of HOME_ROWS) {
      const first = rows[spec.key]?.items?.[0];
      if (first) {
        setHeroItem(first);
        return;
      }
    }
    setHeroItem(null);
  }, [rows]);

  const addMagnet = useCallback(
    async (magnet: string) => {
      setAdding(true);
      try {
        const r = await api("/torrents/magnet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ magnet }),
        });
        if (!r.ok) {
          showToast(await r.text(), "err");
          return;
        }
        const j = (await r.json()) as { name?: string };
        showToast(`Added: ${j.name ?? "torrent"}`, "ok");
        setSelected(null);
        await refreshTorrents();
      } finally {
        setAdding(false);
      }
    },
    [api, showToast, refreshTorrents],
  );

  const openDetail = useCallback((item: CatalogItem) => setSelected(item), []);

  const heroForBanner = useMemo(() => heroItem, [heroItem]);

  if (!searchConfigured) {
    return (
      <div className="page-home page-narrow">
        <div className="empty-state">
          <h1 className="hero-title">Catalog unavailable</h1>
          <p className="muted">
            Run{" "}
            <a href="https://github.com/Ryuk-me/Torrent-Api-py" target="_blank" rel="noreferrer">
              Torrent-Api-py
            </a>{" "}
            and set <code>PYTORRENT_SEARCH_API_BASE</code> on <code>pytorrentd</code>, then refresh.
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
        onAdd={() => heroForBanner?.magnet && addMagnet(heroForBanner.magnet)}
        adding={adding}
        canAdd={Boolean(heroForBanner?.magnet)}
      />

      <div className="page-home-rows">
        <ContinueWatchingRow jobs={torrentRows} />

        {HOME_ROWS.map((spec) => {
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
        onAdd={addMagnet}
        adding={adding}
      />
    </div>
  );
}
