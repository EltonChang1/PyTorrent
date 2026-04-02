# Packaging the daemon

Build a standalone `pytorrentd` binary for bundling inside the Tauri desktop app:

```bash
cd PyTorrent
pip install -e ".[dev]"
pyinstaller packaging/pytorrentd.spec
```

The artifact appears under `dist/pytorrentd` (directory mode) or `dist/pytorrentd.exe` on Windows.

Point the Tauri app at this binary and spawn it with `PYTORRENT_HOST=127.0.0.1` and a free port.

**Code signing:** macOS requires notarization for Gatekeeper; Windows uses Authenticode. Configure in your CI (e.g. `codesign`, `signtool`).
