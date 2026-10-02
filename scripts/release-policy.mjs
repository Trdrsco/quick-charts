// The release policy: the acceptance record every version carries in `releases/<version>.json`,
// and the checks `release.yml` runs before anything is published.
//
//   node scripts/release-policy.mjs identity   before the rehearsal: the tag names the package
//                                              version, the dispatched SHA-256 is well formed, and
//                                              the tagged commit holds a complete acceptance record
//                                              for this version that names that SHA-256 and a
//                                              release commit the tag descends from
//   node scripts/release-policy.mjs artifact   after the rehearsal: the same, and the rehearsed
//                                              tarball and tar stream equal the ones the record
//                                              names
//
// A release without its record, with an incomplete record, or with bytes other than the accepted
// candidate's stops here, before the publishing job can start.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The versions published before the record became a precondition of publishing. Their records
 *  keep the shapes they were written in, so each is held only to the facts every shape carries:
 *  the package, the version and the candidate SHA-256. Every other version is held to the whole
 *  acceptance record. This list never grows. */
export const LEGACY_VERSIONS = Object.freeze(['1.0.0', '1.0.1', '1.1.0', '1.2.0', '1.3.0', '2.0.0'])

const HEX40 = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/

export const recordPath = (version) => `releases/${version}.json`

export function isHttpsLink(value) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const text = (v) => typeof v === 'string' && v.trim().length > 0
const hex40 = (v) => typeof v === 'string' && HEX40.test(v)
const hex64 = (v) => typeof v === 'string' && HEX64.test(v)
const dateTime = (v) => typeof v === 'string' && DATE_TIME.test(v) && !Number.isNaN(Date.parse(v))
const get = (record, path) => path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), record)

/** Each rule: the field's path, its test, and what the field must hold. */
const ACCEPTANCE_RULES = [
  ['date', (v) => typeof v === 'string' && DATE.test(v), 'the recording date, YYYY-MM-DD'],
  ['releaseCommit', hex40, 'the full commit the candidate was built from'],
  ['tarballSha256', hex64, 'the candidate tarball SHA-256'],
  ['tarStreamSha256', hex64, 'the candidate tar stream SHA-256'],
  ['producer.ciRun', isHttpsLink, 'an HTTPS link to the CI run of the release commit'],
  ['producer.rehearsal.result', (v) => v === 'pass', '"pass"'],
  ['producer.rehearsal.summarySha256', hex64, 'the rehearsal SUMMARY.md SHA-256'],
  ['producer.rehearsal.dossierHashesSha256', hex64, 'the rehearsal hashes.json SHA-256'],
  ['inspection.exportMap', (v) => v === 'inspected', '"inspected"'],
  ['inspection.declarations', (v) => v === 'inspected', '"inspected"'],
  ['inspection.stylesheet', (v) => v === 'inspected', '"inspected"'],
  ['inspection.licenseAndNotices', (v) => v === 'inspected', '"inspected"'],
  ['inspection.generatedManifests', (v) => v === 'inspected', '"inspected"'],
  ['firstHost.repository', text, 'the first host repository'],
  ['firstHost.testedCommit', hex40, 'the full first-host commit that installed the candidate'],
  ['firstHost.ciRun', isHttpsLink, 'an HTTPS link to the first-host CI run over the candidate'],
  ['firstHost.result', (v) => v === 'pass', '"pass"'],
]

const WAIVER_RULES = [
  ['ownerWaiver.owner', text, 'the owner who waived'],
  ['ownerWaiver.statement', text, 'the owner\'s words'],
  ['ownerWaiver.recordedAt', dateTime, 'the time of the waiver, ISO 8601 with a zone'],
]

const MANUAL_RULES = [
  ['manualAcceptance.accessibility', (v) => v === 'pass', '"pass"'],
  ['manualAcceptance.browsersAndDevices', (v) => v === 'pass', '"pass"'],
  ['manualAcceptance.performedBy', text, 'who performed the manual acceptance'],
  ['manualAcceptance.recordedAt', dateTime, 'the time of the acceptance, ISO 8601 with a zone'],
]

const PUBLICATION_RULES = [
  ['publication.releaseRun', isHttpsLink, 'an HTTPS link to the release workflow run that published'],
  ['publication.registryIntegrity', (v) => typeof v === 'string' && INTEGRITY.test(v), 'the registry dist.integrity, sha512-...'],
  ['publication.registryTarballSha256', (v, r) => v === r.tarballSha256, 'the SHA-256 of the registry tarball, equal to tarballSha256'],
  ['publication.provenanceLogIndex', (v) => (typeof v === 'string' && /^\d+$/.test(v)) || (Number.isSafeInteger(v) && v >= 0), 'the transparency-log index of the provenance attestation'],
]

const broken = (rules, record) => rules.filter(([path, ok]) => !ok(get(record, path), record)).map(([path, , want]) => `${path}: expected ${want}`)

/** The facts every record shape carries, the current one and each legacy one. */
export function recordFacts(record) {
  return {
    packageName: record?.packageName ?? record?.candidate?.package,
    version: record?.version ?? record?.candidate?.version,
    tarballSha256: record?.tarballSha256 ?? record?.candidate?.tarball_sha256,
  }
}

