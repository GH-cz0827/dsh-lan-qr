/**
 * dsh-lan-qr — host half.
 *
 * Answers one question for the browser half: "what URL should the phone open to
 * reach this harness, and what does its QR look like?"
 *
 * Sources, in order:
 *   1. $DSH_LAN_QR_STATE_FILE, or `~/.dsh/desktop-lan-url.txt`, whose newest
 *      non-empty line is the pairing URL the dsh desktop host writes on start;
 *   2. otherwise the LAN addresses of this machine combined with the port the
 *      browser is actually talking to (`req.headers.host`), reported as
 *      `candidates` and used for the QR when nothing was written yet.
 *
 * Read-only, stateless, no timers: nothing here writes to disk except its own
 * diagnostic log (in the OS temp directory, overridable with $DSH_LAN_QR_LOG).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = readManifest()
const STATE_FILE =
  process.env.DSH_LAN_QR_STATE_FILE || path.join(os.homedir(), '.dsh', 'desktop-lan-url.txt')
const QR_LIB = path.join(PACKAGE_ROOT, 'assets', 'qrcode.js')
const LOG = process.env.DSH_LAN_QR_LOG || path.join(os.tmpdir(), 'dsh-lan-qr.log')

// Artwork: $DSH_LAN_QR_ICON wins, otherwise the glyph shipped in this package.
// No machine-specific paths — the packaged asset is the same drawing, so a local
// copy would only make the package machine-dependent.
const ICON_CANDIDATES = [
  process.env.DSH_LAN_QR_ICON || '',
  path.join(PACKAGE_ROOT, 'assets', 'icon.svg'),
  path.join(PACKAGE_ROOT, 'assets', 'icon.png'),
  path.join(PACKAGE_ROOT, 'assets', 'icon.webp'),
].filter(Boolean)

const ICON_MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  } catch {
    return { name: 'dsh-lan-qr', version: '0.0.0' }
  }
}

function log(msg) {
  try {
    fs.appendFileSync(LOG, '[' + new Date().toISOString() + '] ' + msg + '\n')
  } catch {
    /* logging must never break the host */
  }
}

let iconCache = { file: '', mtime: 0, bytes: null }

function pickIcon() {
  for (const candidate of ICON_CANDIDATES) {
    try {
      const stat = fs.statSync(candidate)
      if (stat.isFile() && stat.size > 0) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return ''
}

function readIcon() {
  const file = pickIcon()
  if (!file) return null
  try {
    const stat = fs.statSync(file)
    if (iconCache.file !== file || iconCache.mtime !== stat.mtimeMs || !iconCache.bytes) {
      iconCache = { file, mtime: stat.mtimeMs, bytes: fs.readFileSync(file) }
      log('icon loaded: ' + file + ' (' + iconCache.bytes.length + ' bytes)')
    }
    return { file, bytes: iconCache.bytes }
  } catch (error) {
    log('icon read failed: ' + String(error?.message ?? error))
    return null
  }
}

/** Newest pairing URL written by the desktop host, or ''. */
export function currentPairUrl() {
  try {
    const lines = fs
      .readFileSync(STATE_FILE, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.length === 0 ? '' : lines[lines.length - 1]
  } catch {
    return ''
  }
}

/** `http://<lan-ip>:<port>` for every non-internal IPv4 interface, real NICs first. */
export function lanCandidates(port) {
  const urls = []
  const virtual = /vEthernet|WSL|Hyper-V|Loopback|Radmin|Tailscale|ZeroTier|VMware|VirtualBox|TAP|WireGuard|Docker/iu
  try {
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family !== 'IPv4' || address.internal) continue
        urls.push({
          address: address.address,
          interface: name,
          // A VPN / hypervisor adapter is reachable from this PC but usually not from the
          // phone on the same Wi-Fi, so it must never be the first candidate.
          virtual: virtual.test(name),
          url: `http://${address.address}:${port}`,
        })
      }
    }
  } catch (error) {
    log('networkInterfaces failed: ' + String(error?.message ?? error))
  }
  return urls.sort((a, b) => Number(a.virtual) - Number(b.virtual))
}

function portOf(req) {
  const host = String(req?.headers?.host ?? '')
  const match = /:(\d+)$/u.exec(host)
  return match ? match[1] : '49500'
}

let qrFactory = null

