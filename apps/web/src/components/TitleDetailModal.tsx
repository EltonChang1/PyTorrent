import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";
import { PosterImage } from "./PosterImage";
import { isInMyList, subscribeMyList, toggleMyList } from "../lib/myList";

type Props = {
  item: CatalogItem | null;
  onClose: () => void;
  onAddFull: (magnet: string) => Promise<void>;
  onAddStream: (magnet: string) => Promise<void>;
  adding: "full" | "stream" | null;
};

function optionLabel(t: NonNullable<CatalogItem["torrents"]>[number]): string {
  const parts = [t.quality, t.type, t.size].filter(Boolean);
  if (t.seeders) parts.push(`${t.seeders} seeds`);
  return parts.length ? parts.join(" · ") : "Torrent";
}

export function TitleDetailModal({ item, onClose, onAddFull, onAddStream, adding }: Props) {
  const [selectedMagnet, setSelectedMagnet] = useState("");
  const [, setListRev] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeMyList(() => setListRev((x) => x + 1)), []);

  const options = item?.torrents;
  const hasPicker = Boolean(options && options.length > 0);

  const effectiveMagnet = useMemo(() => {
    if (!item) return "";
    if (hasPicker && selectedMagnet) return selectedMagnet;
    return item.magnet ?? "";
  }, [item, hasPicker, selectedMagnet]);

  useEffect(() => {
    if (!item) {
      setSelectedMagnet("");
      return;
    }
    if (item.torrents?.length) {
      const preferred =
        item.torrents.find((t) => t.magnet === item.magnet)?.magnet ?? item.torrents[0]?.magnet ?? "";
      setSelectedMagnet(preferred);
    } else {
      setSelectedMagnet(item.magnet ?? "");
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const elts = [...focusables];
    const first = elts[0];
    const last = elts[elts.length - 1];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || elts.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, [item]);

  if (!item) return null;

  const p = posterSrc(item);
  const title = item.name ?? "Untitled";
  const showPoster = Boolean(p || item.imdb_code);
  const canAdd = Boolean(effectiveMagnet);
  const showPrimarySourceButton = Boolean(item.url && !hasPicker);
  const onList = isInMyList(item);

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal-panel" ref={panelRef}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-grid">
          <div className="modal-poster">
            {showPoster ? (
              <PosterImage
                key={item.magnet ?? item.url ?? title}
                item={item}
                imgClassName=""
                loading="eager"
                empty={<div className="modal-poster-ph">{title.slice(0, 2)}</div>}
              />
            ) : (
              <div className="modal-poster-ph">{title.slice(0, 2)}</div>
            )}
          </div>
          <div className="modal-body">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            <ul className="modal-meta">
              {item.size ? <li>{item.size}</li> : null}
              {item.seeders != null && item.seeders !== "" ? <li>{item.seeders} seeders</li> : null}
              {item.leechers != null && item.leechers !== "" ? <li>{item.leechers} leechers</li> : null}
              {item.category ? <li>{item.category}</li> : null}
            </ul>
            <div className="modal-toolbar">
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={onList}
                onClick={() => toggleMyList(item)}
              >
                {onList ? "♥ In My List" : "♡ Add to My List"}
              </button>
            </div>
            {hasPicker ? (
              <div className="modal-field">
                <label htmlFor="modal-quality" className="modal-label">
                  Quality / version
                </label>
                <select
                  id="modal-quality"
                  className="modal-select"
                  value={selectedMagnet}
                  onChange={(e) => setSelectedMagnet(e.target.value)}
                  disabled={adding !== null}
                >
                  {options!.map((t, i) => (
                    <option key={`${i}-${t.magnet.slice(0, 48)}`} value={t.magnet}>
                      {optionLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="modal-hint">
              Adds to PyTorrent on this computer. Use <strong>Full download</strong> for the usual rarest-first
              download, or <strong>Watch while downloading</strong> to fetch pieces in order and play in the browser
              (best-effort; works best with MP4/WebM). Only use content you are allowed to access.
            </p>
            <div className="modal-actions modal-actions-split">
              {canAdd ? (
                <>
                  <button
                    type="button"
                    className="btn-primary btn-lg"
                    disabled={adding !== null}
                    onClick={() => onAddFull(effectiveMagnet)}
                  >
                    {adding === "full" ? "Adding…" : "Full download"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-lg"
                    disabled={adding !== null}
                    onClick={() => onAddStream(effectiveMagnet)}
                  >
                    {adding === "stream" ? "Adding…" : "Watch while downloading"}
                  </button>
                </>
              ) : (
                <p className="muted">No magnet link for this listing.</p>
              )}
              {showPrimarySourceButton ? (
                <a className="btn-secondary btn-lg" href={item.url} target="_blank" rel="noreferrer">
                  View source page
                </a>
              ) : null}
            </div>
            {item.url && hasPicker ? (
              <p className="modal-source-foot muted">
                <a href={item.url} target="_blank" rel="noreferrer">
                  Open source site
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
