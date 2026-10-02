// The timeframe picker: the saved timeframes as quick-select chips (smallest first, the active one
// pressed, always including the active timeframe even when unsaved) and a drop-down over the 26
// presets in their five groups, each collapsible, with the viewer's custom tokens interleaved into
// their unit's group, a star per row that saves it as a chip, a delete on each custom row, and a
// footer that composes a custom token clamped by the unit's ceiling. Every row is a command:
// `chart.timeframe.<token>` for a preset, `chart.timeframe.set` for a custom token, so a token the
// feed or the symbol cannot serve is disabled as a chip and left out of the list rather than sent.
// When the host names the timeframes the widget offers, the chips and the rows are that list alone:
// a group with no listed token is not drawn, a listed token beyond the presets sits in its unit's
// group without a delete, and there is no composer.
//
// The grouped list and its composer are built from a model, so the picker a page opens on its own,
// away from any chart, draws the same rows from the same code: it hands in its own value and a
// callback where the chart hands in its timeframe, the viewer's saved tokens and the registry.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import {
  allowedTimeframes,
  formatTimeframe,
  parseTimeframe,
  timeframeChipLabel,
  timeframeGroupUnit,
  timeframeLabel,
  timeframeOrder,
  TIMEFRAME_MAX,
  TIMEFRAME_PRESET_TOKENS,
  TIMEFRAME_PRESETS,
  TIMEFRAME_UNIT_NAME,
  TIMEFRAME_UNITS,
  type TimeframeRestrictions,
  type TimeframeUnit,
} from '../../timeframe'
import type { OfferedTimeframes } from '../../widget/timeframes'
import type { IconResolver } from '../icons/resolver'
import { activeChart, shows, type ChromeContext } from './context'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { button, h, items, name, replace, setDisabled } from './dom'
import { ICONS } from '../controls/icons'
import { menuItem, openMenu, toggleMenu, type MenuHandle } from './menu'
import type { TimeframeStore } from './preferences'

export interface TimeframePickerDeps extends ChromeContext {
  store: TimeframeStore
  restrictions(): TimeframeRestrictions
}

export interface TimeframePickerHandle {
  element: HTMLElement
  sync(): void
  destroy(): void
}

/** What the grouped list and its composer read and do. */
export interface TimeframeListModel {
  i18n: ChartI18n
  icons: IconResolver
  /** The timeframes on offer: the host's list, or the presets with or without custom tokens. */
  offered: OfferedTimeframes
  /** The chosen token, which its row wears checked, or null for none. */
  active(): string | null
  /** The custom tokens the list interleaves into their units' groups when there is no host list. */
  custom(): readonly string[]
  /** What the feed and the symbol serve. A token they do not serve is left out of the list. */
  restrictions(): TimeframeRestrictions
  /** Whether a row other than the chosen one can be picked now. */
  available(token: string): boolean
  /** Whether a row is drawn at all. */
  listed(token: string, active: string | null): boolean
  /** Take a token: a row's pick, or a composed token once `addCustom` took it. */
  choose(token: string): void
  /** Hold a composed token. Answers whether it was taken; one that is not is not chosen. */
  addCustom(token: string): boolean
  /** Whether the composer may offer a token beyond being new. Absent, every new token. */
  composable?(token: string): boolean
  /** The saved tokens a row's star toggles. Absent, rows carry no star. */
  saved?: { includes(token: string): boolean; toggle(token: string): void }
  /** Forget a custom token. Absent, custom rows carry no delete. */
  removeCustom?(token: string): void
  /** Called after a star or a delete, so whatever else shows the saved tokens moves with them. */
  changed?(): void
  /** The groups the reader collapsed, kept as long as the list's owner keeps the set. */
  collapsed: Set<TimeframeUnit>
}

/** Whether the list carries the custom composer: only where custom tokens are offered. */
export const composesTimeframes = (offered: OfferedTimeframes): boolean => offered.list === null && offered.custom

/** The command that sets a token: the preset's own, or the open-ended setter for a custom token. */
export const timeframeCommand = (token: string): { id: string; arg?: string } =>
  TIMEFRAME_PRESET_TOKENS.has(token) ? { id: `chart.timeframe.${token}` } : { id: 'chart.timeframe.set', arg: token }

/** Fill a list body with the unit groups and their rows. `refresh` redraws the list in place, which
 *  is what a group's collapse, a star and a delete ask for. */