function loadQrLib() {
  if (qrFactory) return qrFactory
  const source = fs.readFileSync(QR_LIB, 'utf8')
  const mod = { exports: {} }
  // the vendored file is a plain browser script that assigns `module.exports`
  new Function('module', 'exports', source)(mod, mod.exports)
  if (typeof mod.exports !== 'function') throw new Error('qrcode library did not export a factory')
  qrFactory = mod.exports
  return qrFactory
}

/** QR for `url` as a standalone SVG string (white background, black modules). */
export function qrSvg(url) {
  if (!url) return ''
  try {
    const qrcode = loadQrLib()
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    const cell = 8
    const quiet = 4
    const size = (count + quiet * 2) * cell
    let rects = ''
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!qr.isDark(row, col)) continue
        rects +=
          '<rect x="' + (col + quiet) * cell + '" y="' + (row + quiet) * cell +
          '" width="' + cell + '" height="' + cell + '"/>'
      }
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
      '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
      '<g fill="#000000">' + rects + '</g></svg>'
    )
  } catch (error) {
    log('qr render failed: ' + String(error?.message ?? error))
    return ''
  }
}

/** The origin the page that asked for the QR is actually loaded from, when it is not loopback. */
function originFromHost(req) {
  const host = String(req?.headers?.host ?? '').trim()
  if (!host) return ''
  if (/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/iu.test(host)) return ''
  return `http://${host}`
}

/**
 * Add this launch's token to a plain origin. The token lives only in memory and changes on
 * every start, so a URL written to disk is a fallback, never the answer: asking Connection
 * keeps the QR valid even when the address was discovered a moment ago.
 */
function withFreshToken(connection, baseUrl) {
  const base = String(baseUrl ?? '').trim()
  if (!base) return ''
  const clean = base.split('?')[0].replace(/\/+$/u, '')
  if (!clean) return ''
  try {
    if (connection && typeof connection.authenticatedUrl === 'function') {
      return connection.authenticatedUrl(clean + '/')
    }
  } catch (error) {
    log('authenticatedUrl failed: ' + String(error?.message ?? error))
  }
  return base
}

/** Keep a URL's query (its token) but take host/port from `origin`. */
function retarget(url, origin) {
  try {
    const target = new URL(url)
    const base = new URL(origin)
    target.protocol = base.protocol
    target.hostname = base.hostname
    target.port = base.port
    return target.toString()
  } catch {
    return url
  }
}

function statePayload(connection, req) {
  const fromFile = currentPairUrl()
  const candidates = lanCandidates(portOf(req))
  // Order matters: the address this page is open on > a live interface > whatever was
  // written at launch. A stale IP from a different network must never win.
  const address = originFromHost(req) || candidates[0]?.url || fromFile
  const live = withFreshToken(connection, address)
  const liveHasToken = /[?&]token=/u.test(live)
  // No connection service: keep the launch token from the file, but re-point it at the
  // address this page is actually on, so a changed IP does not produce a dead QR.
  const fromFileHasToken = /[?&]token=/u.test(fromFile)
  const url = liveHasToken
    ? live
    : fromFileHasToken
      ? retarget(fromFile, address)
      : live
  const hasToken = /[?&]token=/u.test(url)
  return {
    url,
    svg: qrSvg(url),
    hasUrl: url.length > 0,
    // The phone pairs with the token; without one the QR is useless, so say so explicitly.
    hasToken,
    source: originFromHost(req) ? 'request-host' : candidates.length > 0 ? 'lan-interface' : fromFile ? 'state-file' : 'none',
    stateFile: STATE_FILE,
    candidates: candidates.map((candidate) => candidate.url),
    package: MANIFEST.name,
    version: MANIFEST.version,
  }
}

function stateHandler(connection, req, res) {
  try {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.end(JSON.stringify(statePayload(connection, req)))
  } catch (error) {
    log('state handler error: ' + String(error?.message ?? error))
    try {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'state failed', url: '', svg: '', hasUrl: false, candidates: [] }))
    } catch {
      /* response already gone */
    }
  }
}

function iconHandler(_req, res) {
  try {
    const hit = readIcon()
    if (!hit) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('icon not found; tried:\n' + ICON_CANDIDATES.join('\n'))
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', ICON_MIME[path.extname(hit.file).toLowerCase()] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('Content-Length', String(hit.bytes.length))
    res.end(hit.bytes)
  } catch (error) {
    log('icon handler error: ' + String(error?.message ?? error))
    try {
      res.statusCode = 500
      res.end('icon handler error')
    } catch {
      /* response already gone */
    }
  }
}

