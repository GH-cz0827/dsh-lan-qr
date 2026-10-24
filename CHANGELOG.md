# Changelog

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
