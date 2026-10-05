// Compile the vendored artwork into the chart bundle. No host URL or external fetch is needed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// The catalog's glyphs are its single-quoted strings. Comments are dropped first: an apostrophe in
// prose would otherwise pair with the next quote and read the strings between them as text.
const catalog = readFileSync(`${root}/src/drawings/glyphs.ts`, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const isEmoji = glyph => !glyph.includes('\u{fe0e}') && /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(glyph)
const stemOf = glyph => {
  const points = [...glyph].map(ch => ch.codePointAt(0))
  return (points.includes(0x200d) ? points : points.filter(p => p !== 0xfe0f)).map(p => p.toString(16)).join('-')
}
const stems = [...new Set([...catalog.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).filter(isEmoji).map(stemOf))].sort()
const artwork = {}
for (const stem of stems) {
  const file = `${root}/assets/twemoji/${stem}.svg`
  if (!existsSync(file)) throw new Error(`Missing emoji artwork: ${stem}`)
  const svg = readFileSync(file, 'utf8')
  if (/<script\b|<foreignObject\b|\son\w+\s*=|(?:href|url)\s*[=(]\s*["']?(?:https?:|\/\/)/i.test(svg)) throw new Error(`Unsafe emoji artwork: ${stem}`)
  const open = /<svg\b[^>]*>/.exec(svg)
  const viewBox = /viewBox="([^"]+)"/.exec(open?.[0] ?? '')?.[1] ?? '0 0 36 36'
  const inner = svg.slice((open?.index ?? 0) + (open?.[0].length ?? 0)).replace(/<\/svg>\s*$/, '')
    .replace(/\bid="([^"]+)"/g, `id="${stem}--$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${stem}--$1)`)
    .replace(/\bhref="#([^"]+)"/g, `href="#${stem}--$1"`)
  artwork[stem] = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="36" height="36">${inner}</svg>`
}
const output = `${JSON.stringify(artwork)}\n`
const file = `${root}/src/drawings/emoji-artwork.json`
if (process.argv.includes('--check')) {
  if (!existsSync(file) || readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== output) throw new Error('Emoji artwork differs; run pnpm build:emoji')
} else writeFileSync(file, output)
console.log(`Bundled emoji artwork: ${stems.length} glyphs`)
