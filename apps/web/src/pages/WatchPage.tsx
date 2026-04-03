import { useCallback, useEffect, useRef } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import { setLastCatalogTitle } from "../lib/lastCatalogTitle";
import { loadLocalProgress, saveLocalProgress } from "../lib/watchProgress";

const API_PREFIX = import.meta.env.DEV ? "/api" : "";
const VOL_KEY = "pyt_watch_volume";

export function WatchPage() {
  const { torrentRows, user, api } = useOutletContext<AppOutletContext>();
  const [params] = useSearchParams();
  const id = params.get("id");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastFlushRef = useRef(0);

  const src = id ? `${API_PREFIX}/torrents/${encodeURIComponent(id)}/stream` : "";

  const job = id ? torrentRows.find((t) => t.id === id) : undefined;

  useEffect(() => {
    if (job?.name) setLastCatalogTitle(job.name);
  }, [job?.name]);

  const flushProgress = useCallback(() => {
    const el = videoRef.current;
    if (!el || !id) return;
    const t = el.currentTime;
    const d = el.duration;
    if (!d || !Number.isFinite(d) || d <= 0) return;
    saveLocalProgress(id, t, d, job?.name);
    lastFlushRef.current = Date.now();
    if (user) {
      void api("/user/watch/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: id,
          position_sec: t,
          duration_sec: d,
          title: job?.name ?? null,
        }),
      });
    }
  }, [api, id, job?.name, user]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      const raw = localStorage.getItem(VOL_KEY);
      if (raw != null) {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) el.volume = Math.min(1, Math.max(0, n));
      }
    } catch {
      /* ignore */
    }
    const onVol = () => {
      try {
        localStorage.setItem(VOL_KEY, String(el.volume));
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("volumechange", onVol);
    return () => el.removeEventListener("volumechange", onVol);
  }, [id, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || !id) return;
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        el.load();
      }, 2500);
    };
    el.addEventListener("stalled", bump);
    el.addEventListener("waiting", bump);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("stalled", bump);
      el.removeEventListener("waiting", bump);
    };
  }, [src, id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !id) return;
    const saved = loadLocalProgress(id);
    const onMeta = () => {
      if (saved && saved.durationSec > 0 && saved.positionSec > 3 && saved.positionSec < saved.durationSec - 3) {
        el.currentTime = saved.positionSec;
      }
      el.removeEventListener("loadedmetadata", onMeta);
    };
    el.addEventListener("loadedmetadata", onMeta);
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [id, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      if (Date.now() - lastFlushRef.current < 6000) return;
      flushProgress();
    };
    el.addEventListener("timeupdate", onTime);
    const onPause = () => flushProgress();
    el.addEventListener("pause", onPause);
    const onVis = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushProgress, id]);

  useEffect(() => {
    const onUnload = () => flushProgress();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [flushProgress]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Node | null;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        el.currentTime = Math.max(0, el.currentTime - 10);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const d = el.duration;
        const step = 10;
        if (d && Number.isFinite(d) && d > 0) el.currentTime = Math.min(d, el.currentTime + step);
        else el.currentTime += step;
        return;
      }
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        el.muted = !el.muted;
        return;
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (!document.fullscreenElement) void el.requestFullscreen();
        else void document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, src]);

  if (!id) {
    return (
      <div className="page-watch page-narrow">
        <h1 className="page-title">Watch</h1>
        <p className="muted">Missing job id. Open this page from a title you started as &quot;Watch while downloading&quot;.</p>
        <Link to="/downloads" className="nf-link">
          My downloads
        </Link>
      </div>
    );
  }

  return (
    <div className="page-watch">
      <h1 className="page-title">{job?.name ?? "Watch while downloading"}</h1>
      <p className="muted watch-hint">
        The daemon downloads pieces from the start of the file first. If the player stops, wait a few seconds and press
        play again so the browser can fetch newly available bytes. Some containers (e.g. MKV) may not play in the
        browser—use a desktop player on the saved file if needed. Playback position is saved automatically so you can
        resume later from Home. Keyboard: Space play/pause, ← → seek 10s, M mute, F fullscreen. Volume is remembered on
        this device.
      </p>
      <video
        key={src}
        ref={videoRef}
        src={src}
        controls
        playsInline
        className="watch-video"
        preload="auto"
      />
      <p className="muted watch-meta">
        {job && !job.complete ? (
          <>
            Buffered progress (whole torrent):{" "}
            {job.total ? `${Math.min(100, (100 * job.downloaded) / job.total).toFixed(1)}%` : "—"}
          </>
        ) : null}
      </p>
      <div className="watch-actions">
        <Link to="/downloads" className="btn-secondary btn-lg">
          My downloads
        </Link>
        <Link to="/" className="btn-secondary btn-lg">
          Home
        </Link>
      </div>
    </div>
  );
}
