// @vitest-environment happy-dom
// The menu the corner of the price scale opens: which rows it offers and what each runs, and how the
// menu and its flyouts stand and close. The corner button on a mounted chart is in
// `onChartFeatures.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountMenu, type ScaleMenuRow, type WidgetMenuHandle } from '../../src/contextMenuUi'
import { createChartI18n } from '../../src/i18n'
import { chartSettingsDefaults } from '../../src/settings/defaults'
import type { ChartSettings } from '../../src/settings/schema'
import { DARK_THEME } from '../../src/theme/palettes'
import type { CommandRegistry } from '../../src/widget/commands'
import { scaleMenuGroups, type ScaleMenuDeps } from '../../src/widget/scaleMenu'
import { ownIcons } from '../ownIcons'

function groups(over: Partial<ScaleMenuDeps> & { edit?: (settings: ChartSettings) => void } = {}) {
  const settings = chartSettingsDefaults(DARK_THEME)
  over.edit?.(settings)
  const execute = vi.fn()
  const rows = scaleMenuGroups({
    t: createChartI18n().t,
    commands: { execute } as unknown as CommandRegistry,
    settings: () => settings,
    scaleMode: () => 'normal',
    autoScale: () => true,
    side: () => 'right',
    ratio: () => 1.25054,
    extendedHours: () => true,
    shortcut: (command) => ({ 'chart.view.reset': 'Alt + R', 'chart.scale.toggleInvert': 'Alt + I', 'chart.scale.togglePercent': 'Alt + P', 'chart.scale.toggleLog': 'Alt + L' })[command] ?? null,
    shown: () => true,
    permitted: () => true,
    settingsDoor: true,
    ...over,
  })
  const row = (label: string): ScaleMenuRow => {
    const found = rows.flat().find((each) => each.label === label) ?? rows.flat().flatMap((each) => each.rows?.flat() ?? []).find((each) => each.label === label)
    if (!found) throw new Error(`no row ${label}`)
    return found
  }
  return { rows, row, execute }
}

