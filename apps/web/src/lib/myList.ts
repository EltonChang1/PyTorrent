import type { CatalogItem } from "../catalog/types";

const LS_KEY = "pyt_my_list";
const EVT = "pyt-mylist-changed";
const MAX = 80;

function stableId(item: CatalogItem): string {
  if (item.url) return `url:${item.url}`;
  if (item.magnet) return `mag:${item.magnet.slice(0, 120)}`;
  return `name:${(item.name ?? "").toLowerCase()}`;
}

export function emitMyListChanged(): void {
  window.dispatchEvent(new Event(EVT));
}

export function getMyList(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CatalogItem[];
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function setMyListAll(items: CatalogItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX)));
    emitMyListChanged();
  } catch {
    /* ignore */
  }
}

export function isInMyList(item: CatalogItem): boolean {
  const id = stableId(item);
  return getMyList().some((x) => stableId(x) === id);
}

export function toggleMyList(item: CatalogItem): boolean {
  const id = stableId(item);
  const cur = getMyList();
  const idx = cur.findIndex((x) => stableId(x) === id);
  if (idx >= 0) {
    cur.splice(idx, 1);
    setMyListAll(cur);
    return false;
  }
  cur.unshift(item);
  setMyListAll(cur);
  return true;
}

export function subscribeMyList(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}