const disposers = []
/** True while this generation's routes are registered; cleared when they are torn down. */
let live = false

/**
 * Register one route through `ctx.effect`, so the fiber that mounted this plugin
 * owns the registration and disposes it on unload / hot reload. A bare
 * `web.register()` leaks the exact route: the next module generation then fails
 * with `duplicate exact route` until the host restarts.
 */
function own(ctx, web, route) {
  const mount = () => {
    const dispose = web.register({ kind: 'exact', path: route.path, handler: route.handler })
    log('route registered: ' + route.path + ' -> ' + (currentPairUrl() ? 'url present' : 'url missing'))
    return () => {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        /* already gone */
      }
      log('route disposed: ' + route.path)
    }
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(mount)
    return
  }
  try {
    disposers.push(web.register({ kind: 'exact', path: route.path, handler: route.handler }))
    log('route registered (no ctx.effect): ' + route.path)
  } catch (error) {
    log('route register failed for ' + route.path + ': ' + String(error?.message ?? error))
  }
}

function registerRoutes(ctx, connection) {
  if (live) return
  const web = ctx?.webServer ?? (typeof ctx?.get === 'function' ? ctx.get('webServer') : undefined)
  if (!web || typeof web.register !== 'function') {
    log('webServer unavailable; /lan-qr/state not registered')
    return
  }
  const routes = [
    { path: '/lan-qr/state', handler: (req, res) => stateHandler(connection, req, res) },
    { path: '/lan-qr/state.json', handler: (req, res) => stateHandler(connection, req, res) },
    { path: '/lan-qr/icon.svg', handler: iconHandler },
    { path: '/lan-qr/icon', handler: iconHandler },
  ]
  live = true
  try {
    for (const route of routes) own(ctx, web, route)
  } catch (error) {
    log('route registration aborted: ' + String(error?.message ?? error))
  }
  // Release the guard with the registrations themselves, so a remount of the same
  // module instance (not just a fresh generation) can register again.
  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => () => {
      live = false
      log('routes released')
    })
  }
}

/** Diagnostics: which icon file the button will use. */
export function iconPath() {
  return pickIcon()
}

// Only `webServer` is declared, so the plugin always mounts. `connection` mints the token;
// apply() asks for it separately, never blocks registration on it, and falls back to the URL
// written at launch (re-pointed at the current address) when it never arrives.
export const inject = ['webServer']

export function apply(root) {
  log('apply() called; stateFile=' + STATE_FILE)

  const serviceOf = (ctx, name) => {
    try {
      return ctx?.[name] ?? (typeof ctx?.get === 'function' ? ctx.get(name) : undefined)
    } catch {
      return undefined
    }
  }

  // `connection` is passed to the routes by value: no context surgery, so `ctx.effect`
  // keeps running on the real context object.
  const start = (connection) => {
    const service = connection ?? serviceOf(root, 'connection')
    try {
      registerRoutes(root, service)
    } catch (error) {
      log('registerRoutes failed: ' + String(error?.message ?? error))
    }
  }

  // Hard requirement. If the service is not on this context yet, wait for it once.
  if (!serviceOf(root, 'webServer')) {
    if (typeof root?.inject === 'function') {
      try {
        root.inject(['webServer'], (child) => start(serviceOf(child, 'connection')))
        return
      } catch (error) {
        log('inject([webServer]) failed: ' + String(error?.message ?? error))
      }
    }
    log('webServer unavailable; nothing to register')
    return
  }

  // Token source. This never blocks the routes: the timer registers them regardless.
  if (serviceOf(root, 'connection')) {
    start(serviceOf(root, 'connection'))
    return
  }
  if (typeof root?.inject === 'function') {
    try {
      root.inject(['connection'], (child) => start(serviceOf(child, 'connection')))
    } catch (error) {
      log('inject([connection]) failed: ' + String(error?.message ?? error))
    }
  }
  const timer = setTimeout(() => {
    log('connection did not arrive; falling back to the launch URL file')
    start(undefined)
  }, 1000)
  if (typeof timer?.unref === 'function') timer.unref()
}
export function dispose() {
  while (disposers.length) {
    const dispose = disposers.pop()
    try {
      if (typeof dispose === 'function') dispose()
    } catch {
      /* already disposed */
    }
  }
  live = false
}
