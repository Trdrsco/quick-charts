// The release record coverage check: `node scripts/check-release-records.mjs`, run by the gate and
// by CI.
//
// Every Quick Charts version a stranger can install or check out has its acceptance record in
// `releases/<version>.json`. This check reads the public truth and holds the folder to it:
//
//   folder       the folder holds README.md and `<version>.json` files only, and every record
//                passes the release policy for its version (the whole acceptance record, or the
//                legacy facts for a version published before the record was required)
//   registry     every version the npm registry lists has a record, and the registry tarball's
//                SHA-256 equals the candidate SHA-256 the record accepts
//   tags         every `v<version>` tag in the public repository has a record, except a tag
//                listed in UNPUBLISHED_TAGS that the registry does not list
//   publication  a version held to the whole record carries its publication facts (the release
//                run, the registry integrity and the provenance log index) once it has been on
//                the registry for PUBLICATION_GRACE_DAYS, and those facts equal the registry's
//
// Output: `release records OK: ...` and exit 0, with a warning per publication section still
// inside its grace period; otherwise one line per finding and exit 1. It reads the registry and
// the repository's tags over the network and writes nothing.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGACY_VERSIONS, recordFacts, recordProblems } from './release-policy.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Tags that never reached the registry, with the reason. A listed tag that the registry later
 *  lists needs its record like any other version. */
export const UNPUBLISHED_TAGS = new Map([['1.0.2', 'its release run was cancelled before publishing']])

/** How long a published version may go without its publication facts: long enough for the
 *  follow-up pull request that records them, short enough that the facts are never forgotten. */
export const PUBLICATION_GRACE_DAYS = 7

const VERSION_FILE = /^(\d+\.\d+\.\d+)\.json$/
const DAY = 24 * 60 * 60 * 1000

/** The findings over the folder, the registry and the tags.
 *
 *  files      the folder's entries: name to the parsed record, or to an Error when it is not JSON
 *  published  each registry version: { time, integrity, sha256, provenanceLogIndex }
 *  tags       the versions that have a `v<version>` tag
 *  now        the current time in milliseconds */
export function coverageProblems({ files, packageName, published, tags, now }) {
  const problems = []
  const warnings = []
  const records = new Map()
  for (const [name, record] of files) {
    if (name === 'README.md') continue
    const version = VERSION_FILE.exec(name)?.[1]
    if (!version) {
      problems.push(`releases/${name}: the folder holds README.md and <version>.json records only`)
      continue
    }
    if (record instanceof Error) {
      problems.push(`releases/${name}: not valid JSON: ${record.message}`)
      continue
    }
    for (const problem of recordProblems(record, { version, packageName })) problems.push(`releases/${name}: ${problem}`)
    records.set(version, record)
  }

  for (const [version, entry] of published) {
    const record = records.get(version)
    if (!record) {
      problems.push(`${version} is on the registry without releases/${version}.json`)
      continue
    }
    if (recordFacts(record).tarballSha256 !== entry.sha256) problems.push(`${version}: the registry tarball differs from the candidate releases/${version}.json accepts`)
    if (LEGACY_VERSIONS.includes(version)) continue
    const publication = record.publication
    if (publication === undefined) {
      const age = now - Date.parse(entry.time)
      const message = `${version}: releases/${version}.json has no publication section; record the publication facts`
      if (age > PUBLICATION_GRACE_DAYS * DAY) problems.push(`${message} (published ${entry.time}, over ${PUBLICATION_GRACE_DAYS} days ago)`)
      else warnings.push(message)
      continue
    }
    if (publication.registryIntegrity !== entry.integrity) problems.push(`${version}: publication.registryIntegrity differs from the registry's ${entry.integrity}`)
    if (String(publication.provenanceLogIndex) !== String(entry.provenanceLogIndex)) problems.push(`${version}: publication.provenanceLogIndex differs from the registry's provenance attestation, ${entry.provenanceLogIndex}`)
  }

  for (const version of tags) {
    if (records.has(version)) continue
    if (UNPUBLISHED_TAGS.has(version) && !published.has(version)) continue
    problems.push(`v${version} is tagged without releases/${version}.json`)
  }
  for (const version of UNPUBLISHED_TAGS.keys()) {
    if (!tags.includes(version)) problems.push(`UNPUBLISHED_TAGS names ${version}, which has no tag; delete the entry`)
  }
  return { problems, warnings }
}

/** The `v<version>` tags of `remote`, read with `git ls-remote`. */
export function parseTags(lsRemote) {
  const versions = new Set()
  for (const line of lsRemote.split(/\r?\n/)) {
    const version = /\trefs\/tags\/v(\d+\.\d+\.\d+)$/.exec(line)?.[1]
    if (version) versions.add(version)
  }
  return [...versions]
}

async function fetchOk(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

/** Each registry version with its publish time, integrity, the SHA-256 of its tarball and, when it
 *  is held to the whole record, the log index of its SLSA provenance attestation. */
async function registry(packageName) {
  const packument = await (await fetchOk(`https://registry.npmjs.org/${packageName.replace('/', '%2f')}`)).json()
  const published = new Map()
  for (const [version, manifest] of Object.entries(packument.versions ?? {})) {
    const bytes = Buffer.from(await (await fetchOk(manifest.dist.tarball)).arrayBuffer())
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    if (integrity !== manifest.dist.integrity) throw new Error(`${version}: the downloaded tarball does not match the registry integrity`)
    let provenanceLogIndex
    if (!LEGACY_VERSIONS.includes(version) && manifest.dist.attestations?.url) {
      const { attestations } = await (await fetchOk(manifest.dist.attestations.url)).json()
      const provenance = attestations.find((a) => a.predicateType === manifest.dist.attestations.provenance?.predicateType)
      provenanceLogIndex = provenance?.bundle?.verificationMaterial?.tlogEntries?.[0]?.logIndex
    }
    published.set(version, {
      time: packument.time?.[version],
      integrity: manifest.dist.integrity,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      provenanceLogIndex,
    })
  }
  return published
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  const files = new Map()
  for (const name of readdirSync(join(repo, 'releases'))) {
    const text = readFileSync(join(repo, 'releases', name), 'utf8')
    if (!name.endsWith('.json')) files.set(name, null)
    else {
      try {
        files.set(name, JSON.parse(text))
      } catch (error) {
        files.set(name, error)
      }
    }
  }
  // The public repository is the authority on tags, whatever remote this checkout names.
  const remote = pkg.repository.url.replace(/^git\+/, '')
  const tags = parseTags(execFileSync('git', ['ls-remote', '--tags', remote], { encoding: 'utf8' }))
  const published = await registry(pkg.name)
  const { problems, warnings } = coverageProblems({ files, packageName: pkg.name, published, tags, now: Date.now() })
  for (const w of warnings) console.warn(process.env.GITHUB_ACTIONS ? `::warning::${w}` : `warning: ${w}`)
  if (problems.length) {
    for (const p of problems) console.error(p)
    console.error(`\nrelease records check FAILED: ${problems.length} finding(s).`)
    process.exit(1)
  }
  const recorded = [...files.keys()].filter((n) => n !== 'README.md').length
  console.log(`release records OK: ${recorded} records, ${published.size} registry versions match their accepted candidates, ${tags.length} tags recorded or listed as unpublished.`)
}
