# Changelog

## 1.0.2 — 2026-10-24

- Host: dropped the absolute `C:\Users\...` icon candidate. The button now reads
  `$DSH_LAN_QR_ICON` or the glyph shipped in `assets/icon.svg`, so the package is
  machine-independent again.
- Docs: the English README and the manifest description now say **desktop app**
  instead of "Web UI", matching what the plugin actually needs (the desktop
  host's pairing file and the live `connection` token).
- Docs: the icon's provenance note no longer claims it was drawn for this
  package.

## 1.0.1 — 2026-10-24

Live-token and stale-address fixes.

- Host: the QR now asks the `connection` service for `authenticatedUrl()`, so it
  carries **this launch's** token instead of the token written to the pairing
  file at startup; the service is resolved without blocking registration (a 1s
  fallback keeps the launch URL when `connection` never arrives).
- Host: the address now prefers the origin the page is actually open on
  (`source: 'request-host'`), then a live interface, then the file, and a
  file-sourced token is re-pointed at the current origin — a changed IP no
  longer yields a dead QR. The payload reports `hasToken`.
- Client: the glyph is also inlined as a data URI, so the button still renders
  before the host route exists.
- Package icon replaced with the shipped QR glyph (`assets/icon.svg`).
- Releases now also attach the Android client: `android/DSHLan-debug.apk` is
  uploaded beside the tarball by `release.yml`.

## 1.0.0 — 2026-10-24

First distributable release.

- Packaged as a standard dsh bundle: `dsh.bundle.patch` + `dsh.client`
  (`platform: web`), installable through `dsh plugin install`, plugin_manager
  and dshmarket.
- Added `locale/en.json`, `locale/zh.json`, a package-root `icon`, and an
  original MIT icon; artwork now resolves from the package, with
  `$DSH_LAN_QR_ICON` as the override. No machine-specific paths remain.
- Host half: declares `inject: ['webServer']` and owns every route through
  `ctx.effect` (a hot reload disposes them rather than leaking
  `duplicate exact route`), logs to `<tmp>`, honours
  `$DSH_LAN_QR_STATE_FILE`, and falls back to the machine's IPv4 LAN addresses
  plus the browsing port when no pairing file exists yet.
- Client half: bilingual card text, dialogs show inferred LAN candidates, icon
  URL cache-busted, and the host payload now reports `package` / `version`.
- Vendored `qrcode-generator` 1.4.4 is documented in
  `THIRD-PARTY-NOTICES.md` (MIT, Kazuhiko Arase).
