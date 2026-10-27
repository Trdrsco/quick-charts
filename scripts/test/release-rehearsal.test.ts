// The release rehearsal's own proof, over its pure parts: the credential refusal names every shape
// of registry credential and nothing else, the file-list and pin comparisons report exactly the
// drift, a candidate downloaded from main CI must hold what its manifest names, and the summary
// states pass or fail per gate, names the main CI run that proved the gate, lists the owner gates
// as `owner` and never as passed, and names no machine. The stages themselves run real commands and
// are exercised by running the script; they are not re-run here.
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { OWNER_GATES, PROVEN, PUBLIC_ENTRIES, compareFileLists, comparePin, credentialFindings, pinOf, renderSummary, verifyDownloaded } from '../release-rehearsal.mjs'

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

describe('the credential refusal', () => {
  it('names a bare token, a scoped npm config token, and an npmrc auth line', () => {
    const found = credentialFindings(
      { NPM_TOKEN: 'npm_abcdefghijklmnopqrstuvwxyz0123456789', 'npm_config_//registry.example.com/:_authtoken': 't', PATH: '/usr/bin' },
      { '/home/someone/.npmrc': 'registry=https://registry.example.com/\n//registry.example.com/:_authToken=abc\n' },
    )
    expect(found).toEqual(['environment variable NPM_TOKEN', 'environment variable npm_config_//registry.example.com/:_authtoken', '/home/someone/.npmrc:2 sets a registry credential'])
  })

  it('names NODE_AUTH_TOKEN, an npm password and an OTP, but not an empty value', () => {
    const found = credentialFindings({ NODE_AUTH_TOKEN: 'x', NPM_PASSWORD: 'x', npm_config_otp: '123456', NPM_AUTH_TOKEN: '' }, {})
    expect(found).toEqual(['environment variable NODE_AUTH_TOKEN', 'environment variable NPM_PASSWORD', 'environment variable npm_config_otp'])
  })

  it('names a legacy _auth line, a password line and a username line, and passes a plain registry line', () => {
    const found = credentialFindings({}, { '.npmrc': '_auth=YWJj\n//host/:_password=cGFzcw==\n//host/:username=someone\nregistry=https://registry.example.com/\nalways-auth=false\n' })
    expect(found).toEqual(['.npmrc:1 sets a registry credential', '.npmrc:2 sets a registry credential', '.npmrc:3 sets a registry credential'])
  })

  it('never prints a value', () => {
    const found = credentialFindings({ NPM_TOKEN: 'npm_thevalue' }, { '.npmrc': '//host/:_authToken=thevalue\n' })
    expect(found.join('\n')).not.toContain('thevalue')
  })

  it('passes an environment with only ordinary keys', () => {
    expect(credentialFindings({ PATH: 'x', NODE_OPTIONS: '--max-old-space-size=8192', npm_config_registry: 'https://registry.example.com/' }, {})).toEqual([])
  })
})

describe('the comparisons', () => {
  it('reports what only npm would pack and what only the candidate names', () => {
    expect(compareFileLists(['LICENSE', 'dist/a.js', 'package.json'], ['LICENSE', 'dist/b.js', 'package.json'])).toEqual({ onlyNpm: ['dist/a.js'], onlyManifest: ['dist/b.js'] })
    expect(compareFileLists(['a'], ['a'])).toEqual({ onlyNpm: [], onlyManifest: [] })
  })

  it('reports a missing, changed or added file and a tar stream that differs', () => {
    const pin = { tarSha256: 'tar', files: { 'dist/index.js': 'aa', 'LICENSE': 'bb' } }
    const same = { tarball: { tarSha256: 'tar' }, files: { 'dist/index.js': { sha256: 'aa' }, 'LICENSE': { sha256: 'bb' } } }
    expect(comparePin(same, pin)).toEqual([])
    const drifted = { tarball: { tarSha256: 'other' }, files: { 'dist/index.js': { sha256: 'ab' }, 'dist/extra.js': { sha256: 'cc' } } }
    expect(comparePin(drifted, pin)).toEqual(['changed dist/index.js', 'missing LICENSE', 'added dist/extra.js', 'tar stream hash differs'])
  })
})

