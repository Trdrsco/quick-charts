// Only release records can use the metadata gate. Missing history or any other path runs the full gate.
import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const releaseRecordPath = path => /^releases\/\d+\.\d+\.\d+\.json$/.test(path)
export const recordsOnly = paths => Array.isArray(paths) && paths.length > 0 && paths.every(releaseRecordPath)

export function changedPaths(env, git) {
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
    const base = env.GITHUB_EVENT_NAME === 'pull_request' ? event.pull_request?.base?.sha : event.before
    if (!/^[a-f0-9]{40}$/.test(base ?? '') || /^0+$/.test(base)) return null
    const result = git(base, 'HEAD')
    return result === null ? null : result.split('\0').filter(Boolean)
  } catch { return null }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = changedPaths(process.env, (base, head) => {
    const r = spawnSync('git', ['diff', '--name-only', '-z', base, head], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout : null
  })
  const output = `full=${!recordsOnly(paths)}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  process.stdout.write(output)
}
