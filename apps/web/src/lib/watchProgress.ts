/** Local + optional server sync for in-browser watch position. */

const LS_KEY = (jobId: string) => `pyt_watch_${jobId}`;

export type WatchProgressRecord = {
  jobId: string;
  positionSec: number;
  durationSec: number;
  title?: string;
  updated: number;
};

export function loadLocalProgress(jobId: string): WatchProgressRecord | null {
  try {
    const raw = localStorage.getItem(LS_KEY(jobId));
    if (!raw) return null;
    const j = JSON.parse(raw) as WatchProgressRecord;
    if (!j || typeof j.positionSec !== "number") return null;
    return j;
  } catch {
    return null;
  }
}

export function saveLocalProgress(
  jobId: string,
  positionSec: number,
  durationSec: number,
  title?: string,
): void {
  try {
    const rec: WatchProgressRecord = {
      jobId,
      positionSec,
      durationSec,
      title,
      updated: Date.now(),
    };
    localStorage.setItem(LS_KEY(jobId), JSON.stringify(rec));
  } catch {
    /* quota */
  }
}

export function listLocalProgressEntries(): WatchProgressRecord[] {
  const out: WatchProgressRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("pyt_watch_")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const j = JSON.parse(raw) as WatchProgressRecord;
        if (j?.jobId && typeof j.positionSec === "number" && typeof j.durationSec === "number") {
          out.push(j);
        }
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updated - a.updated);
}