export function buildTimeframeRows(body: HTMLElement, model: TimeframeListModel, refresh: () => void): void {
  const t = model.i18n.t
  const active = model.active()
  const custom = model.custom()
  const groupOf = (token: string): TimeframeUnit => timeframeGroupUnit(parseTimeframe(token)?.unit ?? 'd')
  const offeredList = model.offered.list
  let drawn = 0
  TIMEFRAME_PRESETS.forEach((group) => {
    const offered = offeredList ? offeredList.filter((token) => groupOf(token) === group.unit) : [...group.tokens, ...custom.filter((c) => groupOf(c) === group.unit)]
    if (offered.length === 0) return
    const allowed = allowedTimeframes(offered, model.restrictions()).sort((a, b) => timeframeOrder(a) - timeframeOrder(b))
    const tokens = allowed.filter((token) => model.listed(token, active))
    // A group whose every row the host hides is not drawn, heading and rule included.
    if (allowed.length > 0 && tokens.length === 0) return
    if (drawn++ > 0) body.appendChild(h('div', { class: 'qc-separator', role: 'separator' }))
    const isCollapsed = model.collapsed.has(group.unit)
    const heading = h('button', { type: 'button', class: 'qc-tf-group', 'data-qc-item': '', tabindex: '-1', 'aria-expanded': String(!isCollapsed) }, h('span', {}, t(TIMEFRAME_UNIT_NAME[group.unit])), model.icons.glyph(isCollapsed ? ICONS.chevronDown : ICONS.chevronUp, { size: 18 }))
    heading.addEventListener('click', () => {
      if (model.collapsed.has(group.unit)) model.collapsed.delete(group.unit)
      else model.collapsed.add(group.unit)
      refresh()
    })
    body.appendChild(heading)
    if (isCollapsed) return
    for (const token of tokens) {
      const row = h('div', { class: 'qc-tf-row', ...(token === active ? { 'data-qc-checked': 'true' } : {}) })
      const item = menuItem({
        text: timeframeLabel(t, token),
        className: 'qc-tf-item',
        role: 'menuitemradio',
        checked: token === active,
        disabled: token !== active && !model.available(token),
        onSelect: () => model.choose(token),
      })
      row.appendChild(item)
      if (model.removeCustom && custom.includes(token)) {
        const remove = model.removeCustom
        row.appendChild(
          button({
            label: t('timeframe.delete', { timeframe: timeframeLabel(t, token) }),
            icon: model.icons.glyph(ICONS.trash, { size: 18 }),
            className: 'qc-tf-side',
            onClick: () => {
              remove(token)
              refresh()
              model.changed?.()
            },
          }),
        )
      }
      if (model.saved) {
        const saved = model.saved
        const star = button({
          label: t('timeframe.save', { timeframe: timeframeLabel(t, token) }),
          // The same star a tool wears in the drawing flyouts, on its own 18 grid.
          icon: model.icons.glyph(saved.includes(token) ? ICONS.starFilled : ICONS.star, { size: 18 }),
          className: 'qc-tf-side',
          pressed: saved.includes(token),
          onClick: () => {
            saved.toggle(token)
            refresh()
            model.changed?.()
          },
        })
        row.appendChild(star)
      }
      body.appendChild(row)
    }
  })
  // The side controls sit off the vertical rove: ArrowRight from a row reaches them and
  // ArrowLeft returns, so a keyboard can star or delete without the list losing its shape.
  body.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (e.key === 'ArrowRight' && target.hasAttribute('data-qc-item')) {
      const side = target.parentElement?.querySelector<HTMLElement>('.qc-tf-side')
      if (side) {
        e.preventDefault()
        e.stopPropagation()
        side.focus()
      }
    } else if (e.key === 'ArrowRight' && target.classList.contains('qc-tf-side')) {
      const next = target.nextElementSibling as HTMLElement | null
      if (next?.classList.contains('qc-tf-side')) {
        e.preventDefault()
        e.stopPropagation()
        next.focus()
      }
    } else if (e.key === 'ArrowLeft' && target.classList.contains('qc-tf-side')) {
      e.preventDefault()
      e.stopPropagation()
      target.parentElement?.querySelector<HTMLElement>('[data-qc-item]')?.focus()
    }
  })
}

/** Put focus on the checked row, which is where the eye goes first, when the list has one. */
export function focusCheckedTimeframe(root: HTMLElement): void {
  const list = items(root)
  const activeIndex = list.findIndex((el) => el.getAttribute('aria-checked') === 'true')
  if (activeIndex >= 0) list[activeIndex]?.focus()
}

/** The footer: a count field, a unit select, and Add. Enter or Add holds the token and chooses it;
 *  Add is disabled while the pair is invalid or the token already exists. */
