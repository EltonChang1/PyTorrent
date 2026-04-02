import { useState } from "react";
import type { CatalogItem } from "../catalog/types";
import { posterSrc } from "../catalog/browse";

type Props = {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  className?: string;
};

export function PosterCard({ item, onSelect, className = "" }: Props) {
  const [imgBad, setImgBad] = useState(false);
  const p = posterSrc(item);
  const title = item.name ?? "Untitled";
  const showImg = Boolean(p) && !imgBad;

  return (
    <button
      type="button"
      className={`poster-card ${className}`.trim()}
      onClick={() => onSelect(item)}
      aria-label={`${title}, more info`}
    >
      <div className="poster-card-frame">
        {showImg ? (
          <img
            src={p!}
            alt=""
            className="poster-card-img"
            loading="lazy"
            onError={() => setImgBad(true)}
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
