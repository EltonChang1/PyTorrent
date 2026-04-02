import type { CatalogItem } from "../catalog/types";
import { PosterCard } from "./PosterCard";

type Props = {
  title: string;
  rowKey: string;
  items: CatalogItem[];
  loading?: boolean;
  error?: string;
  onSelect: (item: CatalogItem) => void;
};

export function ContentRow({ title, rowKey, items, loading, error, onSelect }: Props) {
  if (error && !items.length) {
    return (
      <section className="content-row" aria-labelledby={`row-${title.replace(/\s/g, "-")}`}>
        <h2 id={`row-${title.replace(/\s/g, "-")}`} className="row-heading">
          {title}
        </h2>
        <p className="row-error muted">{error}</p>
      </section>
    );
  }

  if (!loading && items.length === 0) return null;

  return (
    <section className="content-row" aria-labelledby={`row-${title.replace(/\s/g, "-")}`}>
      <h2 id={`row-${title.replace(/\s/g, "-")}`} className="row-heading">
        {title}
      </h2>
      <div className="row-scroll">
        {loading && items.length === 0
          ? Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="poster-card poster-card-skeleton" aria-hidden>
                <div className="poster-card-frame skeleton-pulse" />
              </div>
            ))
          : items.map((item, i) => (
              <PosterCard key={`${rowKey}-${i}`} item={item} onSelect={onSelect} />
            ))}
      </div>
    </section>
  );
}
