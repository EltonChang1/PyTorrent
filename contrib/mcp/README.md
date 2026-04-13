# Torflix MCP (Model Context Protocol) integration notes

Use these shapes to expose **`torflixd`** to MCP clients or agent harnesses such as [claw-code](https://github.com/ultraworkers/claw-code). Torflix does not ship a bundled MCP server; run a thin adapter that forwards tool calls to the local HTTP API (default `http://127.0.0.1:8765`).

## Prerequisites

- **`torflixd`** running with catalog enabled (embedded Torrent-Api-py or `TORFLIX_SEARCH_API_BASE` / legacy `PYTORRENT_SEARCH_API_BASE`).
- For dev UI with Vite, prefix paths with `/api` when the MCP process talks through the proxy port.

## Suggested tools

### `torflix_health`

- **Description:** Check daemon and BitTorrent listener.
- **Method:** `GET /health`
- **Returns:** JSON with `status`, `bt_listen`, `search.configured`.

### `torflix_list_jobs`

- **Description:** List active torrent jobs and progress.
- **Method:** `GET /torrents`
- **Returns:** Array of `{ id, name, download_dir, total, downloaded, complete, error, sequential }`.

### `torflix_add_magnet`

- **Description:** Add a magnet link (full download or watch-while-downloading).
- **Method:** `POST /torrents/magnet`
- **Body:** `{ "magnet": "magnet:?xt=…", "sequential": false }` — set `sequential` to `true` for sequential piece order / browser streaming.
- **Returns:** `{ id, name, download_dir, sequential }`.

### `torflix_search_catalog`

- **Description:** Search the embedded or external catalog API.
- **Method:** `GET /search?q=…&site=yts&limit=30`
- **Returns:** Torrent-Api-py JSON (`data` array of listings).

### `torflix_browse_trending`

- **Description:** Browse trending row from the catalog API.
- **Method:** `GET /browse/trending?site=yts&limit=24`
- **Returns:** JSON with `data` array.

### `torflix_stream_url`

- **Description:** Return the URL for in-browser streaming (job must use `sequential: true` for best results).
- **Input:** `job_id` (info hash hex).
- **URL:** `GET /torrents/{job_id}/stream` (use absolute base `http://127.0.0.1:8765` or dev proxy).

### `torflix_poster_fallback`

- **Description:** Resolve a poster image from IMDb id when keys are set.
- **Method:** `GET /catalog/poster?imdb_code=tt1234567`
- **Requires:** `TMDB_API_KEY` and/or `OMDB_API_KEY` in the daemon environment.
- **Returns:** `{ "url": "https://…" }`.

### `torflix_catalog_movie`

- **Description:** Fetch one movie via JSON catalog API (details + torrents).
- **Method:** `GET /catalog/yts/movie?movie_id=12345`
- **Returns:** Same row shape as catalog items (`name`, `magnet`, `poster`, `imdb_code`, …).

## WebSocket progress (optional tool stream)

- **URL:** `ws://127.0.0.1:8765/ws` (or `ws://localhost:5173/ws` through Vite).
- **Behavior:** Server sends JSON messages `{ "type": "progress" | "complete" | "added" | "error", "data": … }`.
- An MCP adapter can subscribe and surface human-readable status to the agent.

## Example MCP tool schema (illustrative)

```json
{
  "name": "torflix_add_magnet",
  "description": "Add a BitTorrent magnet to the local Torflix daemon.",
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
