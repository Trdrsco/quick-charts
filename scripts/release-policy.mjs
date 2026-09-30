import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function validateIdentity({ ref, version, digest, evidence }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || ref !== `refs/tags/v${version}`) throw new Error('Release ref must exactly match the stable package version')
  if (!/^[a-f0-9]{64}$/.test(digest ?? '')) throw new Error('The accepted candidate SHA-256 is required')
  const url = new URL(evidence)
  if (url.protocol !== 'https:' || url.username || url.password || /[\r\n]/.test(evidence)) throw new Error('First-host evidence must be an HTTPS link without credentials')
}

export function verifyArtifact(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error('Candidate differs from the artifact accepted by the first host')
  return actual
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const digest = process.env.EXPECTED_DIGEST
  const evidence = process.env.FIRST_HOST_EVIDENCE
  validateIdentity({ ref: process.env.GITHUB_REF, version, digest, evidence })
  if (process.argv[2] === 'artifact') {
    const bytes = readFileSync(new URL(`../.candidate/trdrs-quickcharts-${version}.tgz`, import.meta.url))
    verifyArtifact(bytes, digest)
    appendFileSync(process.env.GITHUB_OUTPUT, `digest=${digest}\n`)
    // The release approver reads the first-host record and the exact digest before approving.
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Quick Charts ${version}\n\nCandidate SHA-256: ${digest}\n\nFirst-host evidence: ${evidence}\n`)
  } else if (process.argv[2] !== 'identity') throw new Error('Expected identity or artifact')
}
