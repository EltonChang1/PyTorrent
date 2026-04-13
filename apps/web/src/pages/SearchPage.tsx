import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import type { CatalogItem } from "../catalog/types";
import { TitleDetailModal } from "../components/TitleDetailModal";
import { saveJobCatalogSnapshot } from "../lib/jobMeta";
import { setLastCatalogTitle } from "../lib/lastCatalogTitle";

/** URL uses neutral id; daemon search API still expects `site=yts` for this source. */
function siteParamForApi(site: string): string {
  if (!site) return "";
  return site === "movies" ? "yts" : site;
}

/** Legacy bookmarks used `site=yts`; normalize for UI state. */
function siteParamFromUrl(site: string): string {
  return site === "yts" ? "movies" : site;
}

const SITE_PRESETS = [
  { id: "", label: "All sites (aggregated)" },
  { id: "movies", label: "Movies" },
  { id: "1337x", label: "1337x" },
  { id: "tgx", label: "TorrentGalaxy" },
  { id: "piratebay", label: "The Pirate Bay" },
  { id: "limetorrent", label: "LimeTorrents" },
  { id: "kickass", label: "Kickass" },
];

export function SearchPage() {
  const { api, showToast, refreshTorrents, searchConfigured } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qParam = (params.get("q") ?? "").trim();
  const siteParam = params.get("site") ?? "";

  const [localQ, setLocalQ] = useState(qParam);
  const [site, setSite] = useState(siteParam);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState<"full" | "stream" | null>(null);

  useEffect(() => {
    if (siteParam !== "yts") return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("site", "movies");
        return next;
      },
      { replace: true },
    );
  }, [siteParam, setParams]);

  useEffect(() => {
    setLocalQ(qParam);
    setSite(siteParamFromUrl(siteParam));
  }, [qParam, siteParam]);

  useEffect(() => {
    if (!searchConfigured) return;
    if (qParam.length < 2) {
      setItems([]);
      setBanner(qParam.length === 0 ? null : "Enter at least 2 characters.");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setBanner(null);
      try {
        const apiSite = siteParamForApi(siteParamFromUrl(siteParam));
        const siteQ = apiSite ? `&site=${encodeURIComponent(apiSite)}` : "";
        const r = await api(`/search?q=${encodeURIComponent(qParam)}&limit=60${siteQ}`);
        const j = (await r.json()) as { data?: CatalogItem[]; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setItems([]);
          setBanner(typeof j?.error === "string" ? j.error : `Search failed (${r.status})`);
          return;
        }
        const rows = Array.isArray(j.data) ? j.data : [];
        setItems(rows);
        if (rows.length === 0) setBanner("No results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qParam, siteParam, searchConfigured, api]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next = new URLSearchParams();
      const q = localQ.trim();
      if (q) next.set("q", q);
      if (site) next.set("site", site);
      setParams(next);
    },
    [localQ, site, setParams],
  );

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

  if (!searchConfigured) {
    return (
      <div className="page-narrow empty-state">
        <p className="muted">
          Search in Torflix requires the catalog API. Run <code>torflixd</code> (embedded API) or set{" "}
          <code>TORFLIX_SEARCH_API_BASE</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="page-search">
      <h1 className="page-title">Search</h1>
      <form className="search-form" onSubmit={submit}>
        <input
          type="search"
          className="input-search input-search-wide"
          placeholder="Titles, keywords…"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
          aria-label="Search query"
        />
        <select
          className="select-lg"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          aria-label="Source"
        >
          {SITE_PRESETS.map((s) => (
            <option key={s.id || "all"} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {banner && <p className="discover-banner">{banner}</p>}

      {items.length > 0 && (
        <div className="search-grid">
          {items.map((item, i) => {
            const key = `${item.magnet ?? item.name}-${i}`;
            return (
              <button
                key={key}
                type="button"
                className="search-grid-card"
                onClick={() => setSelected(item)}
              >
                <span className="search-grid-title">{item.name ?? "Untitled"}</span>
                <span className="search-grid-meta muted">
                  {[item.size, item.seeders ? `${item.seeders} S` : ""].filter(Boolean).join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
