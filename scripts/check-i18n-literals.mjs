#!/usr/bin/env node
// Lists every user-facing string literal still written directly into a React surface, so a
// localization pass can be checked rather than trusted. Walks the TypeScript AST (no regexes over
// source) and reports:
//   · JSX text with two or more letters in it            <button>Save</button>
//   · JSX string attributes that reach the reader         title="…" placeholder="…" aria-label="…" alt="…" label="…"
//   · template literals with letters as JSX children     {`Close ${name}`}
//   · string literals passed where a message is expected  setError('Could not …'), toast('…') — any call
//     argument that is a sentence (a capitalized word followed by a space and more words)
// Anything the interface says goes through the catalog; what remains after a pass is either data
// (a symbol, a brand, a unit, a token) or a miss. The allowlist below names what is legitimately
// data so the report is a to-do list, not noise.
//
//   node scripts/check-i18n-literals.mjs [paths…]     default: the app surfaces the plan lists
//   node scripts/check-i18n-literals.mjs --json       machine-readable
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// fileURLToPath, not URL.pathname: the latter percent-encodes spaces and keeps the leading slash
// before a Windows drive letter, and a path that does not exist walks as zero files.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const json = args.includes('--json')
const targets = args.filter((a) => !a.startsWith('--'))

/** Surfaces the localization plan covers. Marketing pages, the help center and the admin back office are out of scope. */
const DEFAULT_SCOPE = [
  'apps/web/src/AppShell.tsx',
  'apps/web/src/App.tsx',
  'apps/web/src/layout',
  'apps/web/src/search',
  'apps/web/src/settings',
  'apps/web/src/auth',
  'apps/web/src/billing',
  'apps/web/src/competition',
  'apps/web/src/connect',
  'apps/web/src/account',
  'apps/web/src/widgets',
  'apps/web/src/copier',
  'apps/web/src/strategies',
  'apps/web/src/alerts',
  'apps/web/src/pages',
  'apps/web/src/chart',
  'apps/web/src/journal',
  'apps/web/src/analytics',
  'apps/web/src/ide',
  'apps/web/src/operator',
  'apps/web/src/marketplace',
  'apps/web/src/lib/flags.tsx',
  // The chart-trading organ mounts its own DOM (editors, cards, pills) from .ts modules, so the
  // sweep reads what those assign to the DOM and hand to their painters.
  'packages/chart-trading/src',
]

/** Inside the scope but not the product: the public marketing site's nav and footer speak English
 *  by decision (the marketing pages, help center and admin back office are outside the plan). */
const EXCLUDE = ['apps/web/src/layout/PublicNav.tsx', 'apps/web/src/layout/SiteFooter.tsx']

/** The operator protocol: a registered widget's `title` is serialized into the manifest the AI reads
 *  and is never rendered, so these elements' and helpers' titles are not interface. */
const PROTOCOL_ELEMENTS = new Set(['ManifestFrame'])
const PROTOCOL_CALLS = new Set(['pageDoor', 'useOperatorManifest'])

/** Attribute names whose string value a person reads or a screen reader speaks. */
const READER_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'aria-description', 'alt', 'label', 'hint', 'menuLabel', 'describe'])
/** DOM properties a vanilla module writes text into: what `el.textContent = 'Close'` shows. */
const READER_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'ariaLabel'])