describe('the scale menu rows', () => {
  it('reads in one order, a group at a time', () => {
    const { rows } = groups()
    expect(rows.map((group) => group.map((row) => row.label))).toEqual([
      ['Reset price scale'],
      ['Auto (fits data to screen)', 'Lock price to bar ratio', 'Scale price chart only', 'Invert scale'],
      ['Regular', 'Percent', 'Indexed to 100', 'Logarithmic'],
      ['Move scale to left'],
      ['Labels', 'Lines', 'Plus button'],
      ['More settings…'],
    ])
  })

  it('prints the keys, and the ratio on screen beside its lock', () => {
    const { rows } = groups()
    expect(rows.flat().filter((row) => row.shortcut).map((row) => [row.label, row.shortcut])).toEqual([
      ['Reset price scale', 'Alt + R'],
      ['Lock price to bar ratio', '1.2505'],
      ['Invert scale', 'Alt + I'],
      ['Percent', 'Alt + P'],
      ['Logarithmic', 'Alt + L'],
    ])
  })

  it('marks what stands', () => {
    const { rows, row } = groups({ scaleMode: () => 'percent', edit: (settings) => void (settings.priceScale.invertScale = true) })
    expect(rows.flat().filter((each) => each.checked).map((each) => each.label)).toEqual(['Auto (fits data to screen)', 'Invert scale', 'Percent', 'Plus button'])
    expect(row('Lock price to bar ratio').disabled).toBe(true)
  })

  it('goes back to the regular scale from the mode that stands', () => {
    const { row, execute } = groups({ scaleMode: () => 'indexed' })
    row('Indexed to 100').run?.()
    expect(execute).toHaveBeenLastCalledWith('chart.scale.normal', undefined)
    row('Logarithmic').run?.()
    expect(execute).toHaveBeenLastCalledWith('chart.scale.log', undefined)
  })

  it('offers the other side, by the setting', () => {
    const left = groups({ side: () => 'left' })
    left.row('Move scale to right').run?.()
    expect(left.execute).toHaveBeenLastCalledWith('chart.settings.apply', { settings: { priceScale: { placement: 'right' } } })
    const right = groups()
    right.row('Move scale to left').run?.()
    expect(right.execute).toHaveBeenLastCalledWith('chart.settings.apply', { settings: { priceScale: { placement: 'left' } } })
  })

  it('turns a label over, in its flyout', () => {
    const { row, execute } = groups()
    expect(row('Labels').rows?.map((group) => group.map((each) => each.label))).toEqual([
      ['Symbol name label', 'Symbol last price label', 'Symbol previous day close price label', 'Pre/post/night market price label', 'High and low price labels', 'Bid and ask labels', 'Indicators and financials name labels', 'Indicators and financials value labels', 'Countdown to bar close'],
      ['No overlapping labels'],
    ])
    expect(row('Lines').rows?.flat().map((each) => each.label)).toEqual(['Price line', 'Previous day close price line', 'Pre/post/night market price line', 'High and low price lines', 'Bid and ask lines'])
    row('High and low price labels').run?.()
    expect(execute).toHaveBeenLastCalledWith('chart.settings.apply', { settings: { priceLabels: { highLowValue: true } } })
  })

  it('dims the extended hours rows for a symbol that trades none', () => {
    const { row } = groups({ extendedHours: () => false })
    expect(row('Pre/post/night market price label').disabled).toBe(true)
    expect(row('Pre/post/night market price line').disabled).toBe(true)
  })

  it('resets through the chart reset, whose key it prints', () => {
    const { row, execute } = groups()
    expect(row('Reset price scale').shortcut).toBe('Alt + R')
    row('Reset price scale').run?.()
    expect(execute).toHaveBeenLastCalledWith('chart.view.reset', undefined)
  })

  it('holds the ratio its row prints, and lets go of a lock as it stands', () => {
    const open = groups()
    open.row('Lock price to bar ratio').run?.()
    expect(open.execute).toHaveBeenLastCalledWith('chart.settings.apply', { settings: { priceScale: { lockPriceToBarRatio: true, priceToBarRatio: 1.25054 } } })
    const held = groups({
      edit: (settings) => {
        settings.priceScale.lockPriceToBarRatio = true
      },
    })
    held.row('Lock price to bar ratio').run?.()
    expect(held.execute).toHaveBeenLastCalledWith('chart.settings.apply', { settings: { priceScale: { lockPriceToBarRatio: false } } })
  })

  it('draws what the policy refuses disabled, and leaves it out where the host hides it', () => {
    const refused = groups({ permitted: (command) => command !== 'chart.settings.apply' })
    expect(refused.row('Invert scale').disabled).toBeUndefined()
    expect(refused.row('Plus button').disabled).toBe(true)
    const hidden = groups({ shown: (command) => command !== 'chart.settings.apply' })
    expect(hidden.rows.map((group) => group.map((row) => row.label))).toEqual([
      ['Reset price scale'],
      ['Auto (fits data to screen)', 'Invert scale'],
      ['Regular', 'Percent', 'Indexed to 100', 'Logarithmic'],
      ['More settings…'],
    ])
  })

  it('leaves out the settings door on a chart that offers none', () => {
    const { rows } = groups({ settingsDoor: false })
    expect(rows.at(-1)!.map((row) => row.label)).toEqual(['Labels', 'Lines', 'Plus button'])
  })

  it('opens the settings on their Scales page', () => {
    const { row, execute } = groups()
    row('More settings…').run?.()
    expect(execute).toHaveBeenLastCalledWith('chart.settings.open', { page: 'scales' })
  })
})