describe('the summary', () => {
  const stages = [
    { id: 'checkout', result: 'pass', secs: 1, log: 'logs/01-checkout.log' },
    { id: 'gate', result: 'FAIL: node scripts/gate.mjs exited 1', secs: 400, log: 'logs/03-gate.log' },
    { id: 'pack', result: 'not run', secs: null, log: null },
  ]
  const artifact = { name: 'quickcharts-0.0.0-staging.tgz', bytes: 10, sha256: 'tgzhash', tarSha256: 'tarhash', pinMatches: true, files: 66, npmPack: 'lists the same 66 paths', installTest: null }
  const page = renderSummary({ result: 'FAIL', version: '0.0.0-staging', commit: 'abc123', branch: 'main', date: '2026-01-01T00:00:00.000Z', fast: false, stages, artifact, ownerGates: OWNER_GATES })

  it('states the verdict, the candidate, and that nothing was published', () => {
    expect(page).toContain('Result: **FAIL**')
    expect(page).toContain('`@trdrs/quickcharts` 0.0.0-staging, commit `abc123` on `main`')
    expect(page).toContain('Published: nothing.')
  })

  it('states pass or fail per gate with its log, and marks the gates a failure stopped', () => {
    expect(page).toContain('| checkout | pass | 1s | `logs/01-checkout.log` |')
    expect(page).toContain('| gate | FAIL: node scripts/gate.mjs exited 1 | 400s | `logs/03-gate.log` |')
    expect(page).toContain('| pack | not run |  |  |')
  })

  it('records the artifact hashes and the pin verdict', () => {
    expect(page).toContain('SHA-256 `tgzhash`')
    expect(page).toContain('Tar stream SHA-256 `tarhash`; the committed pin matches.')
    expect(page).toContain('`npm pack --dry-run` lists the same 66 paths.')
  })

  it('lists every owner gate as owner and never as passed', () => {
    for (const gate of OWNER_GATES) expect(page).toContain(`| ${gate} | owner |`)
    const ownerSection = page.slice(page.indexOf('## Owner gates'))
    expect(ownerSection).not.toMatch(/\| pass \|/)
  })

  it('reads PARTIAL with the reason when the clean room was skipped', () => {
    const partial = renderSummary({ result: 'PARTIAL', version: 'v', commit: 'c', branch: 'b', date: 'd', fast: true, stages: [], artifact: null, ownerGates: OWNER_GATES })
    expect(partial).toContain('Result: **PARTIAL**')
    expect(partial).toContain('without the clean room')
    expect(partial).toContain('Run the whole rehearsal before this page goes into a dossier.')
  })

  it('names no machine and carries no em dash', () => {
    expect(page).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//)
    expect(page).not.toContain('—')
  })
})

describe('a gate proven by main CI', () => {
  const tar = Buffer.from('the tar stream')
  const tgz = gzipSync(tar)
  const manifest = { tarball: { name: 'trdrs-quickcharts-5.4.0.tgz', sha256: sha256(tgz), tarSha256: sha256(tar) }, files: { 'dist/index.js': { sha256: 'aa', bytes: 1 }, LICENSE: { sha256: 'bb', bytes: 1 } } }

  it('compares a build with the kept candidate the way it compares a candidate with the pin', () => {
    expect(pinOf(manifest)).toEqual({ tarSha256: sha256(tar), files: { 'dist/index.js': 'aa', LICENSE: 'bb' } })
    expect(comparePin(manifest, pinOf(manifest))).toEqual([])
    expect(comparePin({ ...manifest, files: { ...manifest.files, LICENSE: { sha256: 'bc', bytes: 1 } } }, pinOf(manifest))).toEqual(['changed LICENSE'])
  })

  it('holds the downloaded tarball to its manifest, by its own hash and by the tar stream inside it', () => {
    expect(() => verifyDownloaded({ bytes: tgz, manifest })).not.toThrow()
    expect(() => verifyDownloaded({ bytes: gzipSync(Buffer.from('other')), manifest })).toThrow(/differs from the SHA-256/)
    const other = gzipSync(Buffer.from('another tar stream'))
    expect(() => verifyDownloaded({ bytes: other, manifest: { ...manifest, tarball: { ...manifest.tarball, sha256: sha256(other) } } })).toThrow(/tar stream/)
  })

  it('names the run in the summary and reads the stages it proved as proven, in a passing rehearsal', () => {
    const run = 'https://github.com/example/charts/actions/runs/123'
    const stages = [
      { id: 'gate', result: PROVEN, secs: 4, log: 'logs/03-gate.log' },
      { id: 'clean-room', result: PROVEN, secs: 0, log: 'logs/05-clean-room.log' },
    ]
    const page = renderSummary({ result: 'PASS', version: '5.4.0', commit: 'abc123', branch: 'main', date: 'd', fast: false, stages, artifact: null, ownerGates: OWNER_GATES, producer: run })
    expect(page).toContain('Result: **PASS**')
    expect(page).toContain(`Gate: proven by main CI run ${run}, a successful push of this commit to main in which every job passed.`)
    expect(page).toContain('| gate | proven by main CI | 4s | `logs/03-gate.log` |')
    expect(page).toContain('| clean-room | proven by main CI | 0s | `logs/05-clean-room.log` |')
    expect(page).not.toContain('—')
  })

  it('names no run when the rehearsal ran the gate itself', () => {
    const page = renderSummary({ result: 'PASS', version: 'v', commit: 'c', branch: 'b', date: 'd', fast: false, stages: [], artifact: null, ownerGates: OWNER_GATES })
    expect(page).not.toContain('proven by main CI')
  })
})

describe('the contract constants', () => {
  it('holds the seven public entries the export map documents', () => {
    expect(PUBLIC_ENTRIES).toEqual(['.', './drawings', './adapters/rest', './format', './glyphs', './symbols', './styles.css'])
  })

  it('names the five owner gates: license, visibility, registry ownership, website address, publication', () => {
    expect(OWNER_GATES).toHaveLength(5)
    expect(OWNER_GATES.join('\n')).toMatch(/License/)
    expect(OWNER_GATES.join('\n')).toMatch(/visibility/)
    expect(OWNER_GATES.join('\n')).toMatch(/two-factor/)
    expect(OWNER_GATES.join('\n')).toMatch(/Website address/)
    expect(OWNER_GATES.join('\n')).toMatch(/Publication/)
  })
})
