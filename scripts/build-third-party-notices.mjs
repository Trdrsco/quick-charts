#!/usr/bin/env node
// The third-party notices of the packed artifact, as a generated document.
//
//   THIRD-PARTY-NOTICES.md   one section per package in the dependency closure of what a consumer
//                            installs: the peer the manifest names, and every package that peer
//                            pulls in, walked through the installed tree. Each section carries the
//                            package's license identifier, its copyright line, and its license text,
//                            read from the installed package when it ships them and otherwise from
//                            the record REPOSITORY_STATEMENTS keeps of what the package's own
//                            repository states.
//
// It runs from `pnpm --filter quickcharts build:notices`, and `postbuild` runs it for every build,
// so the committed document never lags a peer bump. The document is RENDERED from the installed
// packages rather than written by hand, which is what makes it impossible to list a dependency the
// artifact does not have or to drop one it gained; test/boundary/thirdPartyNotices.test.ts compares
// the committed file with the same rendering (`--check` here) and fails on drift.
//
// The internal source modules the build inlines are first-party code under the package's own
// license and are not third parties; the closure starts from the manifest's dependency edges, which
// is what a consumer's installer follows.
//
//   node scripts/build-third-party-notices.mjs            write THIRD-PARTY-NOTICES.md
//   node scripts/build-third-party-notices.mjs --check    exit 1 when the committed file differs
//   node scripts/build-third-party-notices.mjs --stdout   print the rendering
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.md'

/** What a package's own repository states when its npm tarball ships no license text or notice
 *  file. Every entry names where the statement was read, keyed by the exact version it was read
 *  for: a version bump makes the rendering fail loudly (see `statementFor`) until someone re-reads
 *  the repository, which is the point. */
export const REPOSITORY_STATEMENTS = {
  'lightweight-charts@5.2.0': {
    /** The repository's NOTICE file, reproduced character for character (the copyright sign is
     *  the Cyrillic letter the file uses). The npm tarball packs only `dist`, so the notice is
     *  carried from the repository. */
    notice: 'TradingView Lightweight Charts™\nCopyright (с) 2025 TradingView, Inc. https://www.tradingview.com/',
    noticeSource: 'https://github.com/tradingview/lightweight-charts/blob/master/NOTICE',
    /** The README's attribution requirement, stated in our words with the two obligations it
     *  names: the notice text and a link. */
    attribution: true,
  },
  'fancy-canvas@2.1.0': {
    /** The tarball carries the manifest and the modules and no license file; the repository's
     *  LICENSE is the MIT text under this copyright line. */
    copyright: 'Copyright (c) 2019 TradingView, Inc',
    license: 'MIT',
    licenseSource: 'https://github.com/tradingview/fancy-canvas/blob/master/LICENSE',
    /** The manifest names no repository either. */
    repository: 'https://github.com/tradingview/fancy-canvas',
  },
}

/** The MIT license text, for a package whose repository states MIT and whose tarball ships no
 *  copy. The copyright line comes from the repository statement. */
const MIT_TEXT = (copyright) => `${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/** The installed directory of `name` as resolved from `fromDir`, the way the consumer's module
 *  resolution finds it. `package.json` is the one file every package exports. */
function installedDir(name, fromDir) {
  const require = createRequire(join(fromDir, 'noop.js'))
  try {
    return dirname(require.resolve(`${name}/package.json`))
  } catch {
    // A package whose exports map hides package.json still has the directory on the path.
    const entry = require.resolve(name)
    let dir = dirname(entry)
    while (!existsSync(join(dir, 'package.json')) || readJson(join(dir, 'package.json')).name !== name) {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`cannot locate the installed directory of ${name}`)
      dir = parent
    }
    return dir
  }
}

/** The file in `dir` whose name is LICENSE, LICENCE or COPYING with any extension, or null. */
function licenseFile(dir) {
  const hit = readdirSync(dir).find((f) => /^(LICEN[CS]E|COPYING)(\..*)?$/i.test(f))
  return hit ? join(dir, hit) : null
}

/** The dependency closure a consumer installs: the manifest's `dependencies` and
 *  `peerDependencies`, then every installed package's own `dependencies`, each resolved from the
 *  directory of the package that depends on it. Sorted by name. */
export function shippedClosure(root = pkgRoot) {
  const manifest = readJson(join(root, 'package.json'))
  const seen = new Map()
  const visit = (name, fromDir, via) => {
    if (seen.has(name)) return
    const dir = installedDir(name, fromDir)
    const pkg = readJson(join(dir, 'package.json'))
    seen.set(name, { name, version: pkg.version, dir, pkg, via })
    for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) visit(dep, dir, `${name}@${pkg.version}`)
  }
  for (const name of Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) }).sort()) {
    visit(name, root, manifest.peerDependencies?.[name] ? 'peer' : 'dependency')
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The repository statement recorded for exactly this package version. A statement recorded for
 *  another version of the same package is a stale record, and the rendering says so rather than
 *  quoting last version's copyright line. */
function statementFor(entry) {
  const exact = REPOSITORY_STATEMENTS[`${entry.name}@${entry.version}`]
  if (exact) return exact
  const stale = Object.keys(REPOSITORY_STATEMENTS).find((key) => key.startsWith(`${entry.name}@`))
  if (stale) {
    throw new Error(
      `${NOTICES_FILE}: REPOSITORY_STATEMENTS records ${stale} but ${entry.name}@${entry.version} is installed; ` +
        `re-read that package's repository and record the statement for the installed version`,
    )
  }
  return null
}