export function buildTimeframeComposer(model: TimeframeListModel): HTMLElement {
  const t = model.i18n.t
  let count = '1'
  let unit: TimeframeUnit = 'm'
  let unitOpen = false

  // The count sits in a filled shell with its own two-step spinner, rather than leaning on the
  // browser's number input: a native spinner is drawn by the platform, so its size, its ink and
  // whether it appears at all differ per browser, and none of it answers to the theme.
  const countInput = h('input', { class: 'qc-tf-count-input', inputmode: 'numeric', 'aria-label': t('timeframe.customCount'), value: count })
  const step = (label: string, className: string, delta: number): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: `qc-tf-spin ${className}`, 'aria-label': label, tabindex: '-1' }, model.icons.glyph(ICONS.chevronDown, { size: 18 })) as HTMLButtonElement
    b.addEventListener('click', () => {
      count = String(Math.min(TIMEFRAME_MAX[unit], Math.max(1, (Number(count) || 0) + delta)))
      countInput.value = count
      validate()
    })
    return b
  }
  const spinner = h('span', { class: 'qc-tf-spin-column' }, step(t('timeframe.increment'), 'qc-tf-spin-up', 1), step(t('timeframe.decrement'), 'qc-tf-spin-down', -1))
  const countField = h('div', { class: 'qc-tf-count' }, countInput, spinner)

  // The unit opens UPWARD onto its own list. A native select would draw the platform's menu
  // wherever the platform puts it, which on a footer this close to the bottom of the panel means
  // off the end of it; and the row it lands on could not be the menu row every other list uses.
  const unitLabel = h('span', { class: 'qc-tf-unit-label' }, t(TIMEFRAME_UNIT_NAME[unit]))
  const unitButton = h('button', { type: 'button', class: 'qc-tf-unit', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': t('timeframe.customUnit') }, unitLabel, model.icons.glyph(ICONS.chevronDown, { size: 18, className: 'qc-tf-unit-caret' })) as HTMLButtonElement
  const unitList = h('div', { class: 'qc-tf-unit-list', role: 'listbox', 'aria-label': t('timeframe.customUnit') })
  const closeUnit = (): void => {
    if (!unitOpen) return
    unitOpen = false
    unitButton.setAttribute('aria-expanded', 'false')
    unitList.hidden = true
    document.removeEventListener('pointerdown', onOutside, true)
  }
  const onOutside = (event: Event): void => {
    const target = event.target
    if (target instanceof Node && (unitField.contains(target) || unitButton.contains(target))) return
    closeUnit()
  }
  for (const u of TIMEFRAME_UNITS) {
    const option = h('button', { type: 'button', class: 'qc-menu-row', role: 'option', 'aria-selected': String(u === unit) }, h('span', { class: 'qc-menu-label' }, t(TIMEFRAME_UNIT_NAME[u])))
    option.addEventListener('click', () => {
      unit = u
      unitLabel.textContent = t(TIMEFRAME_UNIT_NAME[u])
      for (const row of unitList.children) row.setAttribute('aria-selected', String(row === option))
      closeUnit()
      validate()
    })
    unitList.appendChild(option)
  }
  unitList.hidden = true
  unitButton.addEventListener('click', () => {
    if (unitOpen) {
      closeUnit()
      return
    }
    unitOpen = true
    unitButton.setAttribute('aria-expanded', 'true')
    unitList.hidden = false
    document.addEventListener('pointerdown', onOutside, true)
  })
  const unitField = h('div', { class: 'qc-tf-unit-wrap' }, unitButton, unitList)

  const add = button({ label: t('timeframe.addCustom'), icon: model.icons.glyph(ICONS.plus, { size: 18 }), className: 'qc-tf-add', onClick: () => submit() })
  const token = (): string | null => (count ? formatTimeframe({ count: Number(count), unit }) : null)
  const existing = (): boolean => {
    const tk = token()
    return tk !== null && (TIMEFRAME_PRESET_TOKENS.has(tk) || model.custom().includes(tk))
  }
  const refused = (): boolean => {
    const tk = token()
    return tk !== null && model.composable !== undefined && !model.composable(tk)
  }
  const validate = (): void => {
    const tk = token()
    setDisabled(add, tk === null || existing() || refused())
    add.title = tk !== null && existing() ? t('timeframe.exists', { timeframe: timeframeLabel(t, tk) }) : t('timeframe.addCustom')
  }
  const submit = (): void => {
    const tk = token()
    if (tk === null || existing() || refused()) return
    if (!model.addCustom(tk)) return
    model.choose(tk)
    model.changed?.()
  }
  countInput.addEventListener('input', () => {
    count = countInput.value.replace(/\D/g, '').slice(0, 4)
    countInput.value = count
    validate()
  })
  countInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit()
  })
  validate()
  const key: ChartMessageKey = 'timeframe.custom'
  return h('div', { class: 'qc-tf-composer' }, h('div', { class: 'qc-menu-heading', role: 'presentation' }, t(key)), h('div', { class: 'qc-tf-composer-row' }, countField, unitField, add))
}

