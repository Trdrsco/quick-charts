// The supply-chain checker's own proof: every rule reports a seeded value from a fixture tree, the
// packed list and the history are judged as the tree is, an exact-file exclusion silences exactly
// that file and rule, and anything looser than an exact existing file is refused as configuration.
// The fixture is a temporary directory with its own git repository, so the test never reads the
// real package, the real tarball or the real history.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigError, EXCLUSIONS, HISTORY_EXCLUSIONS, RULES, check, historyLines, walk } from '../check-supply-chain.mjs'

let root: string

function write(rel: string, text: string) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, text)
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com' } })

/** The real exclusions name real files; the fixture has none of them, so every test writes the
 *  files the exclusions name (empty) to keep `validate` honest about existence. */
function seedExclusionTargets() {
  for (const [file] of EXCLUSIONS) write(file, '')
}

const noPacked = { packed: () => [] as string[], history: () => [] as ReturnType<typeof historyLines> }
const keys = (hits: { file: string; line: number; rule: string }[]) => hits.map((h) => `${h.file}:${h.line}:${h.rule}`).sort()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'supply-chain-'))
  seedExclusionTargets()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('each rule reports its seeded value from the tree', () => {
  it('secret: keys, tokens, key blocks and dotenv assignments', () => {
    write('src/a.ts', [
      "const key = 'trdrs_sk_abc123'",
      "const stripe = 'sk_live_0123456789abcdef'",
      "headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload' }",
      '-----BEGIN RSA PRIVATE KEY-----',
      'AKIAABCDEFGHIJKLMNOP',
      'ENGINE_API_KEY=supersecretvalue',
      "const SYMBOL_KEY = 'quickcharts.symbol.v1'", // a storage key constant is not a credential
    ].join('\n'))
    const { hits } = check(root, noPacked)
    expect(hits.every((h) => h.rule === 'secret')).toBe(true)
    expect(hits.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('never prints a credential whole', () => {
    write('src/a.ts', "const t = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'")
    const { hits } = check(root, noPacked)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).not.toContain('eyJzdWIiOiIxMjM0NTY3ODkwIn0')
    expect(hits[0]!.text).toMatch(/\.\.\.$/)
  })

  it('pii: an e-mail outside the example domains, and a user home path', () => {
    write('README.md', 'Write to someone@company.io, or to support@example.com.\nBuilt at C:\\Users\\Someone\\repo and /Users/someone/repo and /home/someone/repo.\n')
    const { hits } = check(root, noPacked)
    expect(keys(hits)).toEqual(['README.md:1:pii', 'README.md:2:pii'])
    expect(hits[0]!.text).toContain('someone@company.io')
    expect(hits[0]!.text).not.toContain('support@example.com')
  })

  it('private-host: trdrs domains, Fly and private DNS hosts, and the local engine port', () => {
    write('clean-room/js-consumer/smoke.mjs', [
      "fetch('https://app.trdrs.co/api')",
      "fetch('https://trdrsco-engine.fly.dev/')",
      "fetch('http://trdrs-engine.internal:8080/')",
      "fetch('http://localhost:8080/api')",
      "fetch('https://feed.example.com/udf')",
    ].join('\n'))
    const { hits } = check(root, noPacked)
    expect(hits.every((h) => h.rule === 'private-host')).toBe(true)
    // A Fly host under the trdrs name is both a trdrs domain and a Fly host, so line 2 reports twice.
    expect([...new Set(hits.map((h) => h.line))]).toEqual([1, 2, 3, 4])
  })

  it('proprietary: a private package in what a consumer receives, not in the source the build inlines', () => {
    write('src/index.ts', "export * from './internal/drawings/index'\n")
    write('test/a.test.ts', "import '@trdrs/chart-drawings'\n")
    write('dist/index.js', "import '@trdrs/broker'\n")
    write('README.md', 'Install `@trdrs/chart-engine` beside it.\n')
    write('package.json', JSON.stringify({ name: 'quickcharts', dependencies: { '@trdrs/broker': 'workspace:^' }, devDependencies: { '@trdrs/chart-drawings': 'workspace:^' } }))
    const { hits } = check(root, noPacked)
    // The manifest is judged structurally: the devDependency the build inlines is not a finding,
    // and the installable block is reported once, not per line of text.
    expect(keys(hits)).toEqual(['README.md:1:proprietary', 'dist/index.js:1:proprietary', 'package.json:0:proprietary'])
    expect(hits.find((h) => h.file.endsWith('package.json'))?.what).toBe('dependencies names @trdrs/broker')
  })

  it('proprietary is a present-tense rule: a private name in an old README revision is not a leak', () => {
    const history = [{ commit: 'b'.repeat(40), file: 'README.md', line: 1, text: "import { mount } from '@trdrs/account-manager'" }]
    expect(check(root, { packed: () => [], history: () => history }).hits).toEqual([])
  })
})

describe('the packed list and the history are judged as the tree is', () => {
  it('reads every packed file from disk, judges a source map by the paths it names, and refuses a packed file that is not there', () => {
    write('dist/index.js', "const url = 'https://api.trdrs.co'\n")
    const map = { sources: ['../src/a.ts', 'C:\\Users\\someone\\repo\\src\\b.ts'], sourcesContent: ["const url = 'https://api.trdrs.co'"] }
    write('dist/index.js.map', JSON.stringify(map))
    const { hits, packed } = check(root, { packed: () => ['dist/index.js', 'dist/index.js.map'], history: () => [] })
    expect(packed).toBe(2)
    expect(keys(hits)).toEqual(['dist/index.js.map:4:pii', 'dist/index.js:1:private-host'])
    expect(() => check(root, { packed: () => ['dist/missing.js'], history: () => [] })).toThrow(/not on disk/)
  })

  it('finds a value in a commit that later removed it, and names the commit', () => {
    git('init', '-q')
    write('src/a.ts', "const url = 'http://localhost:8080/api/market'\n")
    git('add', '-A')
    git('commit', '-q', '-m', 'seed')
    write('src/a.ts', "const url = baseUrl\n")
    git('add', '-A')
    git('commit', '-q', '-m', 'remove')
    const added = historyLines(root)
    expect(added.map((l) => l.text)).toEqual(["const url = baseUrl", "const url = 'http://localhost:8080/api/market'"])
    const { hits } = check(root, { packed: () => [], history: () => added })
    expect(keys(hits)).toEqual(['src/a.ts:1:private-host'])
    expect(hits[0]!.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reads the history of the whole repository, because the whole repository is the package', () => {
    git('init', '-q')
    write('clean-room/ts-consumer/a.ts', "const url = 'http://localhost:8080'\n")
    write('src/b.ts', 'export const b = 1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'seed')
    expect(historyLines(root).map((l) => l.file).sort()).toEqual(['clean-room/ts-consumer/a.ts', 'src/b.ts'])
  })
})

describe('exclusions', () => {
  it('an exact-file exclusion silences that file and rule alone, in the tree and in history', () => {
    // The one file excluded for exactly one rule: the Vite consumer, for the hosts it forbids.
    const [file, rule] = EXCLUSIONS.find(([f]) => EXCLUSIONS.filter(([g]) => g === f).length === 1)!
    expect(rule).toBe('private-host')
    write(file, 'http://localhost:8080\nContact: someone@company.io\n')
    write('src/other.ts', 'someone@company.io\n')
    const history = [{ commit: 'a'.repeat(40), file, line: 1, text: "fetch('http://localhost:8080')" }]
    const { hits } = check(root, { packed: () => [], history: () => history })
    expect(keys(hits)).toEqual([`${file}:2:pii`, 'src/other.ts:1:pii'].sort())
  })

  it('every real exclusion names an existing file, a known rule and a reason', () => {
    for (const [file, rule, reason] of EXCLUSIONS) {
      expect(file).not.toMatch(/[*?[\]{}]/)
      expect(RULES.some((r) => r.id === rule), `${file}: ${rule}`).toBe(true)
      expect(reason.trim().length, file).toBeGreaterThan(0)
    }
  })

  it('every history exclusion names one commit, one path, a known rule and a reason, and this repository knows it', () => {
    const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
    for (const [commit, file, rule, reason] of HISTORY_EXCLUSIONS) {
      expect(commit, file).toMatch(/^[0-9a-f]{40}$/)
      expect(RULES.some((r) => r.id === rule), `${file}: ${rule}`).toBe(true)
      expect(reason.trim().length, file).toBeGreaterThan(0)
      expect(() => execFileSync('git', ['cat-file', '-e', `${commit}:${file}`], { cwd: repo, stdio: 'ignore' }), `${file} at ${commit}`).not.toThrow()
    }
  })

  it('refuses an exclusion whose file is missing', () => {
    rmSync(join(root, EXCLUSIONS[0]![0]), { force: true })
    expect(() => check(root, noPacked)).toThrow(ConfigError)
    expect(() => check(root, noPacked)).toThrow(/does not exist/)
  })
})

describe('the walk', () => {
  it('reads text files and source maps from the root down, never installed trees', () => {
    write('node_modules/x/index.js', '')
    write('dist/index.js', '')
    write('dist/index.js.map', '')
    write('src/a.ts', '')
    write('LICENSE', '')
    write('clean-room/.artifacts/pkg.tgz', '')
    write('clean-room/ts-consumer/a.ts', '')
    expect(walk(root, '.').filter((f) => !EXCLUSIONS.some(([e]) => e === f))).toEqual([
      'clean-room/ts-consumer/a.ts',
      'dist/index.js',
      'dist/index.js.map',
      'LICENSE',
      'src/a.ts',
    ])
  })
})