/** Data, not interface: exact strings that are allowed to stay literal. */
const ALLOW_EXACT = new Set([
  'trdrs', 'Trader Copier', 'Rithmic', 'TastyTrade', 'Tradovate', 'Stripe', 'Discord', 'Telegram', 'Google', 'Instagram', 'X',
  'Trading Platform by Rithmic', 'Powered by OMNE',
  'Esc', 'JSON', 'OK', 'USD', 'CT', 'UTC', 'ET', 'p95', 'ms', 'min', 'L', 'auto',
  'Trader', 'Pro', 'Free',
])
/** Data, not interface: shapes that are never words a person needs translated. */
const ALLOW_PATTERNS = [
  /^[^A-Za-z]*$/, // no letters at all: numbers, punctuation, symbols
  /^[A-Z]{1,5}$/, // a bare ticker/code like ES, NQ, GTC
  /^\{\{.*\}\}$/, // an alert template token
  /^[a-z]+(\.[a-z]+)+$/, // dotted identifiers
  /^https?:\/\//, // urls
  /^[/?&#][/?&#a-z_=]*$/, // a url's path or query syntax around a slot: `/?ref=${code}`
  /^[0-9]+[a-zA-Z]{1,2}$/, // timeframe tokens: 1m 5m 1h 1D
  /^[YMDHhmsZ:\-/. ]+$/, // a date or time format mask: YYYY-MM-DD, HH:MM
  /^(Ctrl|Alt|Shift|Cmd|Esc|Enter|Space|Tab)( ?\+ ?\S+)*$/, // a keyboard shortcut: Ctrl + C, Alt + Drag
  /^\$[0-9]/, // a price
  /^#/, // a color
  /^[a-z][a-zA-Z0-9]*$/, // a single lowercase identifier-shaped word (ids, keys)
  /^[\w.+-]+@[\w-]+\.[\w.]+$/, // an example email address
  /^\{\s*"/, // a JSON example
  /^@(keyframes|media|font-face)/, // css in a <style> child
]
const isAllowed = (s) => ALLOW_EXACT.has(s) || ALLOW_PATTERNS.some((p) => p.test(s))
const looksLikeText = (s) => /[A-Za-z]{2,}/.test(s)
/** A template's own words — its head and the literal text between `${}` slots. `${a} · ${b}` has
 *  none; `Close ${name}` has "Close". The whole source text is what gets reported, the static
 *  text is what decides. */
const templateStatic = (tpl) => [tpl.head.text, ...tpl.templateSpans.map((s) => s.literal.text)].join(' ')
/** A call argument that reads as a sentence: a capitalized word, a space, more words. */
const looksLikeSentence = (s) => /^[A-Z][a-z]+(['’]\w+)?\s+\S+/.test(s) || /^[A-Z][a-z]+…$/.test(s)

function walkFiles(entry, out) {
  const abs = resolve(ROOT, entry)
  const st = statSync(abs, { throwIfNoEntry: false })
  if (!st) return
  if (st.isFile()) {
    // Under packages/, vanilla .ts modules build DOM too; under apps/web the interface is JSX.
    const wanted = /[\\/]packages[\\/]/.test(abs) ? /\.tsx?$/ : /\.tsx$/
    if (wanted.test(abs) && !/\.test\.tsx?$/.test(abs) && !/\.d\.ts$/.test(abs) && !/[\\/]i18n[\\/]/.test(abs)) out.push(abs)
    return
  }
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === 'dist') continue
    walkFiles(join(abs, name), out)
  }
}

const files = []
for (const t of targets.length ? targets : DEFAULT_SCOPE) walkFiles(t, files)
const excluded = new Set(EXCLUDE.map((e) => resolve(ROOT, e)))
const scoped = files.filter((f) => !excluded.has(f))

const findings = []
/** `decide` is the text judged for letters and the allowlist; `text` is what the report prints. */
const report = (file, node, kind, text, decide = text) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  const judged = decide.replace(/\s+/g, ' ').trim()
  if (!clean || !looksLikeText(judged) || isAllowed(judged)) return
  const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart())
  findings.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line: line + 1, kind, text: clean.slice(0, 90) })
}
const reportTemplate = (file, node, kind, tpl) => report(file, node, kind, tpl.getText(), templateStatic(tpl))
/** A `<style>` element's text is css. */
const inStyle = (node) => {
  const el = node.parent
  if (!el || !ts.isJsxElement(el)) return false
  return el.openingElement.tagName.getText() === 'style'
}

