import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkRelease, LEGACY_VERSIONS, recordProblems, releaseSummary, validateIdentity, verifyArtifact } from '../release-policy.mjs'

const repo = resolve(__dirname, '..', '..')
const PACKAGE = '@trdrs/quickcharts'
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

/** The example record releases/README.md shows, which is the whole acceptance record. */
function readmeExample(): Record<string, any> {
  const readme = readFileSync(join(repo, 'releases', 'README.md'), 'utf8')
  const block = /```json\r?\n([\s\S]*?)```/.exec(readme)
  return JSON.parse(block![1]!)
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const digest = 'a'.repeat(64)

describe('release identity', () => {
  const valid = { ref: 'refs/tags/v1.0.0', version: '1.0.0', digest }
  it('accepts an exact stable tag and a candidate SHA-256', () => {
    expect(() => validateIdentity(valid)).not.toThrow()
  })
  it.each([
    { ref: 'refs/heads/main' }, { ref: 'refs/tags/v0.1.0' }, { version: '1.0.0-rc.1' },
    { digest: '' }, { digest: 'not-a-digest' },
  ])('refuses an invalid release identity: %j', (change) => {
    expect(() => validateIdentity({ ...valid, ...change })).toThrow()
  })
  it('refuses bytes different from the first-host candidate', () => {
    expect(() => verifyArtifact(Buffer.from('different'), digest)).toThrow(/differs/)
    expect(verifyArtifact(Buffer.from('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toHaveLength(64)
  })
})

describe('the acceptance record', () => {
  const example = readmeExample()
  const problems = (record: unknown, version = '2.1.0') => recordProblems(record, { version, packageName: PACKAGE })

  it('accepts the example the folder README shows', () => {
    expect(example.version).toBe('2.1.0')
    expect(problems(example)).toEqual([])
  })

  it.each([
    ['releaseCommit', 'abc123'],
    ['tarballSha256', 'not-a-digest'],
    ['tarStreamSha256', undefined],
    ['producer.ciRun', 'http://example.com/run'],
    ['producer.rehearsal.result', 'fail'],
    ['producer.rehearsal.summarySha256', undefined],
    ['inspection.stylesheet', 'skipped'],
    ['firstHost.repository', ''],
    ['firstHost.testedCommit', undefined],
    ['firstHost.ciRun', 'https://user:secret@example.com/run'],
    ['firstHost.result', 'fail'],
    ['ownerWaiver.statement', ' '],
    ['ownerWaiver.recordedAt', '2026-10-03'],
    ['date', '3 October'],
  ])('names %s when it does not hold what the rules require', (path, value) => {
    const record = clone(example)
    const keys = path.split('.')
    const parent = keys.slice(0, -1).reduce((node: any, key) => node[key], record)
    if (value === undefined) delete parent[keys.at(-1)!]
    else parent[keys.at(-1)!] = value
    expect(problems(record).join('\n')).toContain(`${path}:`)
  })

  it('requires the manual acceptance results or an owner waiver', () => {
    const record = clone(example)
    delete record.ownerWaiver
    expect(problems(record).join('\n')).toContain('manualAcceptance or ownerWaiver')
    record.manualAcceptance = { accessibility: 'pass', browsersAndDevices: 'not performed', performedBy: 'A maintainer', recordedAt: '2026-10-03T12:00:00Z' }
    expect(problems(record)).toEqual(['manualAcceptance.browsersAndDevices: expected "pass"'])
    record.manualAcceptance.browsersAndDevices = 'pass'
    expect(problems(record)).toEqual([])
  })

  it('holds the publication section to the registry facts once it is present', () => {
    const record = clone(example)
    record.publication = { releaseRun: 'https://github.com/Trdrsco/quick-charts/actions/runs/3', registryIntegrity: 'sha512-abc+/=', registryTarballSha256: record.tarballSha256, provenanceLogIndex: '3059580282' }
    expect(problems(record)).toEqual([])
    record.publication.registryTarballSha256 = 'b'.repeat(64)
    record.publication.provenanceLogIndex = 'latest'
    expect(problems(record)).toEqual([
      'publication.registryTarballSha256: expected the SHA-256 of the registry tarball, equal to tarballSha256',
      'publication.provenanceLogIndex: expected the transparency-log index of the provenance attestation',
    ])
  })

  it('refuses a record for another package or version', () => {
    expect(problems({ ...example, version: '2.1.1' })).toContain('version: expected 2.1.0')
    expect(problems({ ...example, packageName: 'other' })).toContain(`packageName: expected ${PACKAGE}`)
    expect(problems([])).toEqual(['the record is not a JSON object'])
  })

  it('holds the versions published before the rules to their facts, and every committed record passes', () => {
    expect(LEGACY_VERSIONS).toEqual(['1.0.0', '1.0.1', '1.1.0', '1.2.0', '1.3.0', '2.0.0'])
    expect(problems({ packageName: PACKAGE, version: '1.3.0', tarballSha256: digest }, '1.3.0')).toEqual([])
    expect(problems({ candidate: { package: PACKAGE, version: '1.2.0', tarball_sha256: digest } }, '1.2.0')).toEqual([])
    expect(problems({ packageName: PACKAGE, version: '1.3.0' }, '1.3.0')).toEqual(['tarballSha256: expected the candidate tarball SHA-256'])
    // A version after them is held to the whole record.
    expect(problems({ packageName: PACKAGE, version: '2.0.1', tarballSha256: digest }, '2.0.1').length).toBeGreaterThan(10)
    for (const name of readdirSync(join(repo, 'releases')).filter((n) => n.endsWith('.json'))) {
      const version = name.slice(0, -'.json'.length)
      expect(problems(JSON.parse(readFileSync(join(repo, 'releases', name), 'utf8')), version), name).toEqual([])
    }
  })
})

describe('the release gate', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  const tarball = Buffer.from('the rehearsed candidate')
  const tarStream = 'f'.repeat(64)

  /** A checkout at tag v2.1.0 whose rehearsal packed `tarball`, holding `record` when given. */
  function checkout(record?: unknown): string {
    const root = mkdtempSync(join(tmpdir(), 'release-policy-'))
    roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: PACKAGE, version: '2.1.0' }))
    mkdirSync(join(root, '.candidate'))
    writeFileSync(join(root, '.candidate', 'trdrs-quickcharts-2.1.0.tgz'), tarball)
    writeFileSync(join(root, '.candidate', 'manifest.json'), JSON.stringify({ tarball: { sha256: sha256(tarball), tarSha256: tarStream } }))
    if (record !== undefined) {
      mkdirSync(join(root, 'releases'))
      writeFileSync(join(root, 'releases', '2.1.0.json'), typeof record === 'string' ? record : JSON.stringify(record))
    }
    return root
  }

  const accepted = () => ({ ...clone(readmeExample()), tarballSha256: sha256(tarball), tarStreamSha256: tarStream })
  const env = { GITHUB_REF: 'refs/tags/v2.1.0', EXPECTED_DIGEST: sha256(tarball) }
  const run = (root: string, { mode = 'artifact', dispatched = env, ancestor = true } = {}) =>
    checkRelease({ root, mode, env: dispatched, isAncestor: (commit: string) => ancestor && commit === accepted().releaseCommit })

  it('lets the release proceed when the record accepts the dispatched and rehearsed bytes', () => {
    const result = run(checkout(accepted()))
    expect(result.version).toBe('2.1.0')
    const summary = releaseSummary(result, { GITHUB_REPOSITORY: 'Trdrsco/quick-charts', GITHUB_SHA: 'c'.repeat(40) })
    expect(summary).toContain(`https://github.com/Trdrsco/quick-charts/blob/${'c'.repeat(40)}/releases/2.1.0.json`)
    expect(summary).toContain('Manual acceptance waived by')
  })

  it('refuses a tag whose commit holds no record, in both modes', () => {
    for (const mode of ['identity', 'artifact']) expect(() => run(checkout(), { mode })).toThrow(/releases\/2\.1\.0\.json is missing/)
  })

  it('refuses a record that is not JSON or not complete', () => {
    expect(() => run(checkout('{ not json'))).toThrow(/not valid JSON/)
    const incomplete = accepted()
    delete incomplete.firstHost
    expect(() => run(checkout(incomplete))).toThrow(/not a complete acceptance record[\s\S]*firstHost\.ciRun/)
  })

  it('refuses a dispatched digest that differs from the record', () => {
    expect(() => run(checkout(accepted()), { dispatched: { ...env, EXPECTED_DIGEST: 'b'.repeat(64) } })).toThrow(/dispatched SHA-256 differs/)
  })

  it('refuses rehearsed bytes that differ from the record', () => {
    const elsewhere = { ...accepted(), tarballSha256: 'b'.repeat(64) }
    expect(() => run(checkout(elsewhere), { dispatched: { ...env, EXPECTED_DIGEST: 'b'.repeat(64) } })).toThrow(/Candidate differs/)
    expect(() => run(checkout({ ...accepted(), tarStreamSha256: 'e'.repeat(64) }))).toThrow(/tar stream differs/)
  })

  it('refuses a record for another version', () => {
    expect(() => run(checkout({ ...accepted(), version: '2.1.1' }))).toThrow(/version: expected 2\.1\.0/)
  })

  it('refuses a release commit the tag does not descend from', () => {
    expect(() => run(checkout(accepted()), { ancestor: false })).toThrow(/neither the tagged commit nor one of its ancestors/)
  })

  it('refuses a ref other than the version tag before reading the record', () => {
    expect(() => run(checkout(), { dispatched: { ...env, GITHUB_REF: 'refs/heads/main' } })).toThrow(/Release ref/)
  })
})
