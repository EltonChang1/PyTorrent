import type { CatalogItem } from "../catalog/types";

const KEY = (jobId: string) => `pyt_job_${jobId}`;

/** Minimal catalog snapshot for Continue watching thumbnails. */
export type JobCatalogSnapshot = Pick<CatalogItem, "name" | "poster" | "imdb_code" | "url">;

export function saveJobCatalogSnapshot(jobId: string, item: CatalogItem | null | undefined): void {
  if (!item || !jobId) return;
  try {
    const snap: JobCatalogSnapshot = {
      name: item.name,
      poster: item.poster,
      imdb_code: item.imdb_code,
      url: item.url,
    };
    localStorage.setItem(KEY(jobId), JSON.stringify(snap));
  } catch {
    /* quota */
  }
}

export function loadJobCatalogSnapshot(jobId: string): JobCatalogSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY(jobId));
    if (!raw) return null;
    const j = JSON.parse(raw) as JobCatalogSnapshot;
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

export function catalogItemFromSnapshot(snap: JobCatalogSnapshot): CatalogItem {
  return {
    name: snap.name,
    poster: snap.poster,
    imdb_code: snap.imdb_code,
    url: snap.url,
  };
}
