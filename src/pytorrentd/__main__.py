"""CLI entry: `python -m pytorrentd` or `pytorrentd`."""

from __future__ import annotations

import os

import structlog
import uvicorn

from pytorrentd.app import create_app

log = structlog.get_logger()


def main() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    host = os.environ.get("PYTORRENT_HOST", "127.0.0.1")
    port = int(os.environ.get("PYTORRENT_PORT", "8765"))
    log.info("starting", host=host, port=port)
    app = create_app()
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
