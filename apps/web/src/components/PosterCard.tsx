import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";
import { PosterImage } from "./PosterImage";

type Props = {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  className?: string;
  /** 1–10 style badge for “Top 10” rows */
  rank?: number;
  inMyList?: boolean;
  onMyListToggle?: () => void;
};

export function PosterCard({
  item,
  onSelect,
  className = "",
  rank,
  inMyList,
  onMyListToggle,
}: Props) {
  const title = item.name ?? "Untitled";
  const hasAnyPoster = Boolean(posterSrc(item) || item.imdb_code);
  const showRank = rank != null && rank >= 1 && rank <= 10;

  return (
    <div className={`poster-card-wrap ${className}`.trim()}>
      {showRank ? <span className="poster-rank-badge">{rank}</span> : null}
      {onMyListToggle ? (
        <button
          type="button"
          className="poster-mylist-btn"
          aria-label={inMyList ? "Remove from My List" : "Add to My List"}
          aria-pressed={inMyList ?? false}
          onClick={(e) => {
            e.stopPropagation();
            onMyListToggle();
          }}
        >
          {inMyList ? "♥" : "♡"}
        </button>
      ) : null}
      <button
        type="button"
        className="poster-card"
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
          <div className="poster-card-shade" aria-hidden>
            <span className="material-symbols-outlined poster-card-play">play_arrow</span>
          </div>
        </div>
        <span className="poster-card-title">{title}</span>
      </button>
    </div>
  );
}
