// The clean-room gate (TRACK-B B-1.6): prove that a FRESH project — TypeScript or plain JS — can
// install the packed tarballs and use them, with no access to this workspace's source. This is
// the licensing-tomorrow check: a tarball a stranger's project cannot import is the failure this
// script exists to catch before a customer does.
//
//   node clean-room/run.mjs
//
// Steps: pack every publishable package → .artifacts/ → npm-install each consumer (npm, not pnpm: a customer
// won't have our workspace, and npm exercises the packed manifest exactly as published) → tsc
// --noEmit for the TS consumer (skipLibCheck OFF — the shipped d.ts must stand alone) → execute
// the JS smokes under BOTH module systems (import + require).
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const artifacts = join(here, '.artifacts')

const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}  (${cwd.replace(repo, '.')})`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

rmSync(artifacts, { recursive: true, force: true })
mkdirSync(artifacts, { recursive: true })

// 1. Pack. pnpm applies publishConfig overrides at pack time, so the tarball manifest points at
//    dist while the workspace keeps source linking — the pack IS the artifact under test.
run('pnpm build', join(repo, 'packages/broker'))
run('pnpm build', join(repo, 'packages/i18n'))
run('pnpm build', join(repo, 'packages/account-manager'))
run('pnpm build', join(repo, 'packages/chart'))
run('pnpm build', join(repo, 'packages/news'))
run('pnpm build', join(repo, 'packages/watchlist'))
run('pnpm build', join(repo, 'packages/engine-wire'))
run('pnpm build', join(repo, 'packages/chart-engine'))
run('pnpm build', join(repo, 'packages/order-ticket'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-broker-0.1.0.tgz'))}`, join(repo, 'packages/broker'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-i18n-0.1.0.tgz'))}`, join(repo, 'packages/i18n'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-account-manager-0.1.0.tgz'))}`, join(repo, 'packages/account-manager'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'quickcharts-0.0.0-staging.tgz'))}`, join(repo, 'packages/chart'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-news-0.1.0.tgz'))}`, join(repo, 'packages/news'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-watchlist-0.1.0.tgz'))}`, join(repo, 'packages/watchlist'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-engine-wire-0.1.0.tgz'))}`, join(repo, 'packages/engine-wire'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-chart-engine-0.1.0.tgz'))}`, join(repo, 'packages/chart-engine'))
run(`pnpm pack --out ${JSON.stringify(join(artifacts, 'trdrs-order-ticket-0.2.0.tgz'))}`, join(repo, 'packages/order-ticket'))

// 2. Fresh installs. --install-links copies file: deps instead of symlinking (closer to a real
//    registry install); lockfiles are disposable here — the point is a cold resolve every run.
for (const consumer of ['ts-consumer', 'js-consumer']) {
  const dir = join(here, consumer)
  rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
  rmSync(join(dir, 'package-lock.json'), { force: true })
  run('npm install --no-audit --no-fund --install-links', dir)
}

// 2b. The Quick Charts conformance suite (packages/chart/test/conformance) rides beside the TS
//     consumer as a copy, so it is typed against the SHIPPED declarations rather than the workspace
//     source, then compiled beside the JS consumer, where its `quickcharts` imports resolve to the
//     installed tarball. The browser shim the workspace host uses travels with it. Both copies are
//     ignored by git and remade every run.
const conformanceSource = join(repo, 'packages', 'chart', 'test', 'conformance')
const conformanceCopy = join(here, 'ts-consumer', 'conformance')
rmSync(conformanceCopy, { recursive: true, force: true })
mkdirSync(conformanceCopy, { recursive: true })
copyFileSync(join(conformanceSource, 'index.ts'), join(conformanceCopy, 'index.ts'))
copyFileSync(join(repo, 'packages', 'chart', 'scripts', 'browserShim.ts'), join(conformanceCopy, 'browserShim.ts'))

// 3. The TS gate: the workspace's own tsc binary, the consumer's own node_modules for types. The
//    conformance copy is in the consumer's include list, so it compiles against the packed d.ts
//    with skipLibCheck off like everything else here; the second config emits it for the JS host.
copyFileSync(join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), join(artifacts, 'tsc'))
run(`node ${JSON.stringify(join(repo, 'node_modules', 'typescript', 'bin', 'tsc'))} -p tsconfig.json`, join(here, 'ts-consumer'))
rmSync(join(here, 'js-consumer', 'conformance'), { recursive: true, force: true })
run(`node ${JSON.stringify(join(repo, 'node_modules', 'typescript', 'bin', 'tsc'))} -p tsconfig.conformance.json`, join(here, 'ts-consumer'))

// 4. The runtime gates: both module systems execute.
run('node smoke.mjs', join(here, 'js-consumer'))
run('node smoke.cjs', join(here, 'js-consumer'))

// 5. The conformance suite over the installed tarball: a real widget mounted into a happy-dom
//    document, every check the workspace and app hosts run, through the same module.
run('node conformance.mjs', join(here, 'js-consumer'))

console.log('\nclean-room: ALL GATES PASSED')
