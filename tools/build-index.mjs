#!/usr/bin/env node
/**
 * Generate `index.json` — a plugin market index in **format 1** — for this
 * package, so the repository can be added directly in dsh:
 *   Plugins → Discover → Index sources → <raw URL of index.json>
 *
 * Usage:
 *   node tools/build-index.mjs --repo https://github.com/OWNER/dsh-lan-qr
 *   node tools/build-index.mjs --repo ... --commit <40-hex-sha> --category remote
 *
 * Without --commit the script reads `git rev-parse HEAD` (or $GITHUB_SHA in CI),
 * because a format-1 `git` source must be pinned to an exact commit.
 *
 * The document is validated with @deepseek-ai/dsh-plugin-market-index when that
 * package is resolvable (it ships with dsh); otherwise a structural check of the
 * same rules runs so a broken index is never written.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))

/** Index-level category catalogue: only ids declared here may be used below. */
const CATEGORIES = {
  ui: { title: { en: 'UI Enhancements', zh: 'UI 增强' } },
  remote: { title: { en: 'Remote & Mobile', zh: '远程与移动端' } },
  dev: { title: { en: 'Development & Runtime', zh: '开发与运行时' } },
  tools: { title: { en: 'Tools & Capabilities', zh: '工具与能力' } },
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function gitHead() {
  if (process.env.GITHUB_SHA && /^[0-9a-f]{40}$/u.test(process.env.GITHUB_SHA)) return process.env.GITHUB_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PACKAGE_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function repositoryUrl() {
  const explicit = arg('repo', '')
  if (explicit) return explicit.replace(/^git\+/u, '').replace(/\.git$/u, '')
  const declared = typeof MANIFEST.repository === 'string' ? MANIFEST.repository : MANIFEST.repository?.url ?? ''
  return declared.replace(/^git\+/u, '').replace(/\.git$/u, '')
}

const repoUrl = repositoryUrl()
const commit = arg('commit', gitHead())
const category = arg('category', 'remote')

if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/u.test(repoUrl)) {
  console.error('build-index: --repo must look like https://github.com/OWNER/REPO (got ' + JSON.stringify(repoUrl) + ')')
  process.exit(2)
}
if (!/^[0-9a-f]{40}$/u.test(commit)) {
  console.error('build-index: need a 40-hex commit — pass --commit <sha> or run inside a git checkout')
  process.exit(2)
}
if (!Object.hasOwn(CATEGORIES, category)) {
  console.error('build-index: unknown --category ' + JSON.stringify(category))
  process.exit(2)
}

const index = {
  format: 1,
  title: { en: 'DSH Phone Pairing', zh: 'DSH 手机配对' },
  description: {
    en: 'Pair a phone with a DeepSeek Harness instance by scanning its LAN address.',
    zh: '扫码连接：把 DeepSeek Harness 的局域网地址变成手机可扫的二维码。',
  },
  metadata: { categories: CATEGORIES },
  plugins: [
    {
      name: MANIFEST.name,
      title: { en: 'LAN Pairing QR', zh: '扫码局域网连接' },
      description: {
        en: MANIFEST.description,
        zh: '在窗口菜单行加一个二维码按钮，显示当前局域网地址，手机扫码即可配对连接。',
      },
      icon: 'assets/icon.svg',
      homepage: MANIFEST.homepage,
      repository: { url: repoUrl },
      metadata: { category, keywords: MANIFEST.keywords ?? [] },
      versions: [
        {
          version: MANIFEST.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'git', url: repoUrl, commit },
          engines: { dsh: MANIFEST.engines?.dsh ?? '>=0.2.0-rc.1 <0.3.0-0' },
        },
      ],
    },
  ],
}

async function validate(document) {
  const candidates = [
    '@deepseek-ai/dsh-plugin-market-index',
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js'),
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const specifier = candidate.startsWith('@') ? candidate : pathToFileURL(candidate).href
      const { parseMarketIndex } = await import(specifier)
      // The relative icon resolves against the index URL, so validate from the
      // location the index will actually be served from.
      const indexUrl = `https://raw.githubusercontent.com/${new URL(repoUrl).pathname.replace(/^\//u, '')}/${commit}/index.json`
      parseMarketIndex(document, indexUrl)
      return 'validated with @deepseek-ai/dsh-plugin-market-index'
    } catch (error) {
      if (error && error.name === 'MarketIndexError') throw error
      // resolution failure for this candidate: try the next one
    }
  }
  // Structural fallback mirroring the format-1 rules that matter most.
  if (document.format !== 1) throw new Error('$.format must be 1')
  for (const [position, plugin] of document.plugins.entries()) {
    if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(plugin.name)) {
      throw new Error(`$.plugins[${position}].name must be an npm package name`)
    }
    if (!plugin.versions?.length) throw new Error(`$.plugins[${position}].versions must not be empty`)
    for (const version of plugin.versions) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version.version)) throw new Error('version must be exact SemVer')
      if (!Number.isInteger(version.publishTimestamp)) throw new Error('publishTimestamp must be integer seconds')
      if (version.source?.type === 'git' && !/^[0-9a-f]{40}$/u.test(version.source.commit)) {
        throw new Error('git source.commit must be a 40-hex SHA')
      }
    }
    if (plugin.metadata?.category && !Object.hasOwn(document.metadata.categories, plugin.metadata.category)) {
      throw new Error(`category ${plugin.metadata.category} is not declared in metadata.categories`)
    }
  }
  return 'validated structurally (market-index package not resolvable here)'
}

const note = await validate(index)
const out = arg('out', path.join(PACKAGE_ROOT, 'index.json'))
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log(`index written: ${out} (${note})`)