/** The copyright line of a license text: the first line that is a copyright statement (the word,
 *  then a sign or a year), which skips the license body's own sentences about copyright. */
const copyrightLine = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^Copyright\s+(\(c\)|©|\d{4})/i.test(l)) ?? null

/** One package's facts, resolved from its installed files first and its repository statement
 *  second. Throws when neither gives a license text or a copyright line, because a notice with a
 *  hole is not a notice. */
export function noticeFor(entry) {
  const statement = statementFor(entry)
  const file = licenseFile(entry.dir)
  const licenseText = file ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '') : null
  const license = entry.pkg.license ?? statement?.license
  if (!license) throw new Error(`${entry.name}@${entry.version} declares no license and no repository statement records one`)
  if (statement?.license && statement.license !== license) {
    throw new Error(`${entry.name}@${entry.version} declares ${license} but REPOSITORY_STATEMENTS records ${statement.license}`)
  }
  const copyright = statement?.copyright ?? (licenseText ? copyrightLine(licenseText) : null)
  if (!copyright) throw new Error(`${entry.name}@${entry.version}: no copyright line in its license file and none recorded`)
  let text = licenseText
  let textSource = file ? `the package's own ${file.slice(entry.dir.length + 1)} file` : null
  if (!text) {
    if (license === 'MIT') text = MIT_TEXT(copyright)
    else throw new Error(`${entry.name}@${entry.version} ships no license text and no rendering is recorded for ${license}`)
    textSource = statement?.licenseSource ?? null
    if (!textSource) throw new Error(`${entry.name}@${entry.version}: a repository statement must name where its license was read`)
  }
  const declared = typeof entry.pkg.repository === 'string' ? entry.pkg.repository : entry.pkg.repository?.url
  const repository = declared ?? statement?.repository
  return {
    name: entry.name,
    version: entry.version,
    via: entry.via,
    license,
    copyright,
    text,
    textSource,
    repository: repository?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null,
    notice: statement?.notice ?? null,
    noticeSource: statement?.noticeSource ?? null,
    attribution: statement?.attribution === true,
  }
}

/** The document. Deterministic: same installed tree, same bytes. */
export function renderThirdPartyNotices(root = pkgRoot) {
  const manifest = readJson(join(root, 'package.json'))
  const notices = shippedClosure(root).map(noticeFor)
  const peers = notices.filter((n) => n.via === 'peer')
  const transitive = notices.filter((n) => n.via !== 'peer')

  const out = []
  out.push(`# Third-party notices for ${manifest.name}`)
  out.push('')
  out.push(
    `This document lists every third-party package in the dependency closure of \`${manifest.name}\`, with the license ` +
      'and copyright statement each package publishes. It is generated from the installed packages by ' +
      '`scripts/build-third-party-notices.mjs` on every build.',
  )
  out.push('')
  out.push(
    `\`${manifest.name}\` bundles no third-party code. It declares ${peers.length === 1 ? 'one peer dependency' : `${peers.length} peer dependencies`} ` +
      'that your application installs and bundles' +
      (transitive.length ? `, and ${transitive.length === 1 ? 'that peer installs one package of its own' : 'those peers install packages of their own'}` : '') +
      '. Because your application bundle redistributes these packages, their license conditions attach to your product; ' +
      'this document tells you what each one asks for.',
  )
  out.push('')
  out.push('| Package | Version | License | Reached through |')
  out.push('|---|---|---|---|')
  for (const n of notices) out.push(`| \`${n.name}\` | ${n.version} | ${n.license} | ${n.via === 'peer' ? 'peer dependency' : `\`${n.via}\``} |`)
  out.push('')
  for (const n of notices) {
    out.push(`## ${n.name} ${n.version}`)
    out.push('')
    const facts = [`License: ${n.license}`, n.repository ? `Repository: ${n.repository}` : null, `Copyright: ${n.copyright}`].filter(Boolean)
    for (const f of facts) out.push(`- ${f}`)
    out.push('')
    if (n.attribution) {
      out.push(
        'The package README states an attribution requirement beside the license: present the text of its NOTICE file and a link ' +
          'to https://www.tradingview.com/ on a page of your website or application that your users can reach. The package\'s ' +
          '`attributionLogo` chart option is one documented way to satisfy the link.',
      )
      out.push('')
    }
    if (n.notice) {
      out.push(`The NOTICE file of ${n.name} ${n.version}, reproduced verbatim from ${n.noticeSource}:`)
      out.push('')
      out.push('```')
      out.push(n.notice)
      out.push('```')
      out.push('')
    }
    out.push(`The license text${n.textSource?.startsWith('http') ? `, as the repository states it at ${n.textSource}` : `, from ${n.textSource}`}:`)
    out.push('')
    out.push('```')
    out.push(n.text)
    out.push('```')
    out.push('')
  }
  out.push('trdrs is not affiliated with, sponsored by, or endorsed by TradingView, Inc.')
  out.push('')
  return out.join('\n')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const rendered = renderThirdPartyNotices()
  const target = join(pkgRoot, NOTICES_FILE)
  if (process.argv.includes('--stdout')) {
    process.stdout.write(rendered)
  } else if (process.argv.includes('--check')) {
    const committed = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : ''
    if (committed !== rendered) {
      console.error(`quickcharts: ${NOTICES_FILE} differs from the rendering; run \`pnpm --filter quickcharts build:notices\``)
      process.exit(1)
    }
    console.log(`quickcharts: ${NOTICES_FILE} matches the rendering`)
  } else {
    writeFileSync(target, rendered)
    console.log(`quickcharts: wrote ./${NOTICES_FILE}`)
  }
}
