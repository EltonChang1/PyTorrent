import { useEffect } from "react";
import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";
import { PosterImage } from "./PosterImage";

type Props = {
  item: CatalogItem | null;
  onClose: () => void;
  onAddFull: (magnet: string) => Promise<void>;
  onAddStream: (magnet: string) => Promise<void>;
  adding: "full" | "stream" | null;
};

export function TitleDetailModal({ item, onClose, onAddFull, onAddStream, adding }: Props) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const p = posterSrc(item);
  const title = item.name ?? "Untitled";
  const showPoster = Boolean(p || item.imdb_code);

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal-panel">
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
            <p className="modal-hint">
              Adds to PyTorrent on this computer. Use <strong>Full download</strong> for the usual rarest-first
              download, or <strong>Watch while downloading</strong> to fetch pieces in order and play in the browser
              (best-effort; works best with MP4/WebM). Only use content you are allowed to access.
            </p>
            <div className="modal-actions modal-actions-split">
              {item.magnet ? (
                <>
                  <button
                    type="button"
                    className="btn-primary btn-lg"
                    disabled={adding !== null}
                    onClick={() => onAddFull(item.magnet!)}
                  >
                    {adding === "full" ? "Adding…" : "Full download"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-lg"
                    disabled={adding !== null}
                    onClick={() => onAddStream(item.magnet!)}
                  >
                    {adding === "stream" ? "Adding…" : "Watch while downloading"}
                  </button>
                </>
              ) : (
                <p className="muted">No magnet link for this listing.</p>
              )}
              {item.url ? (
                <a className="btn-secondary btn-lg" href={item.url} target="_blank" rel="noreferrer">
                  View source page
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
