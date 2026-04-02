import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import { listLocalProgressEntries } from "../lib/watchProgress";

type ServerProg = {
  job_id: string;
  position_sec: number;
  duration_sec: number;
  title: string | null;
  updated_at: number;
};

function pct(p: number, d: number): number {
  if (!d || d <= 0) return 0;
  return Math.min(100, (100 * p) / d);
}

export function ResumePlaybackRow() {
  const { api, torrentRows, user } = useOutletContext<AppOutletContext>();
  const [serverItems, setServerItems] = useState<ServerProg[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setServerItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/user/watch/progress");
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { items?: ServerProg[] };
        if (!cancelled) setServerItems(Array.isArray(j.items) ? j.items : []);
      } catch {
        if (!cancelled) setServerItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user, tick]);

  const cards = useMemo(() => {
    const merged = new Map<string, { jobId: string; position: number; duration: number; title: string }>();

    for (const s of serverItems) {
      if (s.duration_sec <= 0 || s.position_sec >= s.duration_sec * 0.95 || s.position_sec < 3) continue;
      merged.set(s.job_id, {
        jobId: s.job_id,
        position: s.position_sec,
        duration: s.duration_sec,
        title: s.title || s.job_id.slice(0, 8),
      });
    }
    for (const loc of listLocalProgressEntries()) {
      if (loc.durationSec <= 0 || loc.positionSec >= loc.durationSec * 0.95 || loc.positionSec < 3) continue;
      if (!merged.has(loc.jobId)) {
        merged.set(loc.jobId, {
          jobId: loc.jobId,
          position: loc.positionSec,
          duration: loc.durationSec,
          title: loc.title || loc.jobId.slice(0, 8),
        });
      }
    }

    const out: { jobId: string; position: number; duration: number; title: string }[] = [];
    for (const m of merged.values()) {
      const job = torrentRows.find((t) => t.id === m.jobId && t.sequential);
      if (!job) continue;
      out.push({ ...m, title: job.name || m.title });
    }
    return out.slice(0, 12);
  }, [serverItems, torrentRows, tick]);

  if (cards.length === 0) return null;

  return (
    <section className="content-row" aria-labelledby="row-resume-playback">
      <h2 id="row-resume-playback" className="row-heading">
        Continue watching
      </h2>
      <p className="muted row-sub">Resume in-browser playback where you left off.</p>
      <div className="row-scroll row-scroll-cw">
        {cards.map((c) => {
          const p = pct(c.position, c.duration);
          return (
            <Link key={c.jobId} to={`/watch?id=${encodeURIComponent(c.jobId)}`} className="cw-card resume-play-card">
              <div className="cw-card-top">
                <span className="cw-card-title" title={c.title}>
                  {c.title}
                </span>
                <span className="cw-card-pct">{p.toFixed(0)}%</span>
              </div>
              <div className="cw-bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
                <div className="cw-bar-fill" style={{ width: `${p}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
