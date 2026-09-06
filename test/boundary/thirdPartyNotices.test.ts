// The third-party notices: THIRD-PARTY-NOTICES.md, held to the dependency closure it is rendered
// from and to the attribution the renderer's license asks for.
//
// scripts/build-third-party-notices.mjs renders the document from the installed packages; this
// fixture runs the same script in its `--check` and `--stdout` modes and compares the committed file
// with the rendering, so a peer bump that changes a license, a copyright line or the closure fails
// here until the document is regenerated. It never reads node_modules itself: the script is the one
// reader, and the test proves what the script wrote.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { CHART_DIR, packedFileList, packedText } from './scan'

const script = `${CHART_DIR}/scripts/build-third-party-notices.mjs`
const run = (...args: string[]): string => execFileSync(process.execPath, [script, ...args], { cwd: CHART_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const lf = (text: string): string => text.replace(/\r\n/g, '\n')

const committed = lf(readFileSync(`${CHART_DIR}/THIRD-PARTY-NOTICES.md`, 'utf8'))

describe('the notices generator is wired', () => {
  it('runs on every build, and can be run alone', () => {
    expect(manifest.scripts['build:notices']).toBe('node scripts/build-third-party-notices.mjs')
    expect(manifest.scripts.postbuild).toContain('&& node scripts/build-third-party-notices.mjs')
  })

  it('packs the document beside the bundle', () => {
    expect(manifest.files).toContain('THIRD-PARTY-NOTICES.md')
    expect(packedFileList()).toContain('THIRD-PARTY-NOTICES.md')
    expect(packedText('THIRD-PARTY-NOTICES.md')).not.toBeNull()
  })
})

describe('the committed document', () => {
  it('equals the rendering from the installed packages', () => {
    expect(committed).toBe(lf(run('--stdout')))
    expect(() => run('--check')).not.toThrow()
  })

  it('covers the peer the manifest names and every package that peer installs, and nothing of ours', () => {
    const sections = [...committed.matchAll(/^## (\S+) (\S+)$/gm)].map((m) => `${m[1]}@${m[2]}`)
    for (const peer of Object.keys(manifest.peerDependencies)) expect(sections.some((s) => s.startsWith(`${peer}@`)), peer).toBe(true)
    expect(sections.some((s) => s.startsWith('fancy-canvas@')), 'the renderer peer installs fancy-canvas').toBe(true)
    expect(sections.filter((s) => s.startsWith('@trdrs/') || s.startsWith('quickcharts@'))).toEqual([])
    // One table row per section, so the inventory and the detail cannot disagree.
    const rows = [...committed.matchAll(/^\| `([^`]+)` \| (\S+) \| /gm)].map((m) => `${m[1]}@${m[2]}`)
    expect(rows.sort()).toEqual([...sections].sort())
  })

  it('gives every package a license identifier, a copyright line and its license text', () => {
    const bodies = committed.split(/^## /m).slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      const title = body.split('\n')[0]
      expect(body, title).toMatch(/^- License: \S+$/m)
      expect(body, title).toMatch(/^- Copyright: Copyright\s+(\(c\)|©|\d{4})/mi)
      expect(body, title).toMatch(/^The license text.*:\n\n```\n[\s\S]+?\n```/m)
    }
  })

  it('preserves the renderer NOTICE and its attribution requirement', () => {
    const renderer = committed.slice(committed.indexOf('## lightweight-charts '))
    expect(renderer).toContain('- License: Apache-2.0')
    expect(renderer).toMatch(/^- Copyright: Copyright \d{4} TradingView, Inc\.$/m)
    expect(renderer).toMatch(/```\nTradingView Lightweight Charts™\nCopyright \(с\) \d{4} TradingView, Inc\. https:\/\/www\.tradingview\.com\/\n```/)
    expect(renderer).toContain('a link to https://www.tradingview.com/')
    expect(renderer).toContain('`attributionLogo`')
    expect(renderer).toContain('Apache License')
    expect(renderer).toContain('Version 2.0, January 2004')
  })

  it('states the boundary of what it lists: no bundled third-party code', () => {
    expect(committed).toContain('bundles no third-party code')
    expect(committed).toContain('generated from the installed packages')
  })
})
