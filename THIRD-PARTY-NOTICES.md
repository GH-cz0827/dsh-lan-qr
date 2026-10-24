# Third-party notices

## assets/qrcode.js

- **qrcode-generator** 1.4.4 — <https://github.com/kazuhikoarase/qrcode-generator>
- Copyright (c) 2009 Kazuhiko Arase
- License: MIT — <http://www.opensource.org/licenses/mit-license.php>

The file is vendored unmodified (its original copyright and MIT header are kept
at the top) so the host half can render QR SVGs without any runtime dependency.
Its MIT terms are compatible with this package's MIT license; the original
notice above satisfies the attribution requirement.

## assets/icon.svg

A generic "QR code / scan" glyph chosen by the maintainer for the toolbar button
and the plugin list. It is not derived from `qrcode-generator`. If you fork this
repository, replace it with artwork whose license you can vouch for, or point
`$DSH_LAN_QR_ICON` at your own file — the button reads the asset, not any
third-party source.
