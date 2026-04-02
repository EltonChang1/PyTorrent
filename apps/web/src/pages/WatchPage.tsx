import { useEffect, useRef } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";

const API_PREFIX = import.meta.env.DEV ? "/api" : "";

export function WatchPage() {
  const { torrentRows } = useOutletContext<AppOutletContext>();
  const [params] = useSearchParams();
  const id = params.get("id");
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = id ? `${API_PREFIX}/torrents/${encodeURIComponent(id)}/stream` : "";

  const job = id ? torrentRows.find((t) => t.id === id) : undefined;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
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
  }, [src]);

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
        browser—use a desktop player on the saved file if needed.
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