export function mountTimeframePicker(deps: TimeframePickerDeps): TimeframePickerHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const element = h('div', { class: 'qc-tf' })
  const chips = h('div', { class: 'qc-tf-chips', role: 'group', 'aria-label': t()('timeframe.title') })
  const caret = button({ label: t()('timeframe.all'), icon: deps.icons.glyph(ICONS.menuArrowWide, { size: 8, height: 4, className: 'qc-caret' }), className: 'qc-toolbar-button qc-tf-caret', onClick: () => toggleMenu(caret, openList) })
  caret.setAttribute('aria-haspopup', 'menu')
  caret.setAttribute('aria-expanded', 'false')
  element.append(chips, caret)
  const collapsed = new Set<TimeframeUnit>()
  let menu: MenuHandle | null = null
  /** What the open list last drew, so a sync that changes none of it leaves the list alone. */
  let listShape = ''

  const available = (token: string): boolean => {
    const { id } = timeframeCommand(token)
    if (id === 'chart.timeframe.set') return allowedTimeframes([token], deps.restrictions()).length > 0
    return deps.commands.available(id)
  }
  /** Whether a token is drawn: the active one always, another unless the host hides what its policy
   *  refuses and the policy refuses that token's command. A saved chip stays saved either way. */
  const listed = (token: string, active: string | null): boolean => token === active || shows(deps, timeframeCommand(token).id)
  const pick = (token: string): void => {
    const { id, arg } = timeframeCommand(token)
    deps.commands.execute(id, arg)
  }

  const sync = (): void => {
    const active = activeChart(deps).timeframe()
    const saved = deps.store.saved()
    const list = [...(saved.includes(active) ? saved : [...saved, active])].sort((a, b) => timeframeOrder(a) - timeframeOrder(b))
    replace(
      chips,
      ...list.filter((token) => listed(token, active)).map((token) => {
        const chip = button({
          label: timeframeLabel(t(), token),
          text: timeframeChipLabel(token),
          className: 'qc-toolbar-button qc-tf-chip',
          pressed: token === active,
          onClick: () => pick(token),
        })
        setDisabled(chip, token !== active && !available(token))
        return chip
      }),
    )
    chips.setAttribute('aria-label', t()('timeframe.title'))
    name(caret, t()('timeframe.all'))
    // Only when what the list SHOWS has moved: this runs on every chart state change, which on a
    // streaming chart is many times a second.
    const candidates = deps.timeframes.list ?? [...TIMEFRAME_PRESET_TOKENS, ...deps.store.custom()]
    const hidden = candidates.filter((token) => !listed(token, active))
    const shape = `${active}|${saved.join(',')}|${deps.store.custom().join(',')}|${[...collapsed].join(',')}|${hidden.join(',')}`
    if (shape === listShape) return
    listShape = shape
    menu?.refresh()
  }

  /** The chart's list: its timeframe checked, the viewer's saved and custom tokens, every pick a
   *  command. */
  const listModel = (handle: MenuHandle): TimeframeListModel => ({
    i18n: deps.i18n,
    icons: deps.icons,
    offered: deps.timeframes,
    active: () => activeChart(deps).timeframe(),
    custom: () => deps.store.custom(),
    restrictions: () => deps.restrictions(),
    available,
    listed,
    choose: (token) => {
      handle.close()
      pick(token)
    },
    addCustom: (token) => deps.store.addCustom(token),
    saved: { includes: (token) => deps.store.saved().includes(token), toggle: (token) => deps.store.toggleSaved(token) },
    removeCustom: (token) => deps.store.removeCustom(token),
    changed: sync,
    collapsed,
  })

  const openList = (): void => {
    menu = openMenu({
      host: deps.overlays,
      anchor: caret,
      label: t()('timeframe.title'),
      className: 'qc-tf-menu',
      width: FLYOUT_WIDTH.timeframe,
      build(body, handle) {
        buildTimeframeRows(body, listModel(handle), () => handle.refresh())
      },
      // The composer adds a custom timeframe, so it is drawn only where the widget offers them.
      ...(composesTimeframes(deps.timeframes)
        ? {
            footer(foot: HTMLElement, handle: MenuHandle) {
              foot.appendChild(buildTimeframeComposer(listModel(handle)))
            },
          }
        : {}),
      initialIndex: 0,
      onClose: () => {
        menu = null
      },
    })
    // Open on the active row, which is where the eye goes first.
    focusCheckedTimeframe(menu.element)
  }

  const offStrings = deps.i18n.onChange(sync)
  sync()
  return {
    element,
    sync,
    destroy() {
      offStrings()
      menu?.close()
      element.remove()
    },
  }
}
