// The README is the B2B contract a third party implements from — so its TypeScript blocks are
// executable claims: every fenced ```ts block must TYPE-CHECK against the package's real exports.
// This is the closure gate for the finding where the README documented a broker method that did not
// exist (an implementer following it wrote a non-compiling adapter). A README edit that drifts from
// the types now breaks the build instead of mis-teaching the first integration.
//
// The README arrives through Vite's `?raw` and the compiler runs on TypeScript's own `ts.sys` — this
// package is browser-typed on purpose, so the test adds no node types to its surface.
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import readme from '../README.md?raw'

const blocks = [...readme.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1]!)

/** This test file's directory, then the package root — derived from the module URL so no node:path.
 *  Decoded (a Windows "Joe D" path URL-encodes its space) and drive-letter-normalized. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const pkgRoot = testDir.replace(/\/test\/?$/, '')

// Examples reference the HOST's own ambient world (its backend, chart handles, UI helpers) and may
// build on each other's exports (block 6 wires the `broker` block 5 defines). The contract under
// test is the package surface, so the host side lives in a GLOBAL ambient d.ts — a separate virtual
// file, so a block's own `export const broker` shadows the global instead of colliding with it —
// loosely typed for scaffolding, while the package's own types stay fully strict.
const AMBIENT_DTS = `
declare const myBackend: any
declare const chart: any
declare const series: any
declare const container: HTMLElement
declare const lastTradePrice: number
declare const nextSnapshot: import('@trdrs/chart').BrokerSnapshot
declare const myPricePolicy: import('@trdrs/chart').PricePolicy
declare const broker: import('@trdrs/chart').ChartBroker
declare const smaDefinition: import('@trdrs/chart').IndicatorDefinition
declare function toast(text: string, undo?: () => void): void
declare function note(msg: string): void
`

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  noEmit: true,
  skipLibCheck: true,
  // Examples show imports a reader goes on to use — unused-symbol lint is not the contract here.
  noUnusedLocals: false,
  noUnusedParameters: false,
  baseUrl: pkgRoot,
  paths: { '@trdrs/chart': ['src/index.ts'] },
}

const VIRTUAL = `${pkgRoot}/test/__readme_block__.ts`
const VIRTUAL_DTS = `${pkgRoot}/test/__readme_ambient__.d.ts`

function diagnosticsFor(source: string): readonly ts.Diagnostic[] {
  const virtualFiles = new Map<string, string>([
    [VIRTUAL, source],
    [VIRTUAL_DTS, AMBIENT_DTS],
  ])
  const host = ts.createCompilerHost(compilerOptions, true)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (f) => virtualFiles.get(f) ?? readFile(f)
  host.fileExists = (f) => virtualFiles.has(f) || fileExists(f)
  host.getSourceFile = (f, langVersion, onError, shouldCreate) => {
    const v = virtualFiles.get(f)
    return v !== undefined ? ts.createSourceFile(f, v, ts.ScriptTarget.ES2022, true) : getSourceFile(f, langVersion, onError, shouldCreate)
  }
  const program = ts.createProgram([VIRTUAL_DTS, VIRTUAL], compilerOptions, host)
  const sf = program.getSourceFile(VIRTUAL)
  if (!sf) throw new Error(`the virtual block file did not load: ${VIRTUAL}`)
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
}

const label = (src: string) => src.trimStart().slice(0, 60).replace(/\s+/g, ' ')

describe('README contract doctests', () => {
  it('the README carries its example set', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(5)
  })

  it('the doctest harness itself catches a drifted example (negative control)', () => {
    const drifted = `
      import type { ChartBroker } from '@trdrs/chart'
      export const broker: ChartBroker = {
        async setProtectiveStop() {}, // the method the README once documented — it does not exist
      }
    `
    expect(diagnosticsFor(drifted).length).toBeGreaterThan(0)
  })

  it.each(blocks.map((src) => [label(src), src] as const))(
    'block "%s…" type-checks against the real exports',
    (_name, src) => {
      const diags = diagnosticsFor(src)
      const rendered = diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n---\n')
      expect(rendered).toBe('')
    },
    60_000,
  )
})
