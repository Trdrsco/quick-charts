// The chrome layer's stacking and pointer rules, pinned in the stylesheet.
//
// These two rules are what let the chart's own controls be clicked at all, and both fail SILENTLY:
// a legend button under the canvases, or a button that is transparent to the pointer, looks
// perfectly correct in a screenshot and in the accessibility tree. It resolves, it is visible, it
// is enabled, and the click lands on the canvas underneath. Nothing errors. So the rules are
// pinned here rather than left to be rediscovered from a mystery e2e timeout.
import { describe, expect, it } from 'vitest'
import { authoredStylesheet } from './stylesheetSource'

const css = authoredStylesheet()

/** One rule's body, by selector. */
function rule(selector: string): string {
  const at = css.indexOf(selector + ' {')
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('the chrome layer sits above the gesture box', () => {
  it('the gesture box takes no stacking of its own, so the chrome can rise above it', () => {
    // Both fill the chart. They are siblings in source order, gestures first, so the chrome would
    // already paint over it; the explicit z-index below is what keeps that true once the renderer
    // stacks canvases inside the gesture box.
    const gestures = rule('[data-qc-theme] .qc-gestures')
    expect(gestures).toContain('position: absolute')
    expect(gestures).toContain('inset: 0')
    expect(gestures).not.toContain('z-index')
  })

  it('the chrome layer is positioned, stacked above, and inert', () => {
    const chrome = rule('[data-qc-theme] .qc-chrome')
    expect(chrome).toContain('position: absolute')
    expect(chrome).toContain('inset: 0')
    expect(chrome).toContain('z-index: 5')
    // Inert by default: the chart underneath has to stay draggable everywhere the chrome is not.
    expect(chrome).toContain('pointer-events: none')
  })
})

describe('every control in the chrome layer takes its own pointer events back', () => {
  const optIn = css.slice(css.indexOf('[data-qc-theme] .qc-chrome button'))

  it('covers every element a viewer can operate, not one class at a time', () => {
    // A rule per control class would be one edit away from a dead button the next time a control is
    // added, and the failure is invisible. This is keyed on what a viewer can OPERATE.
    for (const selector of ['button', 'input', 'select', 'textarea', 'a[href]']) {
      expect(optIn.slice(0, optIn.indexOf('}')), selector).toContain(`.qc-chrome ${selector}`)
    }
    expect(optIn.slice(0, optIn.indexOf('}') + 1)).toContain('pointer-events: auto')
  })

  it('the legend header stays inert, so its controls depend on that opt-in', () => {
    // The header itself must not take events: it spans the top of the chart, and a bar that wide
    // swallowing drags would make the chart feel broken. Its compare door is a button, so the rule
    // above is the ONLY thing that makes it clickable.
    expect(rule('[data-qc-theme] .qc-legend-header')).toContain('pointer-events: none')
    expect(rule('[data-qc-theme] .qc-legend')).not.toContain('pointer-events: auto')
  })
})
