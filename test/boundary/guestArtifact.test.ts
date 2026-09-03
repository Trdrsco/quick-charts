// The WebView guest artifact (public-chart-library-boundary-plan.md PCL-6: "Prove the chart can be
// bundled into a network-denied local WebView guest without importing any first-party app, session,
// service URL, or trading code ... Make that guest build deterministic and self-contained: preserve its
// relative asset structure, prohibit runtime remote imports, emit a version/build manifest").
//
// scripts/build-guest.mjs writes dist/guest; this fixture reads it back. It lives in the boundary
// folder because, like its neighbours, it names the shapes it hunts. The artifact blocks are vacuous
// until a build has run, the shape the other dist fixtures use. The determinism block builds twice
// more into scratch directories through the script's `--out` and compares byte for byte, so it needs
// no earlier build and is never vacuous.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { CHART_DIR, packedFileList } from './scan'

const guestDir = `${CHART_DIR}/dist/guest`
const built = existsSync(`${guestDir}/build-manifest.json`)

interface BuildManifest {
  version: string
  entry: string
  files: Record<string, string>
}

/** The hash of a text file, over its UTF-8 bytes: every guest file is text, so hashing the decoded
 *  text re-encoded is hashing the bytes, and the build manifest hashes the same bytes. */
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
const read = (name: string): string => readFileSync(`${guestDir}/${name}`, 'utf8')

/** Every way a page or a bundle could reach past its own files at runtime. */
const REMOTE: readonly { name: string; pattern: RegExp }[] = [
  { name: 'a remote script or stylesheet', pattern: /(src|href)=["'](https?:)?\/\// },
  { name: 'a protocol-relative or absolute URL import', pattern: /import\s*\(\s*["'`](https?:)?\/\// },
  { name: 'a stylesheet import', pattern: /@import\b/ },
  { name: 'a worker or script load', pattern: /importScripts\s*\(|new\s+Worker\s*\(/ },
  { name: 'a network request', pattern: /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/ },
]

/** Every first-party, session, service or trading shape the guest must not carry. */
const FIRST_PARTY: readonly { name: string; pattern: RegExp }[] = [
  { name: 'a trdrs host or domain', pattern: /trdrs\.co\b|trdrsco[\w-]*\.fly\.dev|localhost:8080/ },
  { name: 'a service route', pattern: /["'`]\/api\// },
  { name: 'a credential or session', pattern: /trdrs_sk_|Authorization|Set-Cookie|document\.cookie|engine_session|trdrs_session/ },
  { name: 'a private package', pattern: /@trdrs\// },
  { name: 'an engine client', pattern: /\bengineApi\b|\bmarketStream\b|engine-client|engine-wire|chart-engine/ },
  { name: 'trading code', pattern: /\bplaceOrder\b|\bcancelOrder\b|\bflatten\b|order-ticket|account-manager|chart-trading|\bBrokerAdapter\b|\bTradingAdapter\b/ },
  { name: 'browser storage', pattern: /\b(localStorage|sessionStorage|indexedDB)\b/ },
]

describe('the guest build is wired and kept out of the tarball', () => {
  it('runs after the theme generator on every build, and can be run alone', () => {
    expect(manifest.scripts['build:guest']).toBe('node scripts/build-guest.mjs')
    expect(manifest.scripts.postbuild.endsWith('&& node scripts/build-guest.mjs')).toBe(true)
  })

  it('is excluded from the files npm packs', () => {
    expect(manifest.files).toContain('!dist/guest')
    if (!built) return
    expect(packedFileList().filter((p) => p.startsWith('dist/guest/'))).toEqual([])
  })
})

describe('the built guest', () => {
  it('carries the page, its stylesheet, the package stylesheet, the bundle and the manifest, and nothing else', () => {
    if (!built) return
    expect(readdirSync(guestDir).sort()).toEqual(['build-manifest.json', 'guest.css', 'index.html', 'quickcharts-guest.js', 'quickcharts.css'])
  })

  it('names the package version, the entry page, and the hash of every sibling file', () => {
    if (!built) return
    const record = JSON.parse(read('build-manifest.json')) as BuildManifest
    expect(record.version).toBe(manifest.version)
    expect(record.entry).toBe('index.html')
    expect(Object.keys(record.files).sort()).toEqual(['guest.css', 'index.html', 'quickcharts-guest.js', 'quickcharts.css'])
    for (const [name, hash] of Object.entries(record.files)) expect(sha256(readFileSync(`${guestDir}/${name}`, 'utf8')), name).toBe(hash)
    expect(JSON.stringify(record)).not.toMatch(/builtAt|timestamp|date/i)
  })

  it('links only sibling files by relative path, and forbids every other origin through its policy', () => {
    if (!built) return
    const html = read('index.html')
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
    expect(refs.sort()).toEqual(['./guest.css', './quickcharts-guest.js', './quickcharts.css'])
    for (const ref of refs) expect(existsSync(`${guestDir}/${ref.slice(2)}`), ref).toBe(true)
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(html).not.toMatch(/<style|<script[^>]*>[^<]/)
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })

  it('makes no runtime request and imports nothing remote', () => {
    if (!built) return
    for (const name of ['index.html', 'quickcharts-guest.js', 'quickcharts.css', 'guest.css']) {
      const text = read(name)
      for (const { name: shape, pattern } of REMOTE) expect(pattern.test(text), `${name}: ${shape}`).toBe(false)
      expect(/^\s*(import|export)\s.*from\s*["'][^./]/m.test(text), `${name}: a bare import`).toBe(false)
    }
    expect(read('quickcharts.css')).toBe(readFileSync(`${CHART_DIR}/dist/quickcharts.css`, 'utf8'))
  })

  it('carries no first-party app, session, service URL or trading code', () => {
    if (!built) return
    const bundle = read('quickcharts-guest.js')
    for (const { name, pattern } of FIRST_PARTY) {
      const line = bundle.split('\n').find((l) => pattern.test(l))
      expect(line, `${name}: ${line?.trim().slice(0, 120)}`).toBeUndefined()
    }
    expect(bundle).toContain('quickchartsGuest')
    expect(bundle).toContain(JSON.stringify(manifest.version))
  })
})

describe('the guest build is deterministic', () => {
  it('builds the same bytes twice', { timeout: 120_000 }, () => {
    const a = mkdtempSync(join(tmpdir(), 'qc-guest-a-'))
    const b = mkdtempSync(join(tmpdir(), 'qc-guest-b-'))
    try {
      for (const out of [a, b]) execFileSync(process.execPath, ['scripts/build-guest.mjs', `--out=${out}`], { cwd: CHART_DIR, stdio: 'pipe' })
      const names = readdirSync(a).sort()
      expect(names).toEqual(readdirSync(b).sort())
      expect(names).toContain('quickcharts-guest.js')
      for (const name of names) expect(sha256(readFileSync(join(a, name), 'utf8')), name).toBe(sha256(readFileSync(join(b, name), 'utf8')))
      const first = JSON.parse(readFileSync(join(a, 'build-manifest.json'), 'utf8')) as BuildManifest
      const second = JSON.parse(readFileSync(join(b, 'build-manifest.json'), 'utf8')) as BuildManifest
      expect(first).toEqual(second)
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })
})
