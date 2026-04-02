import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";
import { PosterImage } from "./PosterImage";

type Props = {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  className?: string;
};

export function PosterCard({ item, onSelect, className = "" }: Props) {
  const title = item.name ?? "Untitled";
  const hasAnyPoster = Boolean(posterSrc(item) || item.imdb_code);

  return (
    <button
      type="button"
      className={`poster-card ${className}`.trim()}
      onClick={() => onSelect(item)}
      aria-label={`${title}, more info`}
    >
      <div className="poster-card-frame">
        {hasAnyPoster ? (
          <PosterImage
            item={item}
            imgClassName="poster-card-img"
            loading="lazy"
            empty={
              <div className="poster-card-ph" aria-hidden>
                <span className="poster-card-ph-text">{title.slice(0, 2).toUpperCase()}</span>
              </div>
            }
          />
        ) : (
          <div className="poster-card-ph" aria-hidden>
            <span className="poster-card-ph-text">{title.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <div className="poster-card-shade" />
      </div>
      <span className="poster-card-title">{title}</span>
    </button>
  );
}
