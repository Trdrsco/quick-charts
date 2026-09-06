// The documentation gate: `node scripts/check-docs.mjs`, run by the gate and by CI.
//
// Quick Charts is read before it is installed, so its documents are held to the same three rules
// the package itself is held to:
//
//   documents   the documents a reader expects are present, and none is empty
//   links       every relative Markdown link resolves to a file in this repository
//   vocabulary  client-facing documentation states the present contract in its own words: no
//               product history, no marketing phrase, no reference product, no private host or
//               credential, no em dash, no emoji
//
// Exclusions are exact files with a reason, never a directory or a glob, and a listed file that no
// longer exists is a configuration error (exit 2), so an exclusion cannot outlive its subject.
//
// Output: `docs OK: ...` and exit 0; otherwise one `file:line: [rule] message` per finding.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The documents a reader expects at the root of this repository. */
const REQUIRED = [
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'NOTICE',
  'THIRD-PARTY-NOTICES.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'SUPPORT.md',
  'RELEASING.md',
]

/** Client-facing vocabulary. `where` limits a rule to changelogs, where removal and rename
 *  narrative is the specific failure: this changelog begins with the first public release. */
const VOCABULARY = [
  {
    id: 'history',
    re: /\b(now free|previously|formerly|no longer)\b|\bmigrat(e|es|ed|ing|ion|ions)\b/i,
    message: 'narrates product history; state the present contract (no migration or removal notes before a released contract)',
  },
  {
    id: 'history',
    where: 'CHANGELOG',
    re: /\bBREAKING\b|\b(renamed|removed|deprecated)\b|\bis now\b/i,
    message: 'changelog narrates a change nobody received; the changelog begins with the first public release',
  },
  {
    id: 'jargon',
    re: /\b(seamless(ly)?|robust(ly|ness)?|whether you are)\b|\bleverag(e|es|ing)\s+(the|your|our|a|an|its|this|these)\b/i,
    message: 'marketing phrase the style guide forbids',
  },
  { id: 'link-text', re: /\bclick here\b/i, message: 'link with the destination name, never "click here"' },
  {
    id: 'reference-product',
    re: /\bLightweight Charts\b|\bCharting Library\b/,
    message: 'names a reference product; describe our product in our words',
  },
  {
    id: 'private-host',
    re: /\btrdrs\.co\b|\btrdrsco[\w-]*\.fly\.dev\b|\blocalhost:8080\b|127\.0\.0\.1:8080|trdrs_sk_/,
    message: 'a trdrs host, credential or engine default in client-facing documentation',
  },
  { id: 'private-package', re: /@trdrs\//, message: 'a private package name; a reader installs quickcharts and nothing else of ours' },
  { id: 'em-dash', re: /—/, message: 'em dash; rewrite the sentence' },
  // The copyright, registered and trademark signs are pictographic to Unicode but are legal text.
  { id: 'emoji', re: /(?![©®™])\p{Extended_Pictographic}/u, message: 'emoji' },
]

/** Exact files that carry a forbidden shape on purpose: [file, rule, reason]. */
const EXCLUSIONS = [
  ['THIRD-PARTY-NOTICES.md', 'reference-product', 'the notices quote each package license as its repository states it'],
  ['NOTICE', 'reference-product', 'the notice attributes the peer dependency the license asks it to name'],
  ['README.md', 'emoji', 'the drawings example arms the emoji tool and shows the glyph it seeds the placement with'],
]

class ConfigError extends Error {}

const toPosix = (p) => p.replace(/\\/g, '/')

/** Every Markdown document and the two license-shaped documents, as repository-relative paths. */
function documents() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(toPosix)
  return tracked.filter((f) => f.endsWith('.md') || f === 'LICENSE' || f === 'NOTICE')
}

function validate() {
  for (const [file, rule, reason] of EXCLUSIONS) {
    if (/[*?[\]{}]/.test(file)) throw new ConfigError(`EXCLUSIONS names a glob, ${file}; name one exact file (${reason})`)
    if (!existsSync(join(repo, file))) throw new ConfigError(`EXCLUSIONS names ${file}, which does not exist; delete the exclusion (${reason})`)
    if (!VOCABULARY.some((r) => r.id === rule)) throw new ConfigError(`EXCLUSIONS names unknown rule ${rule} for ${file}`)
    if (!reason || !reason.trim()) throw new ConfigError(`EXCLUSIONS gives ${file} no reason`)
  }
}

const excluded = (file, rule) => EXCLUSIONS.some(([f, r]) => f === file && r === rule)

/** Every relative Markdown link target in `text`: `[label](target)`, anchors and code fences aside. */
function relativeLinks(text) {
  const out = []
  const fenced = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
  fenced.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1]
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue
      out.push({ target: target.split('#')[0], line: i + 1 })
    }
  })
  return out
}

validate()

const findings = []
const files = documents()

for (const name of REQUIRED) {
  const abs = join(repo, name)
  if (!existsSync(abs)) findings.push(`${name}:0: [documents] the repository is missing this document`)
  else if (statSync(abs).size === 0) findings.push(`${name}:0: [documents] the document is empty`)
}

let links = 0
for (const file of files) {
  const text = readFileSync(join(repo, file), 'utf8')
  const isChangelog = /(^|\/)CHANGELOG\.md$/.test(file)

  for (const { target, line } of relativeLinks(text)) {
    if (!target) continue
    links++
    const abs = resolve(repo, dirname(file), target)
    if (!existsSync(abs)) findings.push(`${file}:${line}: [links] ${target} does not resolve`)
  }

  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of VOCABULARY) {
      if (rule.where === 'CHANGELOG' && !isChangelog) continue
      if (excluded(file, rule.id)) continue
      if (rule.re.test(line)) findings.push(`${file}:${i + 1}: [${rule.id}] ${rule.message}`)
    }
  })
}

if (findings.length) {
  for (const f of findings) console.error(f)
  console.error(`\ndocs check FAILED: ${findings.length} finding(s).`)
  process.exit(1)
}

console.log(`docs OK: ${files.length} documents, ${links} relative links resolve, ${VOCABULARY.length} vocabulary rules hold with ${EXCLUSIONS.length} exact-file exclusions.`)
