// Generic pointer and touch behavior, pinned in the PACKAGE. The chart is driven by a finger as
// often as by a mouse, so pan and pinch, the press-and-hold menu, and the drag lock are the
// widget's own: a chart anyone embeds gets all of it. (The web application's chart pane carries
// a copy of the press-and-hold rule for its own chart until that pane is deleted.)
//
// Nothing here imports or simulates a host application: the decisions are pure, and where behavior
// belongs to the chart itself (which handlers it binds, what it does with the chart's own
// navigation) it is pinned against the source of the two modules that own it, the way this package
// pins its other rules that no runtime assertion can reach.
import { describe, expect, it } from 'vitest'
import { holdRaisesMenu, longPressArms, longPressCancels, pinchSpacing, pointerLock, scalingOpen, LONG_PRESS_DRIFT_PX, LONG_PRESS_MS } from '../src/pointerInput'
import { placeableByWidget } from '../src/drawings'
import extensionsSrc from '../src/widget/extensions.ts?raw'
import pointerSrc from '../src/widget/pointer.ts?raw'
import chartSrc from '../src/widget/chart.ts?raw'

describe('pan, pinch and axis scaling belong to the chart, and are borrowed rather than taken', () => {
  it('a drag suspends pan, zoom and axis scaling together, and hands all of them back', () => {
    // One rule, both directions. The residue this prevents is the half-restore: navigation back on
    // while the container still refuses touch, leaving a chart no finger can scroll. The renderer's
    // own pinch is off either way: the chart pinches by itself, and reads this lock to know when.
    expect(pointerLock(true)).toEqual({
      handleScroll: false,
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
      touchAction: 'none',
    })
    expect(pointerLock(false)).toEqual({
      handleScroll: true,
      handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: true, axisDoubleClickReset: true },
      touchAction: '',
    })
    expect(scalingOpen(pointerLock(true).handleScale)).toBe(false)
    expect(scalingOpen(pointerLock(false).handleScale)).toBe(true)
    expect(scalingOpen(true)).toBe(true)
    expect(scalingOpen(false)).toBe(false)
  })

  it('a pinch spreads the bars exactly as far as the fingers spread', () => {
    // The renderer's own pinch moves the spacing by about half the change in the fingers' distance,
    // so twice as far apart zoomed only about 1.65 times. Proportional: twice as far, twice as wide.
    expect(pinchSpacing(8, 100, 200)).toBe(16)
    expect(pinchSpacing(8, 100, 50)).toBe(4)
    expect(pinchSpacing(8, 100, 100)).toBe(8)
    expect(pinchSpacing(8, 0, 100)).toBe(8)
  })

  it('the chart applies that one rule rather than its own pair of flags', () => {
    expect(extensionsSrc).toContain('const state = pointerLock(locked)')
    expect(extensionsSrc).toContain('deps.chart.applyOptions({ handleScroll: state.handleScroll, handleScale: state.handleScale })')
    expect(extensionsSrc).toContain('deps.setTouchAction(state.touchAction)')
    expect(chartSrc).toContain('gestures.style.touchAction = value')
  })

  it('the chart opens released: the renderer’s pan, wheel zoom and axis drag on, and the chart’s own pinch attached', () => {
    // A chart that mounted with either flag off would be a chart nobody can move, and no runtime
    // assertion in this package would notice. The renderer is created with its defaults, and the
    // extension plane applies the released lock as it attaches, which turns the renderer's pinch off
    // for the chart's own.
    const created = chartSrc.slice(chartSrc.indexOf('createRenderer(gestures, {'), chartSrc.indexOf('const anchor:'))
    expect(created).not.toContain('handleScroll')
    expect(created).not.toContain('handleScale')
    expect(extensionsSrc).toContain('series.lockPanZoom(false)')
    expect(chartSrc).toContain('attachPinch({ chart, target: gestures })')
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

describe('press and hold is the touch way into the context menu', () => {
  it('one finger, held still, for the measured hold', () => {
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

  it('asks for the menu on a scale, and leaves a hold on the plot to the crosshair', () => {
    const plot = { left: 40, right: 340, bottom: 500 }
    expect(holdRaisesMenu({ x: 200, y: 250, plot })).toBe(false)
    expect(holdRaisesMenu({ x: 360, y: 250, plot })).toBe(true)
    expect(holdRaisesMenu({ x: 20, y: 250, plot })).toBe(true)
    expect(holdRaisesMenu({ x: 200, y: 520, plot })).toBe(true)
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
  it('the package places every registered tool and the transient tools, without asking a host', () => {
    // Placement is chart behavior: every tool the catalog registers is placeable by the package's
    // own pointer loop, and so are the three transient tools. Only a name the catalog does not
    // know is refused, and that answer comes from the package rather than from an app catalog.
    expect(placeableByWidget('trend_line')).toBe(true)
    expect(placeableByWidget('long_position')).toBe(true)
    expect(placeableByWidget('content_card')).toBe(true)
    expect(placeableByWidget('brush')).toBe(true)
    expect(placeableByWidget('measure')).toBe(true)
    expect(placeableByWidget('not-a-tool')).toBe(false)
  })
  it('an armed tool owns the touch surface until it is disarmed', () => {
    // The chart reads the layer's own armed tool rather than a flag of its own, so arming from any
    // door (the drawing toolbar, a host command, a keyboard shortcut) stands the hold down the same
    // way.
    expect(chartSrc).toContain('toolArmed: () => drawings.handle?.activeTool() != null')
  })
})
