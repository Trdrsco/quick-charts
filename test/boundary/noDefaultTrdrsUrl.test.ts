// No default points at trdrs (public-chart-library-boundary-plan.md, architecture ruling and PCL-1).
// The free chart's only network access is through URLs or adapters the host supplies, so no chart
// source, manifest, README quickstart, test fixture, or packed file may carry a trdrs URL, a
// credential, a session, a tenant key, or a production API route. This is already true; the
// fixture pins it so the first commit that breaks it is the one that fails.
import { describe, expect, it } from 'vitest'
import { CHART_FIXTURES, CHART_SOURCES, isSourceMap, offenderText, packedFileList, packedText, scanFiles, scanLines } from './scan'

/** Every shape a trdrs default could take. Each pattern names what it catches so an offender line
 *  reads as a finding, not a regex. */
const TRDRS_DEFAULTS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'a trdrs host URL', pattern: /https?:\/\/[^\s'"`)]*trdrs/i },
  { name: 'a trdrs domain', pattern: /\btrdrs\.co\b|\btrdrsco[\w-]*\.fly\.dev\b/i },
  { name: 'a tenant key', pattern: /trdrs_sk_/ },
  { name: 'a bearer credential', pattern: /Authorization:\s*Bearer|['"`]Bearer\s+[A-Za-z0-9_\-.]+['"`]/ },
  { name: 'a local engine default', pattern: /localhost:8080|127\.0\.0\.1:8080/ },
  { name: 'an engine environment default', pattern: /VITE_ENGINE_URL|ENGINE_REPO_PATH|ENGINE_URL/ },
  { name: 'a session handoff', pattern: /[Hh]andoffAuth|trdrs_session|engine_session/ },
  { name: 'a production API route', pattern: /['"`]\/api\// },
]

/** The one fixture folder the sweep does not read: these files name the shapes they hunt. Exact
 *  folder, stated reason, and a test below proves it is the only exclusion. */
const EXCLUDED_FIXTURE_DIR = '/packages/chart/test/boundary/'

const sweep = (files: Record<string, string>): string[] =>
  TRDRS_DEFAULTS.flatMap(({ name, pattern }) => scanFiles(files, pattern).map((o) => `${name}: ${offenderText(o)}`))

describe('no default trdrs URL, credential, session, tenant key, or API route', () => {
  it('has chart sources to read (a silent empty walk would pass forever)', () => {
    expect(Object.keys(CHART_SOURCES).length).toBeGreaterThan(30)
    expect(CHART_SOURCES['/packages/chart/src/datafeed.ts']).toBeTypeOf('string')
    expect(CHART_SOURCES['/packages/chart/src/udfDatafeed.ts']).toBeTypeOf('string')
  })

  it('finds none in packages/chart/src', () => {
    expect(sweep(CHART_SOURCES)).toEqual([])
  })

  it('finds none in the test fixtures outside the boundary folder', () => {
    const fixtures = Object.fromEntries(Object.entries(CHART_FIXTURES).filter(([file]) => !file.startsWith(EXCLUDED_FIXTURE_DIR)))
    expect(Object.keys(fixtures).length).toBeGreaterThan(10)
    expect(sweep(fixtures)).toEqual([])
  })

  it('keeps the exclusion honest: the boundary folder is present and is excluded only because it names the shapes', () => {
    const excluded = Object.keys(CHART_FIXTURES).filter((file) => file.startsWith(EXCLUDED_FIXTURE_DIR))
    expect(excluded).toContain('/packages/chart/test/boundary/noDefaultTrdrsUrl.test.ts')
    expect(sweep(Object.fromEntries(excluded.map((f) => [f, CHART_FIXTURES[f]!]))).length).toBeGreaterThan(0)
  })

  it('finds none in the packed file list, and can read every packed file', () => {
    const packed = packedFileList()
    expect(packed).toContain('package.json')
    expect(packed).toContain('README.md')
    const unreadable: string[] = []
    const offenders: string[] = []
    for (const path of packed) {
      if (isSourceMap(path)) continue
      const text = packedText(path)
      if (text === null) {
        unreadable.push(path)
        continue
      }
      for (const { name, pattern } of TRDRS_DEFAULTS) offenders.push(...scanLines(path, text, pattern).map((o) => `${name}: ${offenderText(o)}`))
    }
    expect(unreadable, 'a packed file the fixtures cannot read is a gap in the boundary').toEqual([])
    expect(offenders).toEqual([])
  })

  it('packs no source, fixture, environment file, lockfile, or tsconfig', () => {
    const stray = packedFileList().filter((p) => /^(src|test|clean-room)\//.test(p) || /(^|\/)\.env|pnpm-lock|tsconfig/.test(p))
    expect(stray).toEqual([])
  })

  it('the README quickstart points at an example host, never at trdrs', () => {
    const readme = packedText('README.md')!
    const quickstart = /```ts\r?\n([\s\S]*?)```/.exec(readme)?.[1] ?? ''
    expect(quickstart.length).toBeGreaterThan(0)
    expect(quickstart).toMatch(/example/)
    expect(sweep({ 'README.md#quickstart': quickstart })).toEqual([])
  })
})
