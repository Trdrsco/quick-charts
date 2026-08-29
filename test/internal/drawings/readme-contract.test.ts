// The README is the contract a host mounts from — its TypeScript blocks are executable claims:
// every fenced ```ts block must TYPE-CHECK against the package's real exports. (The same harness
// the chart, broker, order-ticket and account-manager READMEs run.)
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import readme from '../README.md?raw'

const blocks = [...readme.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1]!)

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
  paths: { '@trdrs/chart-drawings': ['src/index.ts'] },
}

const VIRTUAL = `${pkgRoot}/test/__readme_block__.ts`

function diagnosticsFor(source: string): readonly ts.Diagnostic[] {
  const virtualFiles = new Map<string, string>([[VIRTUAL, source]])
  const host = ts.createCompilerHost(compilerOptions)
  const baseReadFile = host.readFile.bind(host)
  const baseFileExists = host.fileExists.bind(host)
  host.readFile = (f) => virtualFiles.get(f) ?? baseReadFile(f)
  host.fileExists = (f) => virtualFiles.has(f) || baseFileExists(f)
  const program = ts.createProgram([VIRTUAL], compilerOptions, host)
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === VIRTUAL)
}

describe('README contract doctests', () => {
  it('the README carries ts blocks to check', () => {
    expect(blocks.length).toBeGreaterThan(0)
  })

  for (const src of blocks) {
    const title = src.trim().split('\n')[0]!.slice(0, 60)
    it(
      `block "${title}…" type-checks against the real exports`,
      () => {
        const diags = diagnosticsFor(src)
        const rendered = diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n')
        expect(rendered).toBe('')
      },
      120_000,
    )
  }
})
