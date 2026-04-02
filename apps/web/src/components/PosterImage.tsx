import { useCallback, useEffect, useState } from "react";
import type { CatalogItem } from "../catalog/types";
import { posterUrlsList } from "../catalog/browse";

const API_PREFIX = import.meta.env.DEV ? "/api" : "";

type Props = {
  item: Pick<CatalogItem, "poster" | "imdb_code" | "name">;
  imgClassName: string;
  /** When every URL fails and optional /catalog/poster returns nothing */
  empty: React.ReactNode;
  alt?: string;
  loading?: "eager" | "lazy";
};

export function PosterImage({ item, imgClassName, empty, alt = "", loading = "lazy" }: Props) {
  const baseUrls = posterUrlsList(item as CatalogItem);
  const [idx, setIdx] = useState(0);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [catalogTried, setCatalogTried] = useState(false);
  const [dead, setDead] = useState(false);

  const tryCatalog = useCallback(() => {
    const imdb = item.imdb_code?.trim();
    if (!imdb) {
      setDead(true);
      return;
    }
    if (catalogTried) {
      setDead(true);
      return;
    }
    setCatalogTried(true);
    fetch(`${API_PREFIX}/catalog/poster?imdb_code=${encodeURIComponent(imdb)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { url?: string }) => {
        if (typeof j?.url === "string" && j.url.startsWith("http")) {
          setRemoteUrl(j.url);
        } else {
          setDead(true);
        }
      })
      .catch(() => setDead(true));
  }, [item.imdb_code, catalogTried]);

  useEffect(() => {
    if (baseUrls.length > 0) return;
    const imdb = item.imdb_code?.trim();
    if (!imdb || catalogTried) return;
    tryCatalog();
  }, [baseUrls.length, item.imdb_code, catalogTried, tryCatalog]);

  const src = remoteUrl ?? baseUrls[idx] ?? null;

  const onError = useCallback(() => {
    if (remoteUrl) {
      setDead(true);
      return;
    }
    if (idx + 1 < baseUrls.length) {
      setIdx((i) => i + 1);
      return;
    }
    tryCatalog();
  }, [baseUrls.length, idx, remoteUrl, tryCatalog]);

  if (dead) {
    return <>{empty}</>;
  }

  if (!src) {
    return <>{empty}</>;
  }

  return (
    <img
      key={`${src}-${idx}`}
      src={src}
      alt={alt}
      className={imgClassName}
      loading={loading}
      onError={onError}
    />
  );
}
