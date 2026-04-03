const KEY = "pyt_last_catalog_title";
const EVT = "pyt-last-catalog-title";

export function setLastCatalogTitle(t: string | null | undefined): void {
  const s = (t ?? "").trim();
  if (s.length < 2) return;
  try {
    localStorage.setItem(KEY, s.slice(0, 200));
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}

export function getLastCatalogTitle(): string | null {
  try {
    const s = localStorage.getItem(KEY)?.trim();
    return s && s.length >= 2 ? s : null;
  } catch {
    return null;
  }
}

export function subscribeLastCatalogTitle(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