/** Every way `record` falls short of the record its version must carry, as `path: expected ...`
 *  lines; an empty list is a valid record. A legacy version is held to its facts, every other
 *  version to the whole acceptance record, and to the publication section once it has one. */
export function recordProblems(record, { version, packageName, strict = !LEGACY_VERSIONS.includes(version) }) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['the record is not a JSON object']
  const facts = recordFacts(record)
  const problems = []
  if (facts.packageName !== packageName) problems.push(`packageName: expected ${packageName}`)
  if (facts.version !== version) problems.push(`version: expected ${version}`)
  if (!strict) {
    if (!hex64(facts.tarballSha256)) problems.push('tarballSha256: expected the candidate tarball SHA-256')
    return problems
  }
  problems.push(...broken(ACCEPTANCE_RULES, record))
  const waiver = record.ownerWaiver !== undefined
  const manual = record.manualAcceptance !== undefined
  if (waiver) problems.push(...broken(WAIVER_RULES, record))
  else if (manual) problems.push(...broken(MANUAL_RULES, record))
  else problems.push('manualAcceptance or ownerWaiver: expected the manual acceptance results or the owner\'s explicit waiver')
  if (record.publication !== undefined) problems.push(...broken(PUBLICATION_RULES, record))
  return problems
}

export function validateIdentity({ ref, version, digest }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || ref !== `refs/tags/v${version}`) throw new Error('Release ref must exactly match the stable package version')
  if (!/^[a-f0-9]{64}$/.test(digest ?? '')) throw new Error('The accepted candidate SHA-256 is required')
}

export function verifyArtifact(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error('Candidate differs from the artifact accepted by the first host')
  return actual
}

/** The record for `version` in the checkout at `root`, parsed. */
export function readRecord(root, version) {
  const file = join(root, ...recordPath(version).split('/'))
  if (!existsSync(file)) throw new Error(`${recordPath(version)} is missing: merge the acceptance record before tagging v${version}`)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${recordPath(version)} is not valid JSON: ${error.message}`)
  }
}

/** The release checks over the checkout at `root`. `isAncestor(commit)` answers whether the
 *  checked-out commit is `commit` or descends from it. Throws on the first refusal; returns the
 *  version, the digest and the record when the release may proceed. */
export function checkRelease({ root, mode, env, isAncestor }) {
  if (mode !== 'identity' && mode !== 'artifact') throw new Error('Expected identity or artifact')
  const { name: packageName, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const digest = env.EXPECTED_DIGEST
  validateIdentity({ ref: env.GITHUB_REF, version, digest })
  const record = readRecord(root, version)
  // The release itself is always held to the whole record, whatever version it names.
  const problems = recordProblems(record, { version, packageName, strict: true })
  if (problems.length) throw new Error(`${recordPath(version)} is not a complete acceptance record:\n  ${problems.join('\n  ')}`)
  if (record.tarballSha256 !== digest) throw new Error(`The dispatched SHA-256 differs from the candidate ${recordPath(version)} accepts`)
  if (!isAncestor(record.releaseCommit)) throw new Error(`The release commit ${record.releaseCommit} in ${recordPath(version)} is neither the tagged commit nor one of its ancestors`)
  if (mode === 'artifact') {
    verifyArtifact(readFileSync(join(root, '.candidate', `trdrs-quickcharts-${version}.tgz`)), digest)
    const manifest = JSON.parse(readFileSync(join(root, '.candidate', 'manifest.json'), 'utf8'))
    if (manifest?.tarball?.tarSha256 !== record.tarStreamSha256) throw new Error(`The rehearsed tar stream differs from the one ${recordPath(version)} accepts`)
  }
  return { version, digest, record }
}

/** The step summary the release approver reads before approving the publishing environment. */
export function releaseSummary({ version, digest, record }, env) {
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com'
  const lines = [
    `Quick Charts ${version}`,
    `Candidate SHA-256: ${digest}`,
    `Acceptance record: ${server}/${env.GITHUB_REPOSITORY}/blob/${env.GITHUB_SHA}/${recordPath(version)}`,
    `Release commit: ${record.releaseCommit}, CI ${record.producer.ciRun}`,
    `First host: ${record.firstHost.repository} at ${record.firstHost.testedCommit}, ${record.firstHost.result}, CI ${record.firstHost.ciRun}`,
    record.ownerWaiver
      ? `Manual acceptance waived by ${record.ownerWaiver.owner} at ${record.ownerWaiver.recordedAt}: "${record.ownerWaiver.statement}"`
      : `Manual acceptance performed by ${record.manualAcceptance.performedBy} at ${record.manualAcceptance.recordedAt}`,
  ]
  return `${lines.join('\n\n')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  const isAncestor = (commit) => spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repo }).status === 0
  const result = checkRelease({ root: repo, mode, env: process.env, isAncestor })
  if (mode === 'artifact') {
    appendFileSync(process.env.GITHUB_OUTPUT, `digest=${result.digest}\n`)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, releaseSummary(result, process.env))
  }
}
