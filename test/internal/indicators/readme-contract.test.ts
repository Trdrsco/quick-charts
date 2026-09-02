// The README is the maintainer contract for this seam, so its TypeScript blocks are executable
// claims: every fenced ```ts block must TYPE-CHECK against the package's real exports. The README
// arrives through Vite's `?raw` and the compiler runs on TypeScript's own `ts.sys`; this package is
// browser-typed, so the test adds no node types to its surface.
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import readme from '../README.md?raw'

const blocks = [...readme.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1]!)

/** This test file's directory, then the package root, derived from the module URL so no node:path.
 *  Decoded (a Windows "Joe D" path URL-encodes its space) and drive-letter-normalized. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const pkgRoot = testDir.replace(/\/test\/?$/, '')

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
  baseUrl: pkgRoot,
  paths: { '@trdrs/chart-indicators': ['src/index.ts'] },
}

const VIRTUAL = `${pkgRoot}/test/__readme_block__.ts`

function diagnosticsFor(source: string): readonly ts.Diagnostic[] {
  const host = ts.createCompilerHost(compilerOptions, true)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (f) => (f === VIRTUAL ? source : readFile(f))
  host.fileExists = (f) => f === VIRTUAL || fileExists(f)
  host.getSourceFile = (f, langVersion, onError, shouldCreate) =>
    f === VIRTUAL ? ts.createSourceFile(f, source, ts.ScriptTarget.ES2022, true) : getSourceFile(f, langVersion, onError, shouldCreate)
  const program = ts.createProgram([VIRTUAL], compilerOptions, host)
  const sf = program.getSourceFile(VIRTUAL)
  if (!sf) throw new Error(`the virtual block file did not load: ${VIRTUAL}`)
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
}

const label = (src: string) => src.trimStart().slice(0, 60).replace(/\s+/g, ' ')

describe('README contract doctests', () => {
  it('the README carries its example', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(1)
  })

  it('the doctest harness itself catches a drifted example (negative control)', () => {
    const drifted = `
      import { builtInIndicator } from '@trdrs/chart-indicators'
      builtInIndicator('rsi')!.render() // a method the contract does not carry
    `
    expect(diagnosticsFor(drifted).length).toBeGreaterThan(0)
  })

  it.each(blocks.map((src) => [label(src), src] as const))(
    'block "%s" type-checks against the real exports',
    (_name, src) => {
      const diags = diagnosticsFor(src)
      const rendered = diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n---\n')
      expect(rendered).toBe('')
    },
    60_000,
  )
})
