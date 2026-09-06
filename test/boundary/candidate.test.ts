// The candidate pack: the tarball the web app installs, the clean room installs, and a release
// rehearsal publishes, read back the way each of them meets it. scripts/pack-candidate.mjs writes
// `.candidate` as the last step of every build; this fixture opens the tarball with its own reader,
// so the archive is judged by what a consumer's extractor sees rather than by what the packer meant
// to write, and holds it to the committed pin in test/fixtures/candidate-manifest.json.
//
// The candidate blocks are vacuous until a build has run, the shape the other dist fixtures use;
// `pnpm check:packages` is the gate that fails when the candidate is absent. The determinism block
// packs twice more into scratch directories through the packer's `--out` and compares byte for
// byte, so it needs no candidate on disk and is never vacuous.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import pin from '../fixtures/candidate-manifest.json'
import { CHART_DIR, packedFileList } from './scan'

const candidateDir = `${CHART_DIR}/.candidate`
const built = existsSync(`${candidateDir}/manifest.json`)

interface CandidateManifest {
  name: string
  version: string
  tarball: { name: string; bytes: number; sha256: string; tarSha256: string }
  files: Record<string, { bytes: number; sha256: string }>
}

interface Entry {
  name: string
  mode: number
  uid: number
  gid: number
  mtime: number
  type: string
  content: Buffer
}

/** 1985-10-26T08:15:00Z, the one modification time every entry carries. */
const ENTRY_MTIME = Math.floor(Date.UTC(1985, 9, 26, 8, 15, 0) / 1000)

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

const readManifest = (): CandidateManifest => JSON.parse(readFileSync(`${candidateDir}/manifest.json`, 'utf8')) as CandidateManifest

/** Every file under the extracted package, as package-relative posix paths, sorted. */
function extractedFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(join(dir, name)).isDirectory()) out.push(...extractedFiles(join(dir, name), rel))
    else out.push(rel)
  }
  return out.sort()
}

/** A ustar reader as narrow as the archive: regular files in 512-byte blocks, the ustar prefix
 *  honoured, the archive ended by an empty block. */
function readTar(tar: Buffer): Entry[] {
  const out: Entry[] = []
  let at = 0
  const field = (block: Buffer, offset: number, length: number): string => block.toString('utf8', offset, offset + length).replace(/\0[\s\S]*$/, '')
  const octal = (block: Buffer, offset: number, length: number): number => parseInt(field(block, offset, length).trim() || '0', 8)
  while (at + 512 <= tar.length) {
    const block = tar.subarray(at, at + 512)
    if (block.every((b) => b === 0)) break
    const prefix = field(block, 345, 155)
    const base = field(block, 0, 100)
    const size = octal(block, 124, 12)
    out.push({
      name: prefix ? `${prefix}/${base}` : base,
      mode: octal(block, 100, 8),
      uid: octal(block, 108, 8),
      gid: octal(block, 116, 8),
      mtime: octal(block, 136, 12),
      type: field(block, 156, 1) || '0',
      content: tar.subarray(at + 512, at + 512 + size),
    })
    at += 512 + Math.ceil(size / 512) * 512
  }
  return out
}

const ROOT_DOCUMENTS = ['CHANGELOG.md', 'LICENSE', 'README.md', 'THIRD-PARTY-NOTICES.md', 'package.json']

describe('the candidate pack is wired', () => {
  it('runs as the last step of every build, and can be run alone', () => {
    expect(manifest.scripts['pack:candidate']).toBe('node scripts/pack-candidate.mjs')
    expect(manifest.scripts.postbuild.endsWith(' && node scripts/pack-candidate.mjs')).toBe(true)
  })
})

