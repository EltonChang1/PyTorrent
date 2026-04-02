import { Link } from "react-router-dom";
import type { TorrentJob } from "../appOutletContext";

type Props = {
  jobs: TorrentJob[];
};

export function ContinueWatchingRow({ jobs }: Props) {
  const cont = jobs
    .filter((j) => !j.complete && j.total > 0 && j.downloaded < j.total)
    .sort((a, b) => b.downloaded / b.total - a.downloaded / a.total);

  if (cont.length === 0) return null;

  return (
    <section className="content-row" aria-labelledby="row-continue">
      <h2 id="row-continue" className="row-heading">
        Continue downloading
      </h2>
      <div className="row-scroll row-scroll-cw">
        {cont.map((j) => {
          const pct = Math.min(100, (100 * j.downloaded) / j.total);
          return (
            <Link key={j.id} to="/downloads" className="cw-card">
              <div className="cw-card-top">
                <span className="cw-card-title" title={j.name}>
                  {j.name}
                </span>
                <span className="cw-card-pct">{pct.toFixed(0)}%</span>
              </div>
              <div className="cw-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="cw-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
