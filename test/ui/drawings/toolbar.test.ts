// @vitest-environment happy-dom
// The drawing toolbar, model to DOM: what each button wears and says, which command each press
// runs, how the flyouts open and close, the keyboard over the toolbar, and the gating a refused tool
// gets. The state is a plain object the test edits between renders, so every assertion names the
// state that produced it.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { DEFAULT_FAVORITES, DEFAULT_HIDE_STATE } from '../../../src/drawings/index'
import { mountDrawingToolbar, type ToolbarState } from '../../../src/ui/drawings/toolbar'

const i18n = createChartI18n()

function rig(over: Partial<ToolbarState> = {}, options: { refuse?: string[]; deny?: string[] } = {}) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const state: ToolbarState = {
    activeTool: null,
    cursor: 'cross',
    magnet: 'off',
    stayInDrawingMode: false,
    allLocked: false,
    hide: DEFAULT_HIDE_STATE,
    sync: true,
    removeLocked: false,
    counts: { total: 0, locked: 0 },
    indicatorCount: 0,
    railTools: {},
    favorites: DEFAULT_FAVORITES,
    recentGlyphs: [],
    layoutCharts: 1,
    ...over,
  }
  const ran: [string, unknown][] = []
  const toolbar = mountDrawingToolbar({
    chrome,
    t: i18n.t,
    state: () => state,
    run: (command, arg) => {
      ran.push([command, arg])
      return true
    },
    available: (command) => !(options.deny ?? []).includes(command),
    toolAllowed: (type) => !(options.refuse ?? []).includes(type),
    idBase: 'c1-drawing',
  })
  const buttons = () => [...chrome.querySelectorAll<HTMLButtonElement>('[data-role="drawing-toolbar"] button')]
  const byLabel = (label: string) => buttons().find((b) => b.getAttribute('aria-label') === label)!
  const popover = () => chrome.querySelector<HTMLElement>('[data-role="drawing-popover"]')
  return { chrome, state, ran, toolbar, buttons, byLabel, popover }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the rail', () => {
  it('renders the cursor, seven groups with their arrows, the actions, and the favorites star, and no sync on one chart', () => {
    const { buttons, chrome } = rig()
    const rail = chrome.querySelector('[data-role="drawing-toolbar"]')!
    expect(rail.getAttribute('role')).toBe('toolbar')
    expect(rail.getAttribute('aria-orientation')).toBe('vertical')
    expect(rail.getAttribute('aria-label')).toBe('Drawing tools')
    // cursor (2) + seven groups (14) + measure + zoom + magnet (2) + stay + lock + eye (2) + remove (2) + favorites
    expect(buttons()).toHaveLength(27)
    expect(buttons().filter((b) => b.getAttribute('aria-label') === 'Sync drawings across the layout')).toHaveLength(0)
  })

  it('shows the sync switch only in a layout of more than one chart, and it runs the sync command', () => {
    const { state, toolbar, buttons, byLabel, ran } = rig({ layoutCharts: 2 })
    expect(buttons()).toHaveLength(28)
    const sync = byLabel('Sync drawings across the layout')
    expect(sync.getAttribute('aria-pressed')).toBe('true')
    expect(sync.title).toContain('replicated')
    sync.click()
    expect(ran).toEqual([['chart.drawings.sync', false]])
    state.layoutCharts = 1
    toolbar.render()
    expect(buttons()).toHaveLength(27)
  })

  it('names each group face by the tool it arms, and the face arms it', () => {
    const { byLabel, ran, state, toolbar } = rig()
    byLabel('Trend line').click()
    expect(ran).toEqual([['chart.drawings.arm', 'trend_line']])
    state.railTools = { trend: 'ray' }
    toolbar.render()
    expect(byLabel('Ray')).toBeTruthy()
    byLabel('Ray').click()
    expect(ran[1]).toEqual(['chart.drawings.arm', 'ray'])
  })

  it('marks the armed group, the cursor at rest, and the transient tools', () => {
    const { state, toolbar, byLabel } = rig()
    expect(byLabel('Cursor').dataset.qcActive).toBe('true')
    state.activeTool = 'fib_retracement'
    toolbar.render()
    expect(byLabel('Cursor').dataset.qcActive).toBe('false')
    expect(byLabel('Fib retracement').dataset.qcActive).toBe('true')
    state.activeTool = 'measure'
    toolbar.render()
    expect(byLabel('Measure').dataset.qcActive).toBe('true')
    byLabel('Measure').click()
    state.activeTool = 'eraser'
    toolbar.render()
    expect(byLabel('Cursor').dataset.qcActive).toBe('true')
  })

  it('releases a transient on its own second press, and arms it on the first', () => {
    const { state, toolbar, byLabel, ran } = rig()
    byLabel('Zoom in').click()
    expect(ran).toEqual([['chart.drawings.arm', 'zoom']])
    state.activeTool = 'zoom'
    toolbar.render()
    byLabel('Zoom in').click()
    expect(ran[1]).toEqual(['chart.drawings.arm', null])
  })

  it('the cursor face releases the tool; its menu picks a mode or the eraser', () => {
    const { byLabel, ran, popover } = rig({ cursor: 'dot' })
    byLabel('Cursor').click()
    expect(ran).toEqual([['chart.drawings.arm', null]])
    byLabel('Cursor menu').click()
    const menu = popover()!
    expect(menu.querySelector('[role="menu"]')).toBeTruthy()
    const rows = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Cross', 'Dot', 'Arrow', 'Eraser'])
    expect(rows[1]!.getAttribute('aria-checked')).toBe('true')
    rows[2]!.click()
    expect(ran[1]).toEqual(['chart.drawings.cursor', 'arrow'])
    expect(popover()).toBeNull() // the pick closes the menu
    byLabel('Cursor menu').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')][3]!.click()
    expect(ran[2]).toEqual(['chart.drawings.arm', 'eraser'])
  })

  it('the magnet toggles from its face and picks a strength from its menu', () => {
    const { state, toolbar, byLabel, ran, popover } = rig()
    byLabel('Magnet').click()
    expect(ran).toEqual([['chart.drawings.magnet', 'weak']])
    state.magnet = 'strong'
    toolbar.render()
    expect(byLabel('Magnet').getAttribute('aria-pressed')).toBe('true')
    byLabel('Magnet').click()
    expect(ran[1]).toEqual(['chart.drawings.magnet', 'off'])
    byLabel('Magnet menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Weak magnet', 'Strong magnet'])
    rows[1]!.click() // picking the active strength releases the magnet
    expect(ran[2]).toEqual(['chart.drawings.magnet', 'off'])
  })

  it('stay in mode and lock all are switches with their state in their name', () => {
    const { state, toolbar, byLabel, ran } = rig()
    byLabel('Stay in drawing mode').click()
    expect(ran[0]).toEqual(['chart.drawings.stayInMode', true])
    byLabel('Lock all drawings').click()
    expect(ran[1]).toEqual(['chart.drawings.lockAll', true])
    state.allLocked = true
    state.stayInDrawingMode = true
    toolbar.render()
    expect(byLabel('Unlock all drawings').getAttribute('aria-pressed')).toBe('true')
    expect(byLabel('Stay in drawing mode').getAttribute('aria-pressed')).toBe('true')
  })

  it('the eye blanks its subject and its menu picks the subject in one gesture', () => {
    const { state, toolbar, byLabel, ran, popover } = rig()
    byLabel('Hide drawings').click()
    expect(ran[0]).toEqual(['chart.drawings.hide', { mode: 'drawings', on: true }])
    state.hide = { mode: 'drawings', on: true }
    toolbar.render()
    expect(byLabel('Show drawings').getAttribute('aria-pressed')).toBe('true')
    byLabel('Hide menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Hide drawings', 'Hide indicators', 'Hide all'])
    expect(rows[0]!.getAttribute('aria-checked')).toBe('true')
    rows[2]!.click()
    expect(ran[1]).toEqual(['chart.drawings.hide', { mode: 'all', on: true }])
  })

  it('the remove menu names what each row takes, offers nothing for nothing, and carries the policy switch', () => {
    const { state, toolbar, byLabel, ran, popover } = rig({ counts: { total: 3, locked: 1 }, indicatorCount: 2 })
    expect(byLabel('Remove drawings').title).toBe('Remove 2 drawings')
    byLabel('Remove drawings').click()
    expect(ran[0]).toEqual(['chart.drawings.removeAll', false])
    byLabel('Remove menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Remove 2 drawings', 'Remove 2 indicators', 'Remove 2 drawings & 2 indicators'])
    rows[2]!.click()
    expect(ran.slice(1)).toEqual([
      ['chart.drawings.removeAll', false],
      ['chart.indicators.removeAll', undefined],
    ])
    byLabel('Remove menu').click()
    const policy = popover()!.querySelector<HTMLElement>('[role="switch"]')!
    expect(policy.getAttribute('aria-checked')).toBe('false')
    policy.click()
    expect(ran[3]).toEqual(['chart.drawings.removeLockedPolicy', true])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    state.counts = { total: 0, locked: 0 }
    state.indicatorCount = 0
    toolbar.render()
    byLabel('Remove menu').click()
    expect(popover()!.textContent).toContain('Nothing to remove')
  })

  it('the favorites star toggles the bar', () => {
    const { byLabel, ran } = rig()
    byLabel('Favorite drawing tools toolbar').click()
    expect(ran).toEqual([['chart.drawings.favoritesBar', false]])
  })
})

