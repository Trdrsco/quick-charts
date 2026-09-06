// The public artifact's metadata and the repository policy files the public repository carries.
//
// The manifest names the product for a registry reader (description, keywords, repository,
// homepage, bugs, engines) and publishes only in the open with provenance; the policy files state
// contribution, security, conduct, support and release terms beside the source. Every file is
// held to existence and to the few facts other files depend on; the wording is the documentation
// gate's business.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { CHART_DIR, packedFileList } from './scan'

const POLICY_FILES = ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md', 'RELEASING.md']
const read = (name: string): string => readFileSync(`${CHART_DIR}/${name}`, 'utf8')

describe('the manifest names the product for a registry reader', () => {
  it('describes it and lists what it is found by', () => {
    expect(manifest.description).toMatch(/charting library/)
    expect(manifest.keywords.length).toBeGreaterThan(3)
    for (const word of ['charts', 'datafeed', 'drawings', 'indicators']) expect(manifest.keywords).toContain(word)
  })

  it('points at the public repository, its issues and a route-neutral homepage', () => {
    expect(manifest.repository).toEqual({ type: 'git', url: expect.stringMatching(/^git\+https:\/\/github\.com\/[^/]+\/quick-charts\.git$/) })
    const origin = manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
    expect(manifest.bugs.url).toBe(`${origin}/issues`)
    expect(manifest.homepage).toMatch(/^https:\/\//)
    // Route-neutral: no trdrs address is selected yet, so the homepage names no trdrs route.
    expect(manifest.homepage).not.toMatch(/trdrs\.co/)
  })

  it('states the runtime it builds on', () => {
    expect(manifest.engines).toEqual({ node: expect.stringMatching(/^>=\d+/) })
  })

  it('publishes in the open, with provenance, and its stylesheet is its one side effect in dist', () => {
    expect(manifest.publishConfig.access).toBe('public')
    expect(manifest.publishConfig.provenance).toBe(true)
    expect(manifest.sideEffects).toContain('dist/quickcharts.css')
    expect(manifest.sideEffects.filter((s) => s.startsWith('dist/'))).toEqual(['dist/quickcharts.css'])
  })
})

describe('the repository policy files', () => {
  it('exist beside the source and stay out of the tarball', () => {
    const packed = packedFileList()
    for (const file of POLICY_FILES) {
      expect(existsSync(`${CHART_DIR}/${file}`), file).toBe(true)
      expect(packed, file).not.toContain(file)
    }
    for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) expect(packed).toContain(file)
  })

  it('agree on the facts they share', () => {
    const contributing = read('CONTRIBUTING.md')
    const security = read('SECURITY.md')
    const support = read('SUPPORT.md')
    const releasing = read('RELEASING.md')
    // The commands CONTRIBUTING lists are scripts the manifest defines.
    for (const command of [...contributing.matchAll(/`pnpm ([a-z:-]+)`/g)].map((m) => m[1]!)) {
      if (command === 'install') continue
      expect(Object.keys(manifest.scripts), command).toContain(command)
    }
    // Every generated file RELEASING holds a release to is one the build writes.
    for (const file of ['THIRD-PARTY-NOTICES.md', 'dist/feature-manifest.json', 'dist/theme-manifest.json', 'dist/rest-openapi.json']) expect(releasing).toContain(file)
    // The security window and the support window are the same twelve months.
    expect(security).toMatch(/twelve months/)
    expect(support).toMatch(/twelve months/)
    // The peer SUPPORT names is the peer the manifest names, at its major.
    const peer = manifest.peerDependencies['lightweight-charts']
    expect(support).toContain(`\`lightweight-charts\` ${peer.replace(/^\^/, '').split('.')[0]}`)
    // Provenance is a manifest fact RELEASING relies on.
    expect(releasing).toContain('publishConfig.provenance')
  })

  it('route a vulnerability privately, and name no personal address', () => {
    const security = read('SECURITY.md')
    expect(security).toMatch(/Report privately/)
    expect(security).toMatch(/Security tab/)
    // A reporting address in a public repository is a mailbox to harvest; the private advisory is
    // the route, and this file carries no e-mail address.
    expect(security).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/)
  })
})
