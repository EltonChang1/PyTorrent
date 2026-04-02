# PyTorrent MCP (Model Context Protocol) integration notes

Use these shapes to expose `pytorrentd` to MCP clients or agent harnesses such as [claw-code](https://github.com/ultraworkers/claw-code). PyTorrent does not ship a bundled MCP server; run a thin adapter that forwards tool calls to the local HTTP API (default `http://127.0.0.1:8765`).

## Prerequisites

- `pytorrentd` running with catalog enabled (embedded Torrent-Api-py or `PYTORRENT_SEARCH_API_BASE`).
- For dev UI with Vite, prefix paths with `/api` when the MCP process talks through the proxy port.

## Suggested tools

### `pytorrent_health`

- **Description:** Check daemon and BitTorrent listener.
- **Method:** `GET /health`
- **Returns:** JSON with `status`, `bt_listen`, `search.configured`.

### `pytorrent_list_jobs`

- **Description:** List active torrent jobs and progress.
- **Method:** `GET /torrents`
- **Returns:** Array of `{ id, name, download_dir, total, downloaded, complete, error, sequential }`.

### `pytorrent_add_magnet`

- **Description:** Add a magnet link (full download or watch-while-downloading).
- **Method:** `POST /torrents/magnet`
- **Body:** `{ "magnet": "magnet:?xt=…", "sequential": false }` — set `sequential` to `true` for sequential piece order / browser streaming.
- **Returns:** `{ id, name, download_dir, sequential }`.

### `pytorrent_search_catalog`

- **Description:** Search the embedded or external catalog API.
- **Method:** `GET /search?q=…&site=yts&limit=30`
- **Returns:** Torrent-Api-py JSON (`data` array of listings).

### `pytorrent_browse_trending`

- **Description:** Browse trending row (e.g. YTS).
- **Method:** `GET /browse/trending?site=yts&limit=24`
- **Returns:** JSON with `data` array.

### `pytorrent_stream_url`

- **Description:** Return the URL for in-browser streaming (job must use `sequential: true` for best results).
- **Input:** `job_id` (info hash hex).
- **URL:** `GET /torrents/{job_id}/stream` (use absolute base `http://127.0.0.1:8765` or dev proxy).

### `pytorrent_poster_fallback`

- **Description:** Resolve a poster image from IMDb id when keys are set.
- **Method:** `GET /catalog/poster?imdb_code=tt1234567`
- **Requires:** `TMDB_API_KEY` and/or `OMDB_API_KEY` in the daemon environment.
- **Returns:** `{ "url": "https://…" }`.

### `pytorrent_yts_movie`

- **Description:** Fetch one YTS movie via JSON API v2 (details + torrents).
- **Method:** `GET /catalog/yts/movie?movie_id=12345`
- **Returns:** Same row shape as catalog items (`name`, `magnet`, `poster`, `imdb_code`, …).

## WebSocket progress (optional tool stream)

- **URL:** `ws://127.0.0.1:8765/ws` (or `ws://localhost:5173/ws` through Vite).
- **Behavior:** Server sends JSON messages `{ "type": "progress" | "complete" | "added" | "error", "data": … }`.
- An MCP adapter can subscribe and surface human-readable status to the agent.

## Example MCP tool schema (illustrative)

```json
{
  "name": "pytorrent_add_magnet",
  "description": "Add a BitTorrent magnet to the local PyTorrent daemon.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "magnet": { "type": "string" },
      "sequential": { "type": "boolean", "description": "Prefer sequential download for watch-while-downloading" }
    },
    "required": ["magnet"]
  }
}
```

Wire `inputSchema` to your MCP server’s handler that performs `POST /torrents/magnet` with the same JSON body.
