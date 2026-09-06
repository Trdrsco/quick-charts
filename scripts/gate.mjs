// THE GATE, as one command, so that "green" means one thing to everybody: the same steps the
// public CI runs, in the same order, stopping at the first failure.
//
//   node scripts/gate.mjs          the whole gate, clean room included
//   node scripts/gate.mjs --fast   the inner loop, without the clean room
//   node scripts/gate.mjs --only=a,b
//
// A failing step makes every later step's output noise, so the run stops there and the summary
// names the step that stopped it.
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Each step is exactly one CI step, named the way CI names it. `slow` is the axis people want to
 *  skip in the inner loop: the clean room installs the tarball into three fresh projects. */
const STEPS = [
  // The build's last step packs the candidate, so every later step reads a candidate built from
  // this checkout.
  { id: 'build', run: ['pnpm', 'run', 'build'] },
  { id: 'typecheck', run: ['pnpm', 'run', 'typecheck'] },
  { id: 'test', run: ['pnpm', 'run', 'test'] },
  { id: 'candidate-pin', run: ['node', 'scripts/check-candidate-pin.mjs'] },
  { id: 'supply-chain', run: ['node', 'scripts/check-supply-chain.mjs'] },
  { id: 'notices', run: ['node', 'scripts/build-third-party-notices.mjs', '--check'] },
  { id: 'docs', run: ['node', 'scripts/check-docs.mjs'] },
  { id: 'clean-room', slow: true, run: ['node', 'clean-room/run.mjs'] },
]

const argv = process.argv.slice(2)
const fast = argv.includes('--fast')
const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
  node scripts/gate.mjs             the whole gate
  node scripts/gate.mjs --fast      the inner loop, without the clean room
  node scripts/gate.mjs --only=a,b  just these steps

  steps: ${STEPS.map((s) => s.id).join(', ')}
`)
  process.exit(0)
}

const chosen = STEPS.filter((s) => {
  if (only) return only.split(',').includes(s.id)
  if (s.slow && fast) return false
  return true
})

if (!chosen.length) {
  console.error(`no steps matched --only=${only}; known steps: ${STEPS.map((s) => s.id).join(', ')}`)
  process.exit(2)
}

const results = []
let failed = null

for (const step of chosen) {
  const started = Date.now()
  process.stdout.write(`\n\x1b[1m> ${step.id}\x1b[0m  ${step.run.join(' ')}\n`)
  const { status } = spawnSync(step.run[0], step.run.slice(1), {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
    // On Windows `pnpm` resolves to a .cmd shim, which node cannot spawn directly. Every step's
    // argv is static and space-free, so the shell adds no quoting risk.
    shell: process.platform === 'win32',
  })
  const secs = Math.round((Date.now() - started) / 1000)
  results.push({ id: step.id, ok: status === 0, secs })
  if (status !== 0) {
    failed = { id: step.id, status }
    break
  }
}

const skipped = chosen.length - results.length
const pad = Math.max(...chosen.map((s) => s.id.length))
console.log('\n\x1b[1m-- gate --\x1b[0m')
for (const r of results) console.log(`  ${r.ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mXX\x1b[0m'} ${r.id.padEnd(pad)}  ${r.secs}s`)
if (skipped) console.log(`  \x1b[2m.. ${skipped} step(s) not reached\x1b[0m`)

if (failed) {
  console.log(`\n\x1b[31mRED\x1b[0m: ${failed.id} exited ${failed.status}.`)
  process.exit(1)
}
console.log(`\n${fast ? '\x1b[33mPARTIAL\x1b[0m: the clean room did not run.' : '\x1b[32mGREEN\x1b[0m'}`)