describe('a group flyout', () => {
  it('lists the sections and their tools, arms a row, and stars a tool through the favorite command', () => {
    const { byLabel, ran, popover } = rig()
    byLabel('Trend tools menu').click()
    const flyout = popover()!
    expect(flyout.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('Trend tools')
    expect([...flyout.querySelectorAll('.qc-dialog-heading')].map((h) => h.textContent)).toEqual(['Lines', 'Channels', 'Pitchforks'])
    const rows = [...flyout.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(rows.length).toBe(9 + 4 + 4)
    expect(rows[0]!.textContent).toBe('Trend line')
    expect(rows[0]!.querySelector('svg')).toBeTruthy()
    const star = flyout.querySelector<HTMLButtonElement>('.qc-drawing-star')!
    expect(star.getAttribute('aria-label')).toBe('Add Trend line to favorites')
    star.click()
    expect(ran[0]).toEqual(['chart.drawings.favorite', 'trend_line'])
    rows[1]!.click()
    expect(ran[1]).toEqual(['chart.drawings.arm', 'ray'])
    expect(popover()).toBeNull()
  })

  it('renders a control whose command the registry refuses disabled, never hidden, on the rail and in its menus', () => {
    const { buttons, byLabel, popover, state, toolbar } = rig({ counts: { total: 2, locked: 0 } }, { deny: ['chart.drawings.arm', 'chart.drawings.magnet', 'chart.drawings.removeAll'] })
    expect(buttons()).toHaveLength(27)
    expect(byLabel('Cursor').disabled).toBe(true)
    expect(byLabel('Trend line').disabled).toBe(true)
    expect(byLabel('Trend tools menu').disabled).toBe(true)
    expect(byLabel('Measure').disabled).toBe(true)
    expect(byLabel('Magnet').disabled).toBe(true)
    expect(byLabel('Magnet menu').disabled).toBe(true)
    expect(byLabel('Remove drawings').disabled).toBe(true)
    expect(byLabel('Lock all drawings').disabled).toBe(false)
    expect(byLabel('Stay in drawing mode').disabled).toBe(false)
    // The cursor's menu is its own command, so it still opens; the eraser row arms and is refused.
    byLabel('Cursor menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.disabled)).toEqual([false, false, false, true])
    byLabel('Remove menu').click()
    const remove = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(remove.map((r) => r.disabled)).toEqual([true])
    expect(popover()!.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(false)
    // With studies on the chart, the row that takes both needs both commands; only the row that
    // takes studies alone is live while removing drawings is refused.
    state.indicatorCount = 1
    toolbar.render()
    byLabel('Remove menu').click()
    byLabel('Remove menu').click()
    const three = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(three).toHaveLength(3)
    const live = three.filter((r) => !r.disabled)
    expect(live).toHaveLength(1)
    expect(live[0]!.textContent).toContain('indicator')
    expect(live[0]!.textContent).not.toContain('drawing')
    state.counts = { total: 0, locked: 0 }
    toolbar.render()
    expect(byLabel('Remove drawings').disabled).toBe(true)
    expect(byLabel('Remove menu').disabled).toBe(false)
  })

  it('the Image tool row is live only while an image could be placed', () => {
    const imageRow = (r: ReturnType<typeof rig>): HTMLButtonElement => {
      for (const arrow of r.buttons().filter((b) => / menu$/.test(b.getAttribute('aria-label') ?? ''))) {
        arrow.click()
        const row = r.popover()?.querySelector<HTMLButtonElement>('[data-tool="image"]')
        if (row) return row
        arrow.click()
      }
      throw new Error('no Image row on the rail')
    }
    expect(imageRow(rig({}, { deny: ['chart.drawings.placeImage'] })).disabled).toBe(true)
    document.body.replaceChildren()
    expect(imageRow(rig()).disabled).toBe(false)
  })

  it('renders a refused tool disabled, on its row and on the face', () => {
    const { byLabel, popover, state, toolbar } = rig({}, { refuse: ['trend_line', 'ray'] })
    expect(byLabel('Trend line').disabled).toBe(true)
    byLabel('Trend tools menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows[0]!.disabled).toBe(true)
    expect(rows[1]!.disabled).toBe(true)
    expect(rows[2]!.disabled).toBe(false)
    state.railTools = { trend: 'info_line' }
    toolbar.render()
    expect(byLabel('Info line').disabled).toBe(false)
  })

  it('opens one flyout at a time, closes on Escape and returns focus to its arrow', () => {
    const { byLabel, popover } = rig()
    byLabel('Trend tools menu').click()
    expect(popover()!.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('Trend tools')
    byLabel('Shapes menu').click()
    expect(document.querySelectorAll('[data-role="drawing-popover"]')).toHaveLength(1)
    expect(popover()!.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('Shapes')
    expect(byLabel('Shapes menu').getAttribute('aria-expanded')).toBe('true')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(popover()).toBeNull()
    expect(byLabel('Shapes menu').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(byLabel('Shapes menu'))
  })

  it('the glyph group opens the picker from its face as well as its arrow, and a pick arms with the glyph', () => {
    const { byLabel, ran, popover } = rig()
    byLabel('Emojis & stickers').click()
    const picker = popover()!.querySelector<HTMLElement>('[role="dialog"]')!
    expect(picker.getAttribute('aria-label')).toBe('Glyph picker')
    const cell = picker.querySelector<HTMLButtonElement>('.qc-drawing-glyph-cell')!
    cell.click()
    expect(ran[0]).toEqual(['chart.drawings.arm', { tool: 'emoji', props: { glyph: cell.getAttribute('aria-label') } }])
    expect(popover()).toBeNull()
  })
})

describe('the keyboard', () => {
  it('roves focus over the rail with the arrow keys and lands on the first row of an open menu', () => {
    const { chrome, byLabel, buttons, popover } = rig()
    const rail = chrome.querySelector<HTMLElement>('[data-role="drawing-toolbar"]')!
    const first = buttons()[0]!
    expect(first.tabIndex).toBe(0)
    expect(buttons()[1]!.tabIndex).toBe(-1)
    first.focus()
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(buttons()[1])
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(buttons()[buttons().length - 1])
    byLabel('Hide menu').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(document.activeElement).toBe(rows[0])
    popover()!.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(rows[1])
  })

  it('re-reads every label on relabel, in the language the translator now speaks', async () => {
    // A host locale with one translated word: the built-in languages seed a new key with English
    // until it is translated, so a translation the test controls is what proves the relabel.
    const strings = createChartI18n('en', {
      locales: [
        {
          code: 'fr-CA',
          endonym: 'Français (Canada)',
          tag: 'fr-CA',
          dir: 'ltr',
          dictionary: async () => ({ default: { ...(await import('../../../src/i18n/en')).en, 'drawing.toolbar': 'Outils de dessin' } as never }),
        },
      ],
    })
    const chrome = document.createElement('div')
    document.body.appendChild(chrome)
    // The widget hands its surfaces a translator that reads the current language at every call.
    const live = ((...args: unknown[]) => (strings.t as unknown as (...a: unknown[]) => string)(...args)) as unknown as typeof strings.t
    const toolbar = mountDrawingToolbar({
      chrome,
      t: live,
      state: () => ({ activeTool: null, cursor: 'cross', magnet: 'off', stayInDrawingMode: false, allLocked: false, hide: DEFAULT_HIDE_STATE, sync: true, removeLocked: false, counts: { total: 0, locked: 0 }, indicatorCount: 0, railTools: {}, favorites: DEFAULT_FAVORITES, recentGlyphs: [], layoutCharts: 1 }),
      run: () => true,
      available: () => true,
      toolAllowed: () => true,
      idBase: 'c1-drawing',
    })
    await strings.setLocale('fr-CA')
    toolbar.relabel()
    const rail = chrome.querySelector('[data-role="drawing-toolbar"]')!
    expect(rail.getAttribute('aria-label')).toBe('Outils de dessin')
    toolbar.destroy()
    expect(chrome.children).toHaveLength(0)
  })
})
