import type { CSSProperties } from "react";
import type { CatalogItem } from "../catalog/types";
import { PosterCard } from "./PosterCard";

type Props = {
  title: string;
  rowKey: string;
  items: CatalogItem[];
  loading?: boolean;
  error?: string;
  onSelect: (item: CatalogItem) => void;
  onRetry?: () => void;
  /** Row index for entrance stagger (skipped when reduced motion handled via CSS) */
  staggerIndex?: number;
  showTop10Rank?: boolean;
  myListEnabled?: boolean;
  isInMyList?: (item: CatalogItem) => boolean;
  onMyListToggle?: (item: CatalogItem) => void;
};

export function ContentRow({
  title,
  rowKey,
  items,
  loading,
  error,
  onSelect,
  onRetry,
  staggerIndex = 0,
  showTop10Rank,
  myListEnabled,
  isInMyList,
  onMyListToggle,
}: Props) {
  const headingId = `row-${rowKey}`;
  const staggerStyle: CSSProperties = {
    "--stagger": `${Math.min(staggerIndex, 24) * 0.04}s`,
  };

  if (error && !items.length) {
    return (
      <section
        className="content-row content-row-stagger"
        style={staggerStyle}
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="row-heading">
          {title}
        </h2>
        <p className="row-error muted">{error}</p>
        {onRetry ? (
          <button type="button" className="btn-secondary row-retry" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </section>
    );
  }

  if (!loading && items.length === 0) return null;

  return (
    <section
      className="content-row content-row-stagger"
      style={staggerStyle}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="row-heading">
        {title}
      </h2>
      <div className="row-scroll no-scrollbar">
        {loading && items.length === 0
          ? Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="poster-card-wrap" aria-hidden>
                <div className="poster-card poster-card-skeleton">
                  <div className="poster-card-frame skeleton-pulse" aria-hidden />
                </div>
              </div>
            ))
          : items.map((item, i) => (
              <PosterCard
                key={`${rowKey}-${i}`}
                item={item}
                onSelect={onSelect}
                rank={showTop10Rank && i < 10 ? i + 1 : undefined}
                inMyList={myListEnabled && isInMyList ? isInMyList(item) : undefined}
                onMyListToggle={myListEnabled && onMyListToggle ? () => onMyListToggle(item) : undefined}
              />
            ))}
      </div>
    </section>
  );
}