describe('the scale menu on the page', () => {
  let menu: WidgetMenuHandle | null = null
  afterEach(() => {
    menu?.destroy()
    menu = null
    document.body.replaceChildren()
  })

  const raise = (rows: readonly (readonly ScaleMenuRow[])[], focus = false) => {
    const host = document.createElement('div')
    document.body.append(host)
    menu = mountMenu(host, () => undefined, createChartI18n(), ownIcons())
    const expanded = vi.fn()
    menu.openScale({ left: 900, top: 500, right: 960, bottom: 528, side: 'right' }, () => rows, focus, expanded)
    const boxes = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('.qc-price-menu')).filter((box) => !box.hidden)
    const button = (text: string): HTMLButtonElement => Array.from(host.querySelectorAll<HTMLButtonElement>('.qc-menu-row')).find((each) => each.textContent?.includes(text))!
    return { boxes, button, expanded }
  }
  const enter = (button: HTMLElement): void => {
    const event = new MouseEvent('pointerenter')
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    button.dispatchEvent(event)
  }

  it('says it stands open, and closes with a press of a row', () => {
    const run = vi.fn()
    const { boxes, button, expanded } = raise([[{ label: 'One', run }]])
    expect(expanded).toHaveBeenLastCalledWith(true)
    button('One').click()
    expect(run).toHaveBeenCalledOnce()
    expect(boxes()).toEqual([])
    expect(expanded).toHaveBeenLastCalledWith(false)
  })

  it('stands a flyout inside a viewport too narrow for it beside the menu', () => {
    const box = { left: 8, right: 257, top: 100, bottom: 400, width: 249, height: 300 } as DOMRect
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box)
    vi.stubGlobal('innerWidth', 375)
    try {
      const { boxes, button } = raise([[{ label: 'Held', rows: [[{ label: 'Inside', run: vi.fn() }]] }]])
      enter(button('Held'))
      expect(boxes()[1]!.style.left).toBe('126px')
    } finally {
      measured.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('opens a flyout under the pointer and closes it on another row', () => {
    const run = vi.fn()
    const { boxes, button } = raise([[{ label: 'Held', rows: [[{ label: 'Inside', run }]] }, { label: 'Other', run: vi.fn() }]])
    enter(button('Held'))
    expect(boxes()).toHaveLength(2)
    expect(button('Held').dataset.qcFlyout).toBe('open')
    enter(button('Other'))
    expect(boxes()).toHaveLength(1)
    expect(button('Held').dataset.qcFlyout).toBe('shut')
    enter(button('Held'))
    button('Inside').click()
    expect(run).toHaveBeenCalledOnce()
    expect(boxes()).toEqual([])
  })

  it('keeps open for a press on the row that holds a flyout, and for a press inside it', () => {
    const { boxes, button } = raise([[{ label: 'Held', rows: [[{ label: 'Inside', disabled: true }]] }]])
    button('Held').click()
    expect(boxes()).toHaveLength(2)
    expect(button('Inside').disabled).toBe(true)
    button('Inside').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(boxes()).toHaveLength(2)
  })

  it('closes with a press off it, which reaches nothing beneath', () => {
    const { boxes, expanded } = raise([[{ label: 'One', run: vi.fn() }]])
    const beneath = vi.fn()
    document.body.addEventListener('pointerdown', beneath)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    document.body.removeEventListener('pointerdown', beneath)
    expect(boxes()).toEqual([])
    expect(expanded).toHaveBeenLastCalledWith(false)
    expect(beneath).not.toHaveBeenCalled()
  })

  it('walks with the arrow keys, in and out of a flyout, and Escape steps back', () => {
    const { boxes, button } = raise(
      [
        [
          { label: 'Skipped', disabled: true },
          { label: 'First', run: vi.fn() },
          { label: 'Held', rows: [[{ label: 'Inside', run: vi.fn() }]] },
        ],
      ],
      true,
    )
    const press = (key: string): void => void window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    expect(document.activeElement).toBe(button('First'))
    press('ArrowDown')
    expect(document.activeElement).toBe(button('Held'))
    press('ArrowRight')
    expect(boxes()).toHaveLength(2)
    expect(document.activeElement).toBe(button('Inside'))
    press('ArrowLeft')
    expect(boxes()).toHaveLength(1)
    expect(document.activeElement).toBe(button('Held'))
    press('ArrowRight')
    press('Escape')
    expect(boxes()).toHaveLength(1)
    expect(document.activeElement).toBe(button('Held'))
    press('Escape')
    expect(boxes()).toEqual([])
  })
})