for (const file of scoped) {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (!inStyle(node)) report(file, node, 'jsx-text', node.getText())
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText()
      const owner = node.parent?.parent
      const protocol = owner && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) && PROTOCOL_ELEMENTS.has(owner.tagName.getText())
      if (READER_ATTRS.has(name) && !protocol) {
        const init = node.initializer
        if (ts.isStringLiteral(init)) report(file, node, `attr:${name}`, init.text)
        else if (ts.isJsxExpression(init) && init.expression) {
          const e = init.expression
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) report(file, node, `attr:${name}`, e.text)
          if (ts.isTemplateExpression(e)) reportTemplate(file, node, `attr:${name}`, e)
          if (ts.isConditionalExpression(e)) {
            for (const side of [e.whenTrue, e.whenFalse]) {
              if (ts.isStringLiteral(side) || ts.isNoSubstitutionTemplateLiteral(side)) report(file, node, `attr:${name}`, side.text)
              if (ts.isTemplateExpression(side)) reportTemplate(file, node, `attr:${name}`, side)
            }
          }
        }
      }
    } else if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) && !inStyle(node)) {
      // A string or template as a JSX CHILD: {'Save'} {`Close ${x}`} {cond ? 'A' : 'B'}
      const e = node.expression
      const check = (x) => {
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) report(file, node, 'jsx-child', x.text)
        else if (ts.isTemplateExpression(x)) reportTemplate(file, node, 'jsx-child', x)
        else if (ts.isConditionalExpression(x)) {
          check(x.whenTrue)
          check(x.whenFalse)
        } else if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
          check(x.right)
        }
      }
      check(e)
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      READER_PROPS.has(node.left.name.getText())
    ) {
      // Text written straight into the DOM: el.textContent = 'Close', el.title = `Close ${name}`.
      const rhs = node.right
      const prop = node.left.name.getText()
      if (ts.isStringLiteral(rhs) || ts.isNoSubstitutionTemplateLiteral(rhs)) report(file, node, `prop:${prop}`, rhs.text)
      else if (ts.isTemplateExpression(rhs)) reportTemplate(file, node, `prop:${prop}`, rhs)
      else if (ts.isConditionalExpression(rhs)) {
        for (const side of [rhs.whenTrue, rhs.whenFalse]) {
          if (ts.isStringLiteral(side) || ts.isNoSubstitutionTemplateLiteral(side)) report(file, node, `prop:${prop}`, side.text)
          if (ts.isTemplateExpression(side)) reportTemplate(file, node, `prop:${prop}`, side)
        }
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.getText() === 'setAttribute') {
      // el.setAttribute('title', 'Close'): the attribute rule, for DOM built by hand.
      const [name, value] = node.arguments
      if (name && value && ts.isStringLiteral(name) && READER_ATTRS.has(name.text)) {
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) report(file, node, `attr:${name.text}`, value.text)
        else if (ts.isTemplateExpression(value)) reportTemplate(file, node, `attr:${name.text}`, value)
      }
    } else if (ts.isCallExpression(node) && !PROTOCOL_CALLS.has(node.expression.getText())) {
      // Sentences handed to a function: setError('Could not …'), throw new Error(…) is code, not UI.
      for (const arg of node.arguments) {
        if ((ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && looksLikeSentence(arg.text)) report(file, node, 'call-arg', arg.text)
        if (ts.isTemplateExpression(arg) && looksLikeSentence(arg.head.text)) reportTemplate(file, node, 'call-arg', arg)
        if (ts.isConditionalExpression(arg)) {
          for (const side of [arg.whenTrue, arg.whenFalse]) {
            if ((ts.isStringLiteral(side) || ts.isNoSubstitutionTemplateLiteral(side)) && looksLikeSentence(side.text)) report(file, node, 'call-arg', side.text)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
}

// `console.*`, `track(...)`, `new Error(...)`, engine calls: code, not interface. Dropped by the caller shape.
const filtered = findings.filter((f) => {
  return !/^(console|track|Error|EngineError)\b/.test(f.text)
})

if (json) {
  console.log(JSON.stringify(filtered, null, 2))
} else {
  for (const f of filtered) console.log(`${f.file}:${f.line}  [${f.kind}]  ${f.text}`)
  console.log(`\n${filtered.length} literal string(s) across ${scoped.length} files`)
}
process.exit(filtered.length ? 1 : 0)
