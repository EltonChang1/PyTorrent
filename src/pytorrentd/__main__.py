"""CLI entry: `torflixd`, `pytorrentd`, or `python -m pytorrentd`."""

from __future__ import annotations

import structlog
import uvicorn

from pytorrentd.app import create_app
from pytorrentd.torflix_env import tenv

log = structlog.get_logger()


def main() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    host = tenv("HOST") or "127.0.0.1"
    port = int(tenv("PORT") or "8765")
    log.info("starting", host=host, port=port)
    app = create_app()
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
