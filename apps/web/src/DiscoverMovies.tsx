import { useCallback, useEffect, useState } from "react";

export type CatalogItem = {
  name?: string;
  magnet?: string;
  size?: string;
  seeders?: string;
  leechers?: string;
  poster?: string | string[];
  url?: string;
  category?: string;
};

type SiteOpt = { id: string; label: string };

const FALLBACK_SITES: SiteOpt[] = [
  { id: "yts", label: "YTS" },
  { id: "1337x", label: "1337x" },
  { id: "limetorrent", label: "LimeTorrents" },
  { id: "tgx", label: "TorrentGalaxy" },
  { id: "piratebay", label: "The Pirate Bay" },
  { id: "kickass", label: "Kickass" },
  { id: "bitsearch", label: "BitSearch" },
  { id: "torlock", label: "Torlock" },
  { id: "torrentfunk", label: "TorrentFunk" },
  { id: "glodls", label: "GloDLS" },
];

function prettySiteLabel(id: string): string {
  const m: Record<string, string> = {
    tgx: "TorrentGalaxy",
    yts: "YTS",
    piratebay: "The Pirate Bay",
    limetorrent: "LimeTorrents",
    nyaasi: "Nyaa",
  };
  return m[id] || id;
}

function posterSrc(row: CatalogItem): string | undefined {
  const p = row.poster;
  if (!p) return undefined;
  if (typeof p === "string") return p;
  return p.length > 0 && typeof p[0] === "string" ? p[0] : undefined;
}

function PosterOrFallback({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="poster-fallback">No poster</div>;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="poster-img"
      onError={() => setFailed(true)}
    />
  );
}

type Props = {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  onToast: (msg: string, kind?: "ok" | "err") => void;
  onAdded: () => void;
};

