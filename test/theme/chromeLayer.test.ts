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

function lastRule(selector: string): string {
  const at = css.lastIndexOf(selector + ' {')
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
    // The menu's dismiss catcher mounts on the grid, above every pane, so it opts in on its own.
    expect(surfaces).toContain('.qc-menu-backdrop')
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

describe('the legend keeps the measured responsive bands', () => {
  it('uses the measured header, row, action and list-toggle geometry', () => {
    // 4px into the main pane, which the chart moves down when a viewer moves that pane below another.
    expect(lastRule('[data-qc-theme] .qc-legend')).toContain('top: calc(4px + var(--qcd-legend-top, 0px))')
    const header = rule('[data-qc-theme] .qc-legend-header')
    expect(header).toContain('flex-wrap: wrap')
    // No row gap: a reading that wraps sits directly under the identity band, as a two-line legend.
    expect(header).toContain('gap: 0 8px')
    expect(rule('[data-qc-theme] .qc-legend-quote')).toContain('height: 18px')
    expect(header).toContain('min-height: 24px')
    expect(header).toContain('padding-inline-start: 9px')
    const row = rule('[data-qc-theme] .qc-legend-row')
    expect(row).toContain('height: 24px')
    expect(row).toContain('gap: 6px')
    const toggle = rule('[data-qc-theme] .qc-legend-collapse')
    expect(toggle).toContain('width: 29px')
    expect(toggle).toContain('height: 21px')
    expect(toggle).toContain('margin-top: 3px')
  })

  it('reveals one touching action cluster on hover and keyboard focus', () => {
    expect(rule('[data-qc-theme] .qc-legend-actions')).toContain('display: inline-flex')
    expect(css).toContain('.qc-legend-row:hover .qc-legend-actions > .qc-legend-action')
    expect(css).toContain('.qc-legend-row:focus-within .qc-legend-actions > .qc-legend-action')
    expect(css).toContain(".qc-legend-row[data-qc-hidden='true'] .qc-legend-eye")
  })
})

describe('the widget root fills whatever box a host gives it', () => {
  // Hosts hand a widget its space in one of two ways, and a chart that only understands one of them
  // is sized by an accident of the host's CSS rather than by the host's intent. Both failures are
  // silent: the chart renders, just short, and its indicator panes get squeezed to the renderer's
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

describe('replay reserves a responsive row instead of floating over a chart', () => {
  it('takes one fixed-height flex row and never an absolute recipe', () => {
    const replay = rule('[data-qc-theme] .qc-replay')
    expect(replay).toContain('flex: 0 0 49px')
    expect(replay).toContain('height: 49px')
    expect(replay).toContain('width: 100%')
    expect(replay).toContain('border-top: 1px solid var(--qc-canvas-paneBorder)')
    expect(replay).toContain('overflow-x: auto')
    for (const retired of ['position: absolute', 'bottom:', 'left:', 'max-width:']) {
      expect(replay, retired).not.toContain(retired)
    }
  })

  it('centers when content fits and becomes intrinsic scroll content when labels do not', () => {
    const strip = rule('[data-qc-theme] .qc-replay-command-strip')
    // Equal outer tracks, so the middle track and only the middle track sits at the row's center.
    // The leading track carries NOTHING: the transport has no readout, so nothing needs to be
    // measured into the track opposite Exit.
    expect(strip).toContain('grid-template-columns: 70px minmax(max-content, 1fr) 70px')
    expect(strip).toContain('width: max-content')
    expect(strip).toContain('min-width: 100%')
    expect(rule('[data-qc-theme] .qc-replay-controls')).toContain('grid-column: 2')
    const exit = rule('[data-qc-theme] .qc-replay-exit')
    expect(exit).toContain('grid-column: 3')
    expect(exit).toContain('justify-self: center')
    expect(css).not.toContain('.qc-replay-readout')
  })

  it('uses only logical grid placement so either RTL root placement reverses it', () => {
    const replayCss = css.slice(css.indexOf('[data-qc-theme] .qc-replay'), css.indexOf('/* The date picker. */'))
    expect(replayCss).not.toMatch(/\bleft:|\bright:|translateX/)
  })
})
