// @vitest-environment happy-dom
// Which `pointer-events` reaches an element in the chart's chrome, resolved across the whole authored
// stylesheet the way a browser resolves it: every rule whose selector matches the element, the most
// specific winning and, at equal specificity, the later. A rule read on its own says what it
// declares; only the cascade says what the element gets.
import { describe, expect, it } from 'vitest'
import { authoredStylesheet } from './stylesheetSource'

interface Declaration {
  selector: string
  specificity: readonly [number, number, number]
  order: number
  value: string
  important: boolean
}

/** Every style rule as its selector list and its declarations, nested ones included, in source order.
 *  An at-rule's own prelude never stands as a selector: a block holding blocks is not a rule. */
function styleRules(css: string): { selectors: string[]; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: { selectors: string[]; body: string }[] = []
  for (const match of text.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const prelude = match[1]!.trim()
    if (prelude.startsWith('@')) continue
    rules.push({ selectors: prelude.split(',').map((s) => s.trim()).filter(Boolean), body: match[2]! })
  }
  return rules
}

/** A selector's specificity: ids, then classes, attributes and pseudo-classes, then types and
 *  pseudo-elements. A functional pseudo-class counts what it holds, not itself. */
function specificity(selector: string): readonly [number, number, number] {
  let s = selector
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const attributes = (s.match(/\[[^\]]*\]/g) ?? []).length
  s = s.replace(/\[[^\]]*\]/g, ' ')
  const pseudoElements = (s.match(/::[\w-]+/g) ?? []).length
  s = s.replace(/::[\w-]+/g, ' ')
  const pseudoClasses = (s.match(/:(?!not\(|is\(|has\(|where\()[\w-]+/g) ?? []).length
  s = s.replace(/:[\w-]+/g, ' ')
  const classes = (s.match(/\.[\w-]+/g) ?? []).length
  s = s.replace(/[#.][\w-]+/g, ' ')
  const types = (s.match(/(^|[\s>+~(])([a-z][\w-]*)/gi) ?? []).length
  return [ids, classes + attributes + pseudoClasses, types + pseudoElements]
}

const higher = (a: readonly [number, number, number], b: readonly [number, number, number]): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** The `pointer-events` the cascade gives an element, and the rule it comes from. */
function pointerEventsOf(element: Element): Declaration | null {
  const declared: Declaration[] = []
  let order = 0
  for (const rule of styleRules(authoredStylesheet())) {
    const value = /(?:^|;)\s*pointer-events\s*:\s*([^;]+)/.exec(rule.body)?.[1]?.trim()
    order += 1
    if (!value) continue
    for (const selector of rule.selectors) {
      let matches = false
      try {
        matches = element.matches(selector)
      } catch {
        // A keyframe step or an unsupported selector matches no element.
      }
      if (!matches) continue
      const important = /!important/.test(value)
      declared.push({ selector, specificity: specificity(selector), order, value: value.replace(/\s*!important/, ''), important })
    }
  }
  declared.sort((a, b) => Number(a.important) - Number(b.important) || higher(a.specificity, b.specificity) || a.order - b.order)
  return declared.at(-1) ?? null
}

/** An element in the chart's chrome, as the chart mounts it. */
function inChrome(markup: string): Element {
  const root = document.createElement('div')
  root.setAttribute('data-qc-theme', 'dark')
  root.innerHTML = `<div class="qc-chrome">${markup}</div>`
  document.body.appendChild(root)
  return root.querySelector('.qc-chrome > *')!
}

describe('the pointer in the chart chrome', () => {
  it('gives a button in the chrome its pointer back, as the scale mode buttons need', () => {
    expect(pointerEventsOf(inChrome('<button type="button" class="qc-scale-mode"></button>'))?.value).toBe('auto')
  })

  it('takes no pointer at the plus button, whatever the chrome gives its other buttons', () => {
    // A plus button that took the pointer would take it off the plot: the renderer would put its
    // crosshair away, the plus and its button with it, and the pointer would land on the plot again.
    const winner = pointerEventsOf(inChrome('<button type="button" class="qc-scale-plus"></button>'))
    expect(winner?.value, winner?.selector).toBe('none')
  })

  it('reads specificity as a browser does', () => {
    expect(specificity('[data-qc-theme] .qc-chrome button')).toEqual([0, 2, 1])
    expect(specificity('[data-qc-theme] .qc-chrome .qc-scale-plus')).toEqual([0, 3, 0])
    expect(specificity('[data-qc-theme] .qc-scale-plus:not([hidden])')).toEqual([0, 3, 0])
    expect(specificity('#chart .a::before')).toEqual([1, 1, 1])
  })
})