export function DiscoverMovies({ api, onToast, onAdded }: Props) {
  const [sites, setSites] = useState<SiteOpt[]>(FALLBACK_SITES);
  const [site, setSite] = useState("yts");
  const [browseMode, setBrowseMode] = useState<"trending" | "recent" | "find">("trending");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/browse/sites");
        if (cancelled || !r.ok) return;
        const j = (await r.json()) as { supported_sites?: string[] };
        const list = j.supported_sites;
        if (Array.isArray(list) && list.length > 0) {
          setSites(list.map((id) => ({ id, label: prettySiteLabel(id) })));
          setSite((s) => (list.includes(s) ? s : list[0]));
        }
      } catch {
        /* keep curated list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      if (browseMode === "find") {
        const q = query.trim();
        if (q.length < 2) {
          setItems([]);
          setBanner("Type at least 2 characters to search.");
          return;
        }
        let r = await api(
          `/browse/category?site=${encodeURIComponent(site)}&query=${encodeURIComponent(q)}&category=movies&limit=36`,
        );
        let j = (await r.json()) as { data?: CatalogItem[]; error?: string };
        if (!r.ok || j.error || !Array.isArray(j.data) || j.data.length === 0) {
          r = await api(`/search?q=${encodeURIComponent(q)}&site=${encodeURIComponent(site)}&limit=36`);
          j = (await r.json()) as { data?: CatalogItem[]; error?: string };
        }
        if (!r.ok) {
          setItems([]);
          setBanner(
            typeof j?.error === "string"
              ? j.error
              : `Search failed (${r.status}). Try another source.`,
          );
          return;
        }
        const rows = Array.isArray(j.data) ? j.data : [];
        setItems(rows);
        if (rows.length === 0) setBanner("No results for that title on this source.");
        return;
      }

      const path = browseMode === "trending" ? "/browse/trending" : "/browse/recent";
      let r = await api(
        `${path}?site=${encodeURIComponent(site)}&limit=36&category=${encodeURIComponent("movies")}`,
      );
      let j = (await r.json()) as { data?: CatalogItem[]; error?: string };
      if (!r.ok || j.error || !Array.isArray(j.data) || j.data.length === 0) {
        r = await api(`${path}?site=${encodeURIComponent(site)}&limit=36`);
        j = (await r.json()) as { data?: CatalogItem[]; error?: string };
      }
      if (!r.ok) {
        setItems([]);
        setBanner(
          typeof j?.error === "string"
            ? j.error
            : `Could not load this list (${r.status}). Try another source.`,
        );
        return;
      }
      const rows = Array.isArray(j.data) ? j.data : [];
      setItems(rows);
      if (rows.length === 0) setBanner("No items returned. Try “Recent” or another source.");
    } finally {
      setLoading(false);
    }
  }, [api, site, browseMode, query]);

  useEffect(() => {
    if (browseMode !== "find") void loadCatalog();
  }, [browseMode, site, loadCatalog]);

  useEffect(() => {
    if (browseMode !== "find") return;
    setItems([]);
    setBanner(
      query.trim().length < 2
        ? "Search across your chosen source (movies category when available, otherwise general search)."
        : null,
    );
    if (query.trim().length < 2) return;
    const t = window.setTimeout(() => void loadCatalog(), 500);
    return () => clearTimeout(t);
  }, [query, browseMode, loadCatalog]);

  async function addMagnet(magnet: string, key: string) {
    setAddingKey(key);
    try {
      const r = await api("/torrents/magnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magnet }),
      });
      if (!r.ok) {
        onToast(await r.text(), "err");
        return;
      }
      const j = (await r.json()) as { name?: string };
      onToast(`Added to downloads: ${j.name ?? "torrent"}`, "ok");
      onAdded();
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <section className="discover">
      <header className="discover-header">
        <div>
          <h2 className="discover-title">Discover movies</h2>
          <p className="discover-sub">
            Browse trending and new releases from the indexer you select, then add a download to PyTorrent.
            Only add content you are allowed to access.
          </p>
        </div>
        <div className="discover-controls">
          <label className="field-inline">
            <span className="field-label">Source</span>
            <select value={site} onChange={(e) => setSite(e.target.value)} className="select-lg">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={browseMode === "trending"}
          className={browseMode === "trending" ? "tab tab-active" : "tab"}
          onClick={() => setBrowseMode("trending")}
        >
          Trending
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browseMode === "recent"}
          className={browseMode === "recent" ? "tab tab-active" : "tab"}
          onClick={() => setBrowseMode("recent")}
        >
          Recent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browseMode === "find"}
          className={browseMode === "find" ? "tab tab-active" : "tab"}
          onClick={() => setBrowseMode("find")}
        >
          Search
        </button>
      </div>

      {browseMode === "find" && (
        <div className="search-bar">
          <input
            type="search"
            className="input-search"
            placeholder="Movie title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search movies"
          />
        </div>
      )}

      {banner && <p className="discover-banner">{banner}</p>}

      {loading && <p className="discover-loading">Loading…</p>}

      {!loading && items.length > 0 && (
        <div className="movie-grid">
          {items.map((row, i) => {
            const key = `${row.magnet ?? ""}-${i}`;
            const p = posterSrc(row);
            return (
              <article key={key} className="movie-card">
                <div className="movie-poster">
                  {p ? <PosterOrFallback src={p} /> : <div className="poster-fallback">No poster</div>}
                </div>
                <div className="movie-body">
                  <h3 className="movie-title" title={row.name}>
                    {row.name ?? "Untitled"}
                  </h3>
                  <p className="movie-meta">
                    {[row.size, row.seeders != null && row.seeders !== "" ? `${row.seeders} seeders` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {row.magnet ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={addingKey === key}
                      onClick={() => addMagnet(row.magnet!, key)}
                    >
                      {addingKey === key ? "Adding…" : "Add download"}
                    </button>
                  ) : (
                    <span className="muted">No magnet link</span>
                  )}
                  {row.url ? (
                    <a className="movie-link" href={row.url} target="_blank" rel="noreferrer">
                      Open page
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
