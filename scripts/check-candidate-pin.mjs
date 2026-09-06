// The candidate pin: the tar-stream hash and the per-file hashes the build just wrote, compared
// with the committed pin in test/fixtures/candidate-manifest.json.
//
//   node scripts/check-candidate-pin.mjs
//
// The build's last step packs the candidate, so this reads what this checkout produced. A drift is
// a real difference in the bytes a consumer would receive; re-pin only when the change is intended,
// with `node scripts/pack-candidate.mjs --pin`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { comparePin } from './release-rehearsal.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidatePath = join(repo, '.candidate', 'manifest.json')
const pinPath = join(repo, 'test', 'fixtures', 'candidate-manifest.json')

if (!existsSync(candidatePath)) {
  console.error('check-candidate-pin: no .candidate/manifest.json; run `pnpm run build`, whose last step packs the candidate')
  process.exit(2)
}

const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'))
const pin = JSON.parse(readFileSync(pinPath, 'utf8'))
const drift = comparePin(candidate, pin)

if (drift.length) {
  for (const line of drift) console.error(`  ${line}`)
  console.error(`\ncandidate pin FAILED: ${drift.length} difference(s) from test/fixtures/candidate-manifest.json.`)
  process.exit(1)
}

console.log(`candidate pin OK: ${Object.keys(candidate.files).length} files, tar stream ${candidate.tarball.tarSha256}`)
