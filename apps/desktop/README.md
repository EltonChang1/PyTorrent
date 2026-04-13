# Torflix desktop shell

This folder is a placeholder for a **Tauri** (or Electron) wrapper.

## Generate Tauri (recommended)

From `apps/desktop`:

```bash
npm create tauri-app@latest .
```

Choose the existing `../web` as the frontend (Vite + React) and set **dev URL** to `http://localhost:5173` and **dist** to `../web/dist`.

## Run with local daemon

1. Start the Python daemon: **`torflixd`** (from repo root after `pip install -e .`; **`pytorrentd`** is an alias).
2. `cd apps/web && npm run dev` for UI, or load the built `dist/` inside Tauri.

Bundling **`torflixd`** with PyInstaller is described in [`../../packaging/README.md`](../../packaging/README.md). The desktop shell can spawn that binary on startup.
