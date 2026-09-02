// Generic pointer and touch behavior, pinned in the PACKAGE. The chart is driven by a finger as
// often as by a mouse, so pan and pinch, the press-and-hold menu, and the drag lock are the
// widget's own: a chart anyone embeds gets all of it. (The web application's chart pane carries
// a copy of the press-and-hold rule for its own chart until that pane is deleted.)
//
// Nothing here imports or simulates `apps/web`: the decisions are pure, and where behavior
// belongs to the chart itself (which handlers it binds, what it does with the chart's own
// navigation) it is pinned against the source of the two modules that own it, the way this package
// pins its other rules that no runtime assertion can reach.
import { describe, expect, it } from 'vitest'
import { longPressArms, longPressCancels, pointerLock, LONG_PRESS_DRIFT_PX, LONG_PRESS_MS } from '../src/pointerInput'
import { placeableByWidget } from '../src/drawings'
import extensionsSrc from '../src/widget/extensions.ts?raw'
import pointerSrc from '../src/widget/pointer.ts?raw'
import chartSrc from '../src/widget/chart.ts?raw'

describe('pan, pinch and axis scaling belong to the chart, and are borrowed rather than taken', () => {
  it('a drag suspends pan, zoom, pinch and axis scaling together, and hands all of them back', () => {
    // One rule, both directions. The residue this prevents is the half-restore: navigation back on
    // while the container still refuses touch, leaving a chart no finger can scroll.
    expect(pointerLock(true)).toEqual({ handleScroll: false, handleScale: false, touchAction: 'none' })
    expect(pointerLock(false)).toEqual({ handleScroll: true, handleScale: true, touchAction: '' })
  })

  it('the chart applies that one rule rather than its own pair of flags', () => {
    expect(extensionsSrc).toContain('const state = pointerLock(locked)')
    expect(extensionsSrc).toContain('deps.chart.applyOptions({ handleScroll: state.handleScroll, handleScale: state.handleScale })')
    expect(extensionsSrc).toContain('deps.setTouchAction(state.touchAction)')
    expect(chartSrc).toContain('gestures.style.touchAction = value')
  })

  it('the chart opens with the renderer’s navigation ON — pan, wheel zoom, pinch and axis drag', () => {
    // A chart that mounted with either flag off would be a chart nobody can move, and no runtime
    // assertion in this package would notice.
    const created = chartSrc.slice(chartSrc.indexOf('createRenderer(gestures, {'), chartSrc.indexOf('const anchor:'))
    expect(created).not.toContain('handleScroll')
    expect(created).not.toContain('handleScale')
  })

  it('an in-chart drag borrows the lock through one capability, and the chart alone applies it', () => {
    // The extension plane is the one door to the lock: an overlay asks `lockPanZoom`, and the flags
    // and the touch action move together inside the chart. No other site in the package writes the
    // renderer's navigation flags, and the chart makes exactly one touch-action write.
    const widgetSrc = extensionsSrc + chartSrc + pointerSrc
    expect(widgetSrc.match(/handleScroll:/g)!.length).toBe(1)
    expect(widgetSrc.match(/handleScale:/g)!.length).toBe(1)
    expect(widgetSrc.match(/\.touchAction =/g)!.length).toBe(1)
  })
})

describe('press and hold is the touch way into the level menu', () => {
  it('one finger, held still, for the measured interval', () => {
    expect(LONG_PRESS_MS).toBe(450)
    expect(LONG_PRESS_DRIFT_PX).toBe(10)
    expect(longPressArms({ touches: 1, toolArmed: false })).toBe(true)
  })

  it('a second finger is a pinch, which is navigation, so no hold arms', () => {
    expect(longPressArms({ touches: 2, toolArmed: false })).toBe(false)
    expect(longPressArms({ touches: 0, toolArmed: false })).toBe(false)
  })

  it('an armed drawing tool takes the press — the press IS the drawing gesture', () => {
    expect(longPressArms({ touches: 1, toolArmed: true })).toBe(false)
  })

  it('a finger resting on a control is about to tap it, not to open a menu', () => {
    expect(longPressArms({ touches: 1, toolArmed: false, onControl: true })).toBe(false)
    expect(longPressArms({ touches: 1, toolArmed: false, onControl: false })).toBe(true)
  })

  it('drift beyond the allowance cancels; a thumb rolling on its contact patch does not', () => {
    const held = { touches: 1, fromX: 100, fromY: 100 }
    expect(longPressCancels({ ...held, x: 108, y: 106 })).toBe(false)
    expect(longPressCancels({ ...held, x: 111, y: 100 })).toBe(true)
    expect(longPressCancels({ ...held, x: 100, y: 89 })).toBe(true)
  })

  it('a second finger landing mid-hold ends it, in-place, whatever the drift', () => {
    expect(longPressCancels({ touches: 2, fromX: 100, fromY: 100, x: 100, y: 100 })).toBe(true)
  })

  it('the chart binds the hold itself, passively, and raises the same menu a right-click does', () => {
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      expect(pointerSrc, type).toMatch(new RegExp(`deps\\.gestures\\.addEventListener\\('${type}'`))
    }
    // Passive listeners: the hold observes the gesture and never blocks the renderer's own pan.
    expect(pointerSrc.match(/\{ passive: true \}/g)!.length).toBe(4)
    // The right-click and the hold call ONE raise, so a finger can never be offered other rows.
    expect(chartSrc.match(/menu\.raiseAt\(/g)!.length).toBe(2)
    // An armed hold cannot outlive the chart.
    expect(pointerSrc).toContain('cancel()')
    expect(chartSrc).toContain('pointer?.destroy()')
  })
})

describe('drawing placement is the chart’s own gesture', () => {
  it('the package decides which tools a plain widget can place, without asking a host', () => {
    // Placement is chart behavior: a drawing tool the package cannot place must not be armable from
    // any surface, and that answer comes from the package rather than from an app catalog.
    expect(placeableByWidget('trend_line')).toBe(true)
    expect(placeableByWidget('horizontal_line')).toBe(true)
    // A tool whose placement is not a plain sequence of anchor presses, or that needs the host's
    // text editor, is not placeable by the widget's own pointer loop.
    expect(placeableByWidget('long_position')).toBe(false)
    expect(placeableByWidget('content_card')).toBe(false)
    expect(placeableByWidget('not-a-tool')).toBe(false)
  })

  it('an armed tool owns the touch surface until it is disarmed', () => {
    // The chart reads the layer's own armed tool rather than a flag of its own, so arming from any
    // door (the rail, a host command, a keyboard shortcut) stands the hold down the same way.
    expect(chartSrc).toContain('toolArmed: () => drawings.handle?.activeTool() != null')
  })
})
