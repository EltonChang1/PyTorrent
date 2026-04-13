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

function splitTitle(title: string): { line1: string; line2: string } {
  const parts = title.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { line1: title, line2: "" };
  }
  const mid = Math.max(1, Math.ceil(parts.length / 2));
  return {
    line1: parts.slice(0, mid).join(" "),
    line2: parts.slice(mid).join(" "),
  };
}

export function HeroBanner({ item, onMoreInfo, onAddFull, onAddStream, adding, canAdd }: Props) {
  if (!item) {
    return (
      <div className="hero hero-empty">
        <div className="hero-inner">
          <p className="hero-kicker">Browse · torrent · watch</p>
          <h1 className="hero-title">Torflix</h1>
          <p className="hero-tagline">
            Discover titles, queue downloads on this machine, and play in the browser—one self-hosted app, under your
            control.
          </p>
        </div>
      </div>
    );
  }

  const p = posterSrc(item);
  const title = item.name ?? "Featured";
  const { line1, line2 } = splitTitle(title);
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
        <p className="hero-kicker">Featured title</p>
        <h1 className="hero-title">
          {line1}
          {line2 ? (
            <>
              <br />
              <span className="hero-title-italic">{line2}</span>
            </>
          ) : null}
        </h1>
        <div className="hero-actions">
          {canAdd ? (
            <>
              <button
                type="button"
                className="btn-hero btn-hero-primary"
                disabled={adding !== null}
                onClick={onAddFull}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden
                >
                  download
                </span>
                {adding === "full" ? "Adding…" : "Full download"}
              </button>
              <button
                type="button"
                className="btn-hero btn-hero-secondary"
                disabled={adding !== null}
                onClick={onAddStream}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden
                >
                  play_arrow
                </span>
                {adding === "stream" ? "Adding…" : "Watch while downloading"}
              </button>
            </>
          ) : null}
          <button type="button" className="btn-hero btn-hero-tertiary" onClick={onMoreInfo}>
            <span className="material-symbols-outlined" aria-hidden>
              info
            </span>
            More info
          </button>
        </div>
      </div>
    </div>
  );
}
