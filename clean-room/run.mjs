// The clean-room gate: prove that a FRESH project, TypeScript or plain JavaScript, can install the
// packed tarball and use it, with no access to this repository's source. A tarball a stranger's
// project cannot import is the failure this script exists to catch before a reader does.
//
//   node clean-room/run.mjs
//
// Steps: build (whose last step packs the candidate) -> copy that one tarball to .artifacts/ ->
// npm-install each consumer (npm, not pnpm: a reader has no workspace, and npm exercises the packed
// manifest exactly as published) -> tsc --noEmit for the TypeScript consumer (skipLibCheck OFF, so
// the shipped declarations must stand alone) -> execute the JavaScript smokes under BOTH module
// systems (import and require) -> run the conformance suite over the installed tarball -> bundle the
// entrypoints with Vite and read the bundles for what a reader's build must not carry.
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const artifacts = join(here, '.artifacts')
const TARBALL = 'quickcharts-0.0.0-staging.tgz'

const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}  (${cwd.replace(repo, '.')})`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

rmSync(artifacts, { recursive: true, force: true })
mkdirSync(artifacts, { recursive: true })

// 1. Build. The build's last step writes the deterministic candidate; the clean room installs that
//    same tarball rather than packing a second one.
run('pnpm run build', repo)
copyFileSync(join(repo, '.candidate', TARBALL), join(artifacts, TARBALL))

// 2. Fresh installs. --install-links copies file: deps instead of symlinking (closer to a real
//    registry install); lockfiles are disposable here, because the point is a cold resolve.
for (const consumer of ['ts-consumer', 'js-consumer', 'vite-consumer']) {
  const dir = join(here, consumer)
  rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
  rmSync(join(dir, 'package-lock.json'), { force: true })
  run('npm install --no-audit --no-fund --install-links', dir)
}

// 2b. The conformance suite rides beside the TypeScript consumer as a copy, so it is typed against
//     the SHIPPED declarations rather than the source, then compiled beside the JavaScript consumer,
//     where its `quickcharts` imports resolve to the installed tarball. The browser shim travels
//     with it. Both copies are ignored by git and remade every run.
const conformanceSource = join(repo, 'test', 'conformance')
const conformanceCopy = join(here, 'ts-consumer', 'conformance')
rmSync(conformanceCopy, { recursive: true, force: true })
mkdirSync(conformanceCopy, { recursive: true })
copyFileSync(join(conformanceSource, 'index.ts'), join(conformanceCopy, 'index.ts'))
copyFileSync(join(repo, 'scripts', 'browserShim.ts'), join(conformanceCopy, 'browserShim.ts'))

// 3. The TypeScript gate: this repository's own tsc binary, the consumer's own node_modules for
//    types. The conformance copy is in the include list, so it compiles against the packed
//    declarations with skipLibCheck off like everything else here; the second config emits it for
//    the JavaScript host.
const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc')
run(`node ${JSON.stringify(tsc)} -p tsconfig.json`, join(here, 'ts-consumer'))
rmSync(join(here, 'js-consumer', 'conformance'), { recursive: true, force: true })
run(`node ${JSON.stringify(tsc)} -p tsconfig.conformance.json`, join(here, 'ts-consumer'))

// 4. The runtime gates: both module systems execute.
run('node smoke.mjs', join(here, 'js-consumer'))
run('node smoke.cjs', join(here, 'js-consumer'))

// 5. The conformance suite over the installed tarball: a real widget mounted into a happy-dom
//    document, every check the source host runs, through the same module.
run('node conformance.mjs', join(here, 'js-consumer'))

// 6. The bundler gate: Vite builds the root, the drawings subpath, the REST adapter and the
//    stylesheet from the installed tarball, then a root-only build, and the consumer reads both
//    bundles for test code, a private host, a source path, and the adapter's absence from the
//    root-only build.
run('node build.mjs', join(here, 'vite-consumer'))

console.log('\nclean-room: ALL GATES PASSED')
