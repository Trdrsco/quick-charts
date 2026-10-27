// Publication reuses the accepted candidate only when its complete main CI and unchanged source are proven.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseRecordPath } from './ci-scope.mjs'
import { checkRelease, verifyArtifact } from './release-policy.mjs'

export function producerRunId(url, repository) {
  const prefix = `https://github.com/${repository}/actions/runs/`
  if (typeof url !== 'string' || !url.startsWith(prefix) || !/^[1-9][0-9]*$/.test(url.slice(prefix.length))) throw new Error('Producer CI must name a run in this repository')
  return url.slice(prefix.length)
}

export function verifyProducer({ run, workflow, jobs, record, repository, paths }) {
  if (run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'push' || run.head_branch !== 'main' || run.head_sha !== record.releaseCommit || run.head_repository?.full_name !== repository || run.workflow_id !== workflow.id || workflow.path !== '.github/workflows/ci.yml') throw new Error('Producer must be successful main CI on the accepted source commit')
  if (!Array.isArray(paths) || paths.some(path => !releaseRecordPath(path))) throw new Error('Source changed after producer CI; accept a new candidate')
  for (const name of ['checks', 'tests (1)', 'tests (2)', 'tests (3)', 'browser (chromium)', 'browser (firefox)', 'browser (webkit)', 'gate']) {
    const matches = jobs.filter(job => job.name === name)
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') throw new Error(`Producer CI did not pass ${name}`)
  }
}

export function candidateArtifact(artifacts, runId, commit) {
  const matches = artifacts.filter(artifact => artifact.name === 'quickcharts-candidate' && !artifact.expired && String(artifact.workflow_run?.id) === String(runId) && artifact.workflow_run?.head_sha === commit)
  if (matches.length !== 1) throw new Error('The producer candidate is missing, expired or ambiguous; run full CI on the accepted source again')
  return matches[0]
}

export function verifyCandidate({ bytes, manifest, record }) {
  verifyArtifact(bytes, record.tarballSha256)
  if (manifest.tarball?.sha256 !== record.tarballSha256 || manifest.tarball?.tarSha256 !== record.tarStreamSha256) throw new Error('Producer manifest differs from accepted candidate')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const repository = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Expected repository identity')
  const { version, record } = checkRelease({ root: process.cwd(), mode: 'identity', env: process.env, isAncestor: commit => { try { git('merge-base', '--is-ancestor', commit, 'HEAD'); return true } catch { return false } } })
  const runId = producerRunId(record.producer.ciRun, repository)
  const api = path => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${path}`], { encoding: 'utf8' }))
  const run = api(`actions/runs/${runId}`)
  const workflow = api('actions/workflows/ci.yml')
  const jobs = api(`actions/runs/${runId}/jobs?filter=latest&per_page=100`).jobs
  const paths = git('diff', '--name-only', '-z', record.releaseCommit, 'HEAD').split('\0').filter(Boolean)
  verifyProducer({ run, workflow, jobs, record, repository, paths })
  const artifact = candidateArtifact(api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts, runId, record.releaseCommit)
  if (existsSync('.candidate')) throw new Error('Expected a clean candidate directory')
  mkdirSync('.candidate')
  execFileSync('gh', ['run', 'download', runId, '--repo', repository, '--name', artifact.name, '--dir', '.candidate'], { stdio: 'inherit' })
  const manifest = JSON.parse(readFileSync('.candidate/manifest.json', 'utf8'))
  verifyCandidate({ bytes: readFileSync(`.candidate/trdrs-quickcharts-${version}.tgz`), manifest, record })
  console.log(`Reused candidate from successful main CI ${runId}, artifact ${artifact.id}; accepted source and bytes match.`)
}
