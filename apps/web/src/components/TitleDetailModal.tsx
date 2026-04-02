import { useEffect } from "react";
import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";

type Props = {
  item: CatalogItem | null;
  onClose: () => void;
  onAdd: (magnet: string) => Promise<void>;
  adding: boolean;
};

export function TitleDetailModal({ item, onClose, onAdd, adding }: Props) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const p = posterSrc(item);
  const title = item.name ?? "Untitled";

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal-panel">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-grid">
          <div className="modal-poster">
            {p ? <img src={p} alt="" /> : <div className="modal-poster-ph">{title.slice(0, 2)}</div>}
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
              Adds to PyTorrent on this computer. Open the file in your video player when the download
              finishes. Only use content you are allowed to access.
            </p>
            <div className="modal-actions">
              {item.magnet ? (
                <button
                  type="button"
                  className="btn-primary btn-lg"
                  disabled={adding}
                  onClick={() => onAdd(item.magnet!)}
                >
                  {adding ? "Adding…" : "Add to downloads"}
                </button>
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
