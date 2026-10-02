import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { coverageProblems, parseTags, PUBLICATION_GRACE_DAYS } from '../check-release-records.mjs'

const repo = resolve(__dirname, '..', '..')
const PACKAGE = '@trdrs/quickcharts'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-01T00:00:00Z')

const readme = readFileSync(join(repo, 'releases', 'README.md'), 'utf8')
const example = JSON.parse(/```json\r?\n([\s\S]*?)```/.exec(readme)![1]!)
const legacy = { packageName: PACKAGE, version: '1.3.0', tarballSha256: 'c'.repeat(64) }
const publication = {
  releaseRun: 'https://github.com/Trdrsco/quick-charts/actions/runs/3',
  registryIntegrity: 'sha512-xyz=',
  registryTarballSha256: example.tarballSha256,
  provenanceLogIndex: '42',
}
const onRegistry = (sha256: string, daysAgo = 1) => ({ time: new Date(NOW - daysAgo * DAY).toISOString(), integrity: 'sha512-xyz=', sha256, provenanceLogIndex: '42' })

function check({ files = new Map<string, unknown>(), published = new Map(), tags = [] as string[] } = {}) {
  return coverageProblems({ files, packageName: PACKAGE, published, tags: tags.length ? tags : ['1.0.2'], now: NOW })
}

describe('release record coverage', () => {
  it('passes when every published and tagged version has its record', () => {
    const files = new Map<string, unknown>([['README.md', null], ['1.3.0.json', legacy], ['2.1.0.json', { ...example, publication }]])
    const published = new Map([['1.3.0', onRegistry(legacy.tarballSha256)], ['2.1.0', onRegistry(example.tarballSha256)]])
    expect(check({ files, published, tags: ['1.0.2', '1.3.0', '2.1.0'] })).toEqual({ problems: [], warnings: [] })
  })

  it('allows a record merged before its tag and its publication', () => {
    expect(check({ files: new Map([['2.1.0.json', example]]) }).problems).toEqual([])
  })

  it('fails a registry version without a record', () => {
    expect(check({ published: new Map([['2.1.0', onRegistry(example.tarballSha256)]]) }).problems).toEqual(['2.1.0 is on the registry without releases/2.1.0.json'])
  })

  it('fails a tag without a record, except an unpublished tag it lists', () => {
    expect(check({ tags: ['1.0.2', '2.1.0'] }).problems).toEqual(['v2.1.0 is tagged without releases/2.1.0.json'])
    const published = new Map([['1.0.2', onRegistry('d'.repeat(64))]])
    expect(check({ published, tags: ['1.0.2'] }).problems).toContain('v1.0.2 is tagged without releases/1.0.2.json')
    expect(check({ tags: ['2.1.0'] }).problems).toContain('UNPUBLISHED_TAGS names 1.0.2, which has no tag; delete the entry')
  })

  it('fails a registry tarball that differs from the accepted candidate', () => {
    const files = new Map([['1.3.0.json', legacy]])
    expect(check({ files, published: new Map([['1.3.0', onRegistry('d'.repeat(64))]]) }).problems).toEqual([
      '1.3.0: the registry tarball differs from the candidate releases/1.3.0.json accepts',
    ])
  })

  it('warns while the publication facts are inside their grace period, then fails', () => {
    const files = new Map([['2.1.0.json', example]])
    const fresh = check({ files, published: new Map([['2.1.0', onRegistry(example.tarballSha256, 1)]]) })
    expect(fresh.problems).toEqual([])
    expect(fresh.warnings).toHaveLength(1)
    const stale = check({ files, published: new Map([['2.1.0', onRegistry(example.tarballSha256, PUBLICATION_GRACE_DAYS + 1)]]) })
    expect(stale.problems[0]).toMatch(/has no publication section/)
  })

  it('fails publication facts that differ from the registry', () => {
    const files = new Map([['2.1.0.json', { ...example, publication: { ...publication, registryIntegrity: 'sha512-other=', provenanceLogIndex: 7 } }]])
    expect(check({ files, published: new Map([['2.1.0', onRegistry(example.tarballSha256)]]) }).problems).toEqual([
      '2.1.0: publication.registryIntegrity differs from the registry\'s sha512-xyz=',
      '2.1.0: publication.provenanceLogIndex differs from the registry\'s provenance attestation, 42',
    ])
  })

  it('fails a record that breaks the policy, a stray file and a file that is not JSON', () => {
    const files = new Map<string, unknown>([['2.1.0.json', { ...example, firstHost: undefined }], ['notes.txt', null], ['2.2.0.json', new Error('Unexpected token')]])
    const { problems } = check({ files })
    expect(problems).toContain('releases/2.1.0.json: firstHost.repository: expected the first host repository')
    expect(problems).toContain('releases/notes.txt: the folder holds README.md and <version>.json records only')
    expect(problems).toContain('releases/2.2.0.json: not valid JSON: Unexpected token')
  })

  it('reads version tags from git ls-remote', () => {
    const out = 'a\trefs/tags/v1.0.0\nb\trefs/tags/v1.0.0^{}\nc\trefs/tags/v2.0.0\nd\trefs/tags/nightly\n'
    expect(parseTags(out)).toEqual(['1.0.0', '2.0.0'])
  })
})
