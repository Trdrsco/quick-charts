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

  it('an overlay surface opts in whole, not one native control at a time', () => {
    // A dialog row is a div and a menu label is a span. Neither matches the control rule above, so
    // on an inert layer a viewer can see the row, hover it, and click straight through it. Worse,
    // an overlay may extend past its own root, and then the pointer reaches the NEXT widget on the
    // page and that widget answers. The surface itself takes the pointer so the fall stops here.
    const start = css.indexOf('[data-qc-theme] .qc-chrome .qc-overlay')
    expect(start, 'no opt-in rule for overlay surfaces').toBeGreaterThan(-1)
    const surfaces = css.slice(start, css.indexOf('}', start) + 1)
    expect(surfaces).toContain('.qc-chrome .qc-overlay') // the dialog and menu boxes
    expect(surfaces).toContain('.qc-chrome .qc-scrim') // the dialog backdrop
    expect(surfaces).toContain('.qc-chrome .qc-menu-backdrop') // the menu's dismiss catcher
    expect(surfaces).toContain('pointer-events: auto')
  })

  it('the legend header stays inert, so its controls depend on that opt-in', () => {
    // The header itself must not take events: it spans the top of the chart, and a bar that wide
    // swallowing drags would make the chart feel broken. Its compare door is a button, so the rule
    // above is the ONLY thing that makes it clickable.
    expect(rule('[data-qc-theme] .qc-legend-header')).toContain('pointer-events: none')
    expect(rule('[data-qc-theme] .qc-legend')).not.toContain('pointer-events: auto')
  })
})

describe('the widget root fills whatever box a host gives it', () => {
  // Hosts hand a widget its space in one of two ways, and a chart that only understands one of them
  // is sized by an accident of the host's CSS rather than by the host's intent. Both failures are
  // silent: the chart renders, just short, and its study panes get squeezed to the renderer's
  // minimum without anything erroring.
  it('the root carries BOTH the percentage and the flex share', () => {
    const root = rule('[data-qc-theme].qc-root')
    expect(root).toContain('height: 100%') // a block host with a definite height
    expect(root).toContain('flex: 1 1 auto') // a flex host handing out leftover space
    expect(root).toContain('min-height: 0') // so it may shrink below its content instead of overflowing
  })

  it('the charts grid takes the root’s remaining height the same way', () => {
    // Its own children are absolutely positioned, so it has no content height of its own to be
    // sized by: without these it collapses to nothing and every chart in it collapses with it.
    const panes = rule('[data-qc-theme] .qc-panes')
    expect(panes).toContain('position: relative') // the containing block each chart is placed against
    expect(panes).toContain('height: 100%')
    expect(panes).toContain('flex: 1 1 auto')
    expect(panes).toContain('min-height: 0')
  })
})
