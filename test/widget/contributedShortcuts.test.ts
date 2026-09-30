// @vitest-environment happy-dom
// The CONTRIBUTED half of the keyboard. A row an extension puts on the level menu carries a chord,
// and that chord is a real binding: the press runs the row's own action at the level under the
// pointer, on the tile the pointer is over, through the very same `run` the click uses. What is
// pinned here is that the level and the chart context travel with the press, that a row the
// contribution did not offer (no permission, no account, nothing to act on) leaves the key alone,
// that a press with no readable level under the pointer does nothing, that a two-tile layout acts
// on the tile the pointer is in rather than the active one, and that disposal unbinds.
import { describe, expect, it } from 'vitest'
import type { ChartExtensionHost, ChartExtensionMenuContext, ChartExtensionMenuItem } from '../../src/extension'
import { createChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { createCommandRegistry } from '../../src/widget/commands'
import { attachMenuPlane } from '../../src/widget/menu'
import { attachShortcuts, normalizeShortcut, tileAtPoint } from '../../src/widget/shortcuts'
import { fakeChart } from '../drawings/fakeChart'
import { ownIcons } from '../ownIcons'

function fakeRoot() {
  let handler: ((event: KeyboardEvent) => void) | null = null
  const root = {
    hasAttribute: () => false,
    tabIndex: 0,
    addEventListener: (_type: string, fn: (event: KeyboardEvent) => void) => {
      handler = fn
    },
    removeEventListener: () => {
      handler = null
    },
  }
  const press = (over: Partial<KeyboardEvent> & { code: string }): { prevented: boolean } => {
    let prevented = false
    handler?.({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault: () => {
        prevented = true
      },
      ...over,
    } as unknown as KeyboardEvent)
    return { prevented }
  }
  return { root: root as unknown as HTMLElement, press, bound: () => handler !== null }
}

describe('a printed chord names a physical key', () => {
  it('reads a letter and a digit the way a row prints them', () => {
    expect(normalizeShortcut('Alt + A')).toBe('Alt+KeyA')
    expect(normalizeShortcut('Shift + T')).toBe('Shift+KeyT')
    expect(normalizeShortcut('Alt + Shift + S')).toBe('Alt+Shift+KeyS')
    expect(normalizeShortcut('Ctrl + 1')).toBe('Ctrl+Digit1')
    expect(normalizeShortcut('Alt+KeyR')).toBe('Alt+KeyR')
  })
})

describe('the dispatcher offers a leftover press to the contributions', () => {
  const rig = (contributions: (pressed: string) => boolean) => {
    const seen: string[] = []
    const handle = createCommandRegistry()
    handle.registry.register({
      id: 'chart.view.reset',
      scope: 'chart',
      label: 'command.viewReset',
      shortcut: 'Alt+KeyR',
      available: () => true,
      execute: () => {
        seen.push('reset')
      },
    })
    const root = fakeRoot()
    const shortcuts = attachShortcuts({
      root: root.root,
      commands: handle.registry,
      contributions: (pressed) => {
        seen.push(pressed)
        return contributions(pressed)
      },
    })
    return { ...root, seen, shortcuts }
  }

  it('runs a contributed chord and takes the key', () => {
    const r = rig(() => true)
    expect(r.press({ code: 'KeyT', shiftKey: true }).prevented).toBe(true)
    expect(r.seen).toEqual(['Shift+KeyT'])
  })

  it('leaves the key alone when no contributed row claims it', () => {
    const r = rig(() => false)
    expect(r.press({ code: 'KeyT', shiftKey: true }).prevented).toBe(false)
    expect(r.seen).toEqual(['Shift+KeyT'])
  })

  it('asks the built-in verbs first, so a contribution cannot shadow a chart key', () => {
    const r = rig(() => true)
    expect(r.press({ code: 'KeyR', altKey: true }).prevented).toBe(true)
    expect(r.seen).toEqual(['reset'])
  })

  it('never asks while the viewer is typing or a modal holds the keyboard', () => {
    const r = rig(() => true)
    r.press({ code: 'KeyT', shiftKey: true, target: { tagName: 'INPUT', closest: () => null } as unknown as EventTarget })
    r.press({ code: 'KeyT', shiftKey: true, target: { tagName: 'DIV', closest: (s: string) => (s.includes('dialog') ? {} : null) } as unknown as EventTarget })
    expect(r.seen).toEqual([])
  })

  it('unbinds at disposal', () => {
    const r = rig(() => true)
    expect(r.bound()).toBe(true)
    r.shortcuts.dispose()
    expect(r.bound()).toBe(false)
    expect(r.press({ code: 'KeyT', shiftKey: true }).prevented).toBe(false)
    expect(r.seen).toEqual([])
  })
})

describe('the tile a pointer-level shortcut acts on', () => {
  const tiles = [
    { id: 'left', rect: { left: 0, top: 0, right: 100, bottom: 100 } },
    { id: 'right', rect: { left: 100, top: 0, right: 200, bottom: 100 } },
  ]

  it('is the tile the pointer is inside, active or not', () => {
    expect(tileAtPoint(tiles, { clientX: 150, clientY: 40 })).toBe('right')
    expect(tileAtPoint(tiles, { clientX: 10, clientY: 40 })).toBe('left')
  })

  it('is nothing when the pointer is outside every tile, or has not moved yet', () => {
    expect(tileAtPoint(tiles, { clientX: 400, clientY: 40 })).toBeNull()
    expect(tileAtPoint(tiles, null)).toBeNull()
  })
})

describe('a contributed row runs from the keyboard exactly as it runs from the menu', () => {
  const rig = (rows: (context: ChartExtensionMenuContext) => ChartExtensionMenuItem[]) => {
    const fake = fakeChart()
    const gestures = document.createElement('div')
    const chrome = document.createElement('div')
    document.body.append(gestures, chrome)
    const asked: ChartExtensionMenuContext[] = []
    const host = {
      menuItems: (context: ChartExtensionMenuContext) => {
        asked.push(context)
        return rows(context)
      },
    } as unknown as ChartExtensionHost
    const plane = attachMenuPlane({
      icons: ownIcons(),
      chart: fake.chart,
      series: () => fake.series,
      gestures,
      host: chrome,
      i18n: createChartI18n(),
      commands: createCommandRegistry().registry,
      formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
      minMove: () => 0.01,
      symbol: () => 'ES',
      symbolName: () => 'ES',
      timeframe: () => '5m',
      indicatorCount: () => 0,
      drawingCount: () => 0,
      extensions: () => host,
      setLevel: () => undefined,
    })
    return {
      plane,
      asked,
      fake,
      dispose: () => {
        plane.destroy()
        document.body.replaceChildren()
      },
    }
  }

  it('fires the row bound to the press, with the level and the chart under the pointer', () => {
    const ran: ChartExtensionMenuContext[] = []
    const r = rig((context) => [
      {
        id: 'host.add',
        label: 'Add',
        shortcut: 'Alt + A',
        run: () => {
          ran.push(context)
        },
      },
    ])
    expect(r.plane.runShortcutAt(20, 50, 'Alt+KeyA')).toBe(true)
    expect(ran).toHaveLength(1)
    expect(ran[0]!.symbol).toBe('ES')
    expect(ran[0]!.timeframe).toBe('5m')
    expect(ran[0]!.price).toBeGreaterThan(0)
    expect(ran[0]!.price).toBe(r.asked[0]!.price)
    expect(ran[0]!.priceText).toBe(r.asked[0]!.priceText)
    r.dispose()
  })

  it('refuses a press no offered row claims, which is how a withheld row refuses the keyboard', () => {
    const ran: string[] = []
    const r = rig(() => [
      {
        id: 'host.add',
        label: 'Add',
        shortcut: 'Alt + A',
        run: () => {
          ran.push('add')
        },
      },
    ])
    expect(r.plane.runShortcutAt(20, 50, 'Shift+KeyT')).toBe(false)
    expect(ran).toEqual([])
    r.dispose()
  })

  it('refuses when the point holds no readable level, without asking for a row', () => {
    const ran: string[] = []
    const r = rig(() => [
      {
        id: 'host.add',
        label: 'Add',
        shortcut: 'Alt + A',
        run: () => {
          ran.push('add')
        },
      },
    ])
    r.fake.priceAt = () => 0
    expect(r.plane.runShortcutAt(20, 50, 'Alt+KeyA')).toBe(false)
    expect(r.asked).toEqual([])
    expect(ran).toEqual([])
    r.dispose()
  })

  it('keeps the key when a contributed row throws, and never lets it reach the chart', () => {
    const r = rig(() => [
      {
        id: 'host.add',
        label: 'Add',
        shortcut: 'Alt + A',
        run: () => {
          throw new Error('host')
        },
      },
    ])
    expect(r.plane.runShortcutAt(20, 50, 'Alt+KeyA')).toBe(true)
    r.dispose()
  })
})
