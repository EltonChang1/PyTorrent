import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";
import { PosterImage } from "./PosterImage";

type Props = {
  item: CatalogItem | null;
  onMoreInfo: () => void;
  onAddFull: () => void;
  onAddStream: () => void;
  adding: "full" | "stream" | null;
  canAdd: boolean;
};

export function HeroBanner({ item, onMoreInfo, onAddFull, onAddStream, adding, canAdd }: Props) {
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
  const showBackdrop = Boolean(p || item.imdb_code);

  return (
    <div className="hero">
      {showBackdrop ? (
        <>
          <PosterImage
            key={item.magnet ?? item.url ?? item.name ?? "hero"}
            item={item}
            imgClassName="hero-backdrop"
            loading="eager"
            empty={<div className="hero-gradient hero-gradient-solid" />}
          />
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
            <>
              <button
                type="button"
                className="btn-hero btn-hero-primary"
                disabled={adding !== null}
                onClick={onAddFull}
              >
                {adding === "full" ? "Adding…" : "Full download"}
              </button>
              <button
                type="button"
                className="btn-hero btn-hero-secondary"
                disabled={adding !== null}
                onClick={onAddStream}
              >
                {adding === "stream" ? "Adding…" : "Watch while downloading"}
              </button>
            </>
          ) : null}
          <button type="button" className="btn-hero btn-hero-tertiary" onClick={onMoreInfo}>
            More info
          </button>
        </div>
      </div>
    </div>
  );
}
