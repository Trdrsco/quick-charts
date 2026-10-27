// The candidate pin: the tar-stream hash and the per-file hashes the build just wrote, compared
// with the committed pin in test/fixtures/candidate-manifest.json.
//
//   node scripts/check-candidate-pin.mjs
//
// The build's last step packs the candidate, so this reads what this checkout produced. The pin
// names the bytes of the release the package version names, so it is required where a release is
// cut: a change that sets a new version or writes the pin, which is the pull request that cuts the
// release and the main push it makes, whose CI run keeps the candidate a release publishes. A
// change whose base cannot be read is held to the pin as well. Any other change may leave the pin
// naming the last release's bytes; the check reports that drift and passes. The release rehearsal
// holds its candidate to the pin on every run. Re-pin with `node scripts/pack-candidate.mjs --pin`.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { comparePin } from './release-rehearsal.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PIN_PATH = 'test/fixtures/candidate-manifest.json'

const SHA = /^[a-f0-9]{40}$/

/** The commit a change is measured from: a pull request's base, a push's previous head, or, off CI,
 *  the merge base with origin/main. Null for any other event and for a base that cannot be read. */
export function changeBase(env, git) {
  let base = null
  if (env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
      if (env.GITHUB_EVENT_NAME === 'pull_request') base = event.pull_request?.base?.sha
      else if (env.GITHUB_EVENT_NAME === 'push') base = event.before
    } catch {
      return null
    }
  } else {
    base = git('merge-base', 'HEAD', 'origin/main')?.trim()
  }
  return SHA.test(base ?? '') && !/^0+$/.test(base) ? base : null
}

/** Whether a change must match the pin: it sets a new version or writes the pin, or its base
 *  version or its changed paths are unknown. */
export function pinRequired({ baseVersion, version, paths }) {
  if (typeof baseVersion !== 'string' || !Array.isArray(paths)) return true
  return baseVersion !== version || paths.includes(PIN_PATH)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const candidatePath = join(repo, '.candidate', 'manifest.json')
  if (!existsSync(candidatePath)) {
    console.error('check-candidate-pin: no .candidate/manifest.json; run `pnpm run build`, whose last step packs the candidate')
    process.exit(2)
  }

  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
    return result.status === 0 ? result.stdout : null
  }
  const base = changeBase(process.env, git)
  let baseVersion = null
  let paths = null
  if (base) {
    try {
      baseVersion = JSON.parse(git('show', `${base}:package.json`) ?? 'null')?.version ?? null
    } catch {
      baseVersion = null
    }
    paths = git('diff', '--name-only', '-z', base)?.split('\0').filter(Boolean) ?? null
  }
  const { version } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  const required = pinRequired({ baseVersion, version, paths })

  const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'))
  const pin = JSON.parse(readFileSync(join(repo, ...PIN_PATH.split('/')), 'utf8'))
  const drift = comparePin(candidate, pin)

  if (!drift.length) {
    console.log(`candidate pin OK: ${Object.keys(candidate.files).length} files, tar stream ${candidate.tarball.tarSha256}`)
  } else if (required) {
    for (const line of drift) console.error(`  ${line}`)
    console.error(`\ncandidate pin FAILED: ${drift.length} difference(s) from ${PIN_PATH}. This change ${base ? 'sets the version or the pin' : 'has no base to read'}, so its candidate must match the pin.`)
    process.exit(1)
  } else {
    console.log(`candidate pin not required: this change sets neither the version nor the pin. The candidate differs from the pin in ${drift.length} place(s); the pull request that sets the next version re-pins it.`)
  }
}
