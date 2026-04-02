import { useCallback, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";

export function DownloadsPage() {
  const { api, showToast, refreshTorrents, torrentRows } = useOutletContext<AppOutletContext>();
  const [magnetField, setMagnetField] = useState("");

  const submitMagnet = useCallback(async () => {
    const m = magnetField.trim();
    if (!m) return;
    const r = await api("/torrents/magnet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnet: m }),
    });
    if (!r.ok) {
      showToast(await r.text(), "err");
      return;
    }
    const j = (await r.json()) as { name?: string };
    showToast(`Added: ${j.name ?? "torrent"}`, "ok");
    setMagnetField("");
    await refreshTorrents();
  }, [api, magnetField, showToast, refreshTorrents]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const r = await api("/torrents", { method: "POST", body: fd });
    if (!r.ok) {
      showToast(`Add failed: ${await r.text()}`, "err");
      return;
    }
    showToast(`Added torrent file`, "ok");
    await refreshTorrents();
    e.target.value = "";
  }

  return (
    <div className="page-downloads">
      <h1 className="page-title">My downloads</h1>

      <div className="downloads-toolbar">
        <label className="field-inline">
          <span className="field-label">Torrent file</span>
          <input type="file" accept=".torrent,application/x-bittorrent" onChange={onFile} />
        </label>
        <label className="field-inline grow">
          <span className="field-label">Magnet link</span>
          <input
            type="text"
            className="input-magnet"
            value={magnetField}
            onChange={(e) => setMagnetField(e.target.value)}
            placeholder="magnet:?xt=urn:btih:…"
          />
        </label>
        <button type="button" className="btn-primary" onClick={() => submitMagnet()}>
          Add magnet
        </button>
      </div>

      {torrentRows.length === 0 ? (
        <p className="muted empty-pad">No active downloads. Add a title from Home or Search.</p>
      ) : (
        <ul className="download-cards">
          {torrentRows.map((t) => {
            const pct = t.total ? Math.min(100, (100 * t.downloaded) / t.total) : 0;
            const status = t.error ? t.error : t.complete ? "Complete" : "Downloading";
            return (
              <li key={t.id} className="download-card">
                <div className="download-card-head">
                  <h2 className="download-card-title">{t.name}</h2>
                  <span className={`download-card-status ${t.error ? "err" : ""}`}>{status}</span>
                </div>
                <div className="cw-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="cw-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="download-card-meta muted">
                  {t.total ? `${pct.toFixed(1)}%` : "—"}
                  {typeof t.uploaded === "number" ? ` · ↑ ${(t.uploaded / 1_048_576).toFixed(2)} MiB` : ""}
                </div>
                <p className="download-card-path muted" title={t.download_dir}>
                  {t.download_dir}
                </p>
                <button
                  type="button"
                  className="btn-stop"
                  onClick={() => api(`/torrents/${t.id}/stop`, { method: "POST" }).then(refreshTorrents)}
                >
                  Stop
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