describe('the candidate carries exactly the published file set', () => {
  it('lists the files npm would pack from the manifest, and the same files are on disk', () => {
    if (!built) return
    const files = Object.keys(readManifest().files)
    expect(files).toEqual([...files].sort())
    expect(files).toEqual(packedFileList())
    expect(extractedFiles(`${candidateDir}/package`)).toEqual(files)
  })

  it('carries dist without the guest, the four documents and the manifest, and nothing from src, test, scripts or guest', () => {
    if (!built) return
    for (const path of Object.keys(readManifest().files)) {
      const allowed = ROOT_DOCUMENTS.includes(path) || (path.startsWith('dist/') && !path.startsWith('dist/guest/'))
      expect(allowed, path).toBe(true)
    }
  })

  it('points every published export at a file it carries', () => {
    if (!built) return
    const packed = JSON.parse(readFileSync(`${candidateDir}/package/package.json`, 'utf8')) as { exports: Record<string, string | { types: string; import: string }>; publishConfig?: Record<string, unknown> }
    expect(packed.exports).toEqual(manifest.publishConfig.exports)
    expect(packed.publishConfig).not.toHaveProperty('exports')
    const files = new Set(Object.keys(readManifest().files))
    for (const entry of Object.values(packed.exports)) {
      for (const file of typeof entry === 'string' ? [entry] : [entry.types, entry.import]) expect(files.has(file.replace(/^\.\//, '')), file).toBe(true)
    }
    expect(JSON.stringify(packed)).not.toContain('workspace:')
  })
})

describe('the tarball is what the directory and the manifest say', () => {
  it('holds one regular file per manifest entry, in manifest order, with the same bytes', () => {
    if (!built) return
    const record = readManifest()
    const tar = gunzipSync(readFileSync(`${candidateDir}/${record.tarball.name}`))
    expect(sha256(tar)).toBe(record.tarball.tarSha256)
    const entries = readTar(tar)
    expect(entries.map((e) => e.name)).toEqual(Object.keys(record.files).map((p) => `package/${p}`))
    for (const entry of entries) {
      const path = entry.name.slice('package/'.length)
      expect(entry.type, path).toBe('0')
      expect(sha256(entry.content), path).toBe(record.files[path]!.sha256)
      expect(entry.content.length, path).toBe(record.files[path]!.bytes)
      expect(entry.content.equals(readFileSync(`${candidateDir}/package/${path}`)), path).toBe(true)
    }
  })

  it('stamps no clock, owner or group on any entry', () => {
    if (!built) return
    const record = readManifest()
    for (const entry of readTar(gunzipSync(readFileSync(`${candidateDir}/${record.tarball.name}`)))) {
      expect(entry.mtime, entry.name).toBe(ENTRY_MTIME)
      expect(entry.mode, entry.name).toBe(0o644)
      expect(entry.uid, entry.name).toBe(0)
      expect(entry.gid, entry.name).toBe(0)
    }
  })

  it('names the tarball after the package and its version, and hashes what it wrote', () => {
    if (!built) return
    const record = readManifest()
    expect(record.name).toBe(manifest.name)
    expect(record.version).toBe(manifest.version)
    expect(record.tarball.name).toBe(`${manifest.name}-${manifest.version}.tgz`)
    const tgz = readFileSync(`${candidateDir}/${record.tarball.name}`)
    expect(sha256(tgz)).toBe(record.tarball.sha256)
    expect(tgz.length).toBe(record.tarball.bytes)
  })
})

describe('the packed files carry nothing of the machine that built them', () => {
  const machine = [CHART_DIR, CHART_DIR.replace(/\//g, '\\'), 'file:///']

  it('writes one newline and no checkout path into any file', () => {
    if (!built) return
    for (const path of Object.keys(readManifest().files)) {
      const text = readFileSync(`${candidateDir}/package/${path}`, 'utf8')
      expect(text.includes('\r'), `${path} carries a carriage return`).toBe(false)
      for (const m of machine) expect(text.includes(m), `${path} names ${m}`).toBe(false)
    }
  })

  it('keeps every source map relative, with its embedded sources normalized', () => {
    if (!built) return
    const maps = Object.keys(readManifest().files).filter((p) => p.endsWith('.map'))
    expect(maps.length).toBeGreaterThan(0)
    for (const path of maps) {
      const map = JSON.parse(readFileSync(`${candidateDir}/package/${path}`, 'utf8')) as { sources: string[]; sourcesContent?: string[]; sourceRoot?: string }
      expect(map.sourceRoot ?? '').toBe('')
      for (const source of map.sources) expect(source, `${path}: ${source}`).toMatch(/^\.\.\//)
      for (const source of map.sourcesContent ?? []) expect(source.includes('\r'), `${path} embeds a carriage return`).toBe(false)
    }
  })
})

describe('the candidate matches the committed pin', () => {
  it('carries the pinned file list, the pinned hash of every file, and the pinned tar stream', () => {
    if (!built) return
    const record = readManifest()
    const files = Object.fromEntries(Object.entries(record.files).map(([path, { sha256: hash }]) => [path, hash]))
    expect(files).toEqual(pin.files)
    expect(record.tarball.tarSha256).toBe(pin.tarSha256)
  })
})

describe('the candidate pack is deterministic', () => {
  it('packs the same bytes twice', { timeout: 120_000 }, () => {
    const a = mkdtempSync(join(tmpdir(), 'qc-candidate-a-'))
    const b = mkdtempSync(join(tmpdir(), 'qc-candidate-b-'))
    try {
      for (const out of [a, b]) execFileSync(process.execPath, ['scripts/pack-candidate.mjs', `--out=${out}`], { cwd: CHART_DIR, stdio: 'pipe' })
      const tarballName = `${manifest.name}-${manifest.version}.tgz`
      expect(readdirSync(a).sort()).toEqual(['manifest.json', 'package', tarballName])
      expect(readFileSync(join(a, tarballName)).equals(readFileSync(join(b, tarballName)))).toBe(true)
      expect(readFileSync(join(a, 'manifest.json'), 'utf8')).toBe(readFileSync(join(b, 'manifest.json'), 'utf8'))
      expect(extractedFiles(join(a, 'package'))).toEqual(extractedFiles(join(b, 'package')))
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })
})
