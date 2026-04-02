import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";

type Props = {
  item: CatalogItem | null;
  onMoreInfo: () => void;
  onAdd: () => void;
  adding: boolean;
  canAdd: boolean;
};

export function HeroBanner({ item, onMoreInfo, onAdd, adding, canAdd }: Props) {
  if (!item) {
    return (
      <div className="hero hero-empty">
        <div className="hero-inner">
          <h1 className="hero-title">PyTorrent</h1>
          <p className="hero-tagline">Browse catalogs and queue downloads locally.</p>
        </div>
      </div>
    );
  }

  const p = posterSrc(item);
  const title = item.name ?? "Featured";

  return (
    <div className="hero">
      {p ? (
        <>
          <img src={p} alt="" className="hero-backdrop" />
          <div className="hero-gradient" />
        </>
      ) : (
        <div className="hero-gradient hero-gradient-solid" />
      )}
      <div className="hero-inner">
        <p className="hero-kicker">Featured</p>
        <h1 className="hero-title">{title}</h1>
        <div className="hero-actions">
          {canAdd ? (
            <button type="button" className="btn-hero btn-hero-primary" disabled={adding} onClick={onAdd}>
              {adding ? "Adding…" : "Add to downloads"}
            </button>
          ) : null}
          <button type="button" className="btn-hero btn-hero-secondary" onClick={onMoreInfo}>
            More info
          </button>
        </div>
      </div>
    </div>
  );
}
