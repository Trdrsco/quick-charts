// The replay transport's recipe, read as bytes the way the drawing recipes are read: the row is a
// reserved 49px band in the widget's own column, its flush toolbar cells are centered on the row,
// Exit sits in the far outer track, and everything is placed logically, so a right-to-left chart
// mirrors and a long translation scrolls rather than overlapping a neighbour.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** This file's directory, decoded and drive-letter-normalized, then the recipes folder. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const recipes = testDir.replace(/\/test\/chrome\/?$/, '/src/styles/components')
const css = readFileSync(`${recipes}/replay.css`, 'utf8')
const source = readFileSync(`${testDir.replace(/\/test\/chrome\/?$/, '/src/ui/chrome')}/mount.ts`, 'utf8')

/** One rule's body, by selector, so a declaration is read where it is written. */
const rule = (selector: string): string => {
  const at = css.indexOf(`[data-qc-theme] ${selector} {`)
  expect(at, `${selector} has a recipe`).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}

describe('the reserved replay row', () => {
  it('reserves 49px of the widget column and floats over nothing', () => {
    const row = rule('.qc-replay')
    expect(row).toMatch(/flex:\s*0 0 49px/)
    expect(row).toMatch(/height:\s*49px/)
    expect(row).toMatch(/border-top:\s*1px solid var\(--qc-canvas-paneBorder\)/)
    expect(row).not.toMatch(/position:\s*(absolute|fixed|sticky)/)
    expect(row).not.toMatch(/z-index/)
    // The TRANSPORT stays in flow while opening and closing. The absolutely placed replay recipes
    // are marks on the PLOT — the guide, its shears, and the centred state mark.
    const floated = [...css.matchAll(/\[data-qc-theme\] (\.qc-replay[a-z-]*)\s*\{[^}]*position:\s*(?:absolute|fixed)/g)].map((m) => m[1])
    expect(floated).toEqual(['.qc-replay-guide', '.qc-replay-cut', '.qc-replay-watermark'])
  })

  it('slides its reserved row upward and returns the same space on close', () => {
    const transport = readFileSync(`${testDir.replace(/\/test\/chrome\/?$/, '/src/ui/chrome')}/replayBar.ts`, 'utf8')
    // The row enters and leaves on the modal motion's roles, and closing runs the opening in
    // reverse: no closing rule retunes the timing, and the chrome waits on the same duration role.
    expect(rule('.qc-replay')).toContain('flex-basis var(--qc-motion-durationBase) var(--qc-motion-easingStandard)')
    expect(rule('.qc-replay')).toContain('max-height var(--qc-motion-durationBase) var(--qc-motion-easingStandard)')
    expect(css).toContain(".qc-replay[data-state='opening']")
    expect(css).toContain(".qc-replay[data-state='closing']")
    expect(css).toMatch(/flex-basis:\s*0/)
    expect(css).toMatch(/max-height:\s*0/)
    expect(css).not.toMatch(/transition-(duration|timing-function)/)
    expect(transport).toContain("motionDurationMs(bar, 'motion.durationBase')")
    expect(transport).toContain("bar.dataset.state = 'opening'")
    expect(transport).toContain("bar.dataset.state = 'open'")
    expect(transport).toContain("bar.dataset.state = 'closing'")
    expect(transport).toContain('transitionend')
    expect(transport).not.toContain('bar.animate(')
  })

  it('is placed once, after the charts grid, by the chrome that owns it', () => {
    expect(source).toContain('deps.panes.after(replayBar.element)')
    expect(source).not.toMatch(/overlays\.appendChild\(replayBar/)
  })

  it('centers the flush run of toolbar cells and sits Exit in the far outer track', () => {
    // The cells are the toolbar's own recipe, so this row writes no button of its own.
    expect(css).not.toContain('.qc-replay-button')
    // Equal 70px outer tracks: the controls stand at the row's center, and Exit in the middle of the
    // far track. The leading track carries NOTHING, as the transport has no readout.
    expect(rule('.qc-replay-command-strip')).toMatch(/grid-template-columns:\s*70px minmax\(max-content, 1fr\) 70px/)
    const controls = rule('.qc-replay-controls')
    expect(controls).toMatch(/grid-column:\s*2/)
    expect(controls).toMatch(/justify-self:\s*center/)
    const exit = rule('.qc-replay-exit')
    expect(exit).toMatch(/grid-column:\s*3/)
    expect(exit).toMatch(/justify-self:\s*center/)
    // A rule stands 8px clear of the cells either side of it.
    expect(rule('.qc-replay .qc-separator--vertical')).toMatch(/margin:\s*0 8px/)
  })

  it('opens its menus as flush lists at their measured widths', () => {
    expect(rule('.qc-menu-panel.qc-replay-menu')).toMatch(/padding:\s*6px 0/)
    const row = rule('.qc-replay-menu .qc-menu-row')
    expect(row).toMatch(/border-radius:\s*0/)
    expect(row).toMatch(/padding-inline:\s*12px 14px/)
    expect(rule('.qc-replay-menu .qc-menu-row--marked')).toMatch(/height:\s*34px/)
    expect(rule('.qc-replay-menu .qc-menu-row:hover')).toMatch(/color:\s*var\(--qc-state-hoverInk\)/)
    // A speed never gives up its width to its rate; the speed list grows from 196px to fit its words.
    expect(rule('.qc-replay-menu .qc-menu-label')).toMatch(/flex:\s*0 0 auto/)
    expect(rule('.qc-menu-panel.qc-replay-speed-menu')).toMatch(/min-width:\s*196px/)
    expect(rule('.qc-replay-exit')).toMatch(/width:\s*38px/)
  })

  it('scrolls a narrow row instead of overlapping, and hides the scrollbar it does not need', () => {
    const row = rule('.qc-replay')
    expect(row).toMatch(/overflow-x:\s*auto/)
    expect(row).toMatch(/overflow-y:\s*hidden/)
    expect(row).toMatch(/min-width:\s*0/)
    const strip = rule('.qc-replay-command-strip')
    expect(strip).toMatch(/width:\s*max-content/)
    expect(strip).toMatch(/min-width:\s*100%/)
    // A long localized control label scrolls the strip rather than pushing the cluster off: the row
    // is its own scroller and the strip is its intrinsic content.
  })

  it('mirrors in right-to-left without a transform or a physical edge', () => {
    const replayRules = css.split('\n\n').filter((block) => /\.qc-(replay|legend-replay)/.test(block)).join('\n')
    expect(replayRules).not.toMatch(/(^|[^-])(left|right):/m)
    expect(replayRules).not.toMatch(/margin-(left|right)/)
    expect(replayRules).not.toMatch(/padding-(left|right)/)
    expect(replayRules).not.toMatch(/transform:\s*scaleX/)
  })
})
