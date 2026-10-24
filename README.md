# dsh-lan-qr

[中文](README.zh.md) | English

A DeepSeek Harness (dsh) bundle that adds a **pairing QR button** to the Web UI's
window-menu row. Click it and a small card shows the LAN address of this harness
as a scannable QR — pair a phone without typing an IP.

It pairs naturally with [dsh-refresh-button](https://github.com/GH-cz0827/dsh-refresh-button):
the QR control sits immediately right of the 「编辑」/`Edit` control, in the same row
as the refresh button, and degrades gracefully when that bundle is absent.

## What you get

- A 24px icon button in the menu row; the glyph inverts on dark themes.
- A card anchored under the button (no modal backdrop — Electron draws the window
  controls outside the DOM, so a dimmed backdrop looks broken).
- A 240px QR rendered on the host as SVG, plus the URL in copyable text and a
  copy button.
- `Esc`, an outside click, or the close button dismisses it.

Where the URL comes from:

1. `$DSH_LAN_QR_STATE_FILE`, or `~/.dsh/desktop-lan-url.txt` — the newest
   non-empty line, which the dsh desktop host writes on every start (the real
   pairing URL, including any relay/tunnel hostname);
2. otherwise the host's own IPv4 LAN interfaces combined with the port the
   browser is using — reported as `candidates` and shown in the card, so a
   fresh install still tells you something useful.

## Install

```bash
dsh plugin install dsh-lan-qr
# or straight from GitHub
dsh plugin install github:GH-cz0827/dsh-lan-qr
```

In the app: **Plugins → Add** with the repository URL, or dshmarket /
plugin-manager. A local checkout installs with `plugin_manager install_bundle`
(target: the package directory). Restart dsh once after installing.

## Release assets

Each GitHub Release carries two files:

| Asset | What it is |
|---|---|
| `dsh-lan-qr-<version>.tgz` | The dsh bundle (npm-pack layout, what plugin_manager / dshmarket install). |
| `DSHLan-debug.apk` | The Android client (`android/DSHLan-debug.apk`, debug build) that scans this QR and pairs over the LAN. |

The APK lives in the repository only so the release workflow can attach it; it is
not part of the npm artifact (`files` in `package.json` does not list `android/`).

## Host routes

| Route | Purpose |
|---|---|
| `GET /lan-qr/state` | `{ url, svg, hasUrl, source, stateFile, candidates, package, version }` |
| `GET /lan-qr/state.json` | Same JSON. |
| `GET /lan-qr/icon.svg` | Button artwork (override with `$DSH_LAN_QR_ICON`). |
| `GET /lan-qr/icon` | Same bytes, no extension. |

All handlers are read-only and set `Cache-Control: no-store`.

## Configuration

| Variable | Effect |
|---|---|
| `DSH_LAN_QR_STATE_FILE` | Read the pairing URL from another file. |
| `DSH_LAN_QR_ICON` | Absolute path to your own glyph (SVG/PNG/WebP). |
| `DSH_LAN_QR_LOG` | Log path; defaults to `<tmp>/dsh-lan-qr.log`. |

## Package layout

```
dsh-lan-qr/
├── package.json              # dsh.bundle.patch + dsh.client (platform: web)
├── cordis.patch.yml          # inserts the `lan-qr` loader row
├── lib/index.js              # host half: /lan-qr/state + QR SVG + icon
├── lib/client.js             # browser half: button + card
├── assets/qrcode.js          # vendored qrcode-generator 1.4.4 (MIT)
├── assets/icon.svg           # original artwork (MIT)
├── locale/{en,zh}.json       # meta.title / meta.description
├── THIRD-PARTY-NOTICES.md
└── tools/build-index.mjs     # generates index.json (market index, format 1)
```

## Security notes

The QR only encodes an address; it carries no token. Anyone who can already
reach the harness over the LAN can open that URL, so keep the harness behind
your own auth/network controls — the plugin adds no new exposure beyond the
routes listed above, which serve public data (URL, QR, icon).

## Publishing checklist

1. `GH-cz0827` is already wired into `package.json`, `README.md`, `README.zh.md`.
2. `npm publish`.
3. Tag a release — `.github/workflows/release.yml` packs the tarball and attaches
   it to the GitHub Release (dshmarket's preferred prebuilt install path).
4. `node tools/build-index.mjs --repo https://github.com/GH-cz0827/dsh-lan-qr --category remote`
   and commit `index.json`; add it in dsh under **Plugins → Discover → Index sources**.
5. Optional: PR to [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## License

MIT. Vendored `assets/qrcode.js` is MIT (Kazuhiko Arase) — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
