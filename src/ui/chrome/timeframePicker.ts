// The timeframe picker: the saved timeframes as quick-select chips (smallest first, the active one
// pressed, always including the active timeframe even when unsaved) and a drop-down over the 26
// presets in their five groups, each collapsible, with the viewer's custom tokens interleaved into
// their unit's group, a star per row that saves it as a chip, a delete on each custom row, and a
// footer that composes a custom token clamped by the unit's ceiling. Every row is a command:
// `chart.timeframe.<token>` for a preset, `chart.timeframe.set` for a custom token, so a token the
// feed or the symbol cannot serve is disabled rather than sent.
import type { ChartMessageKey } from '../../i18n'
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
import { activeChart, type ChromeContext } from './context'
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

/** The command that sets a token: the preset's own, or the open-ended setter for a custom token. */
export const timeframeCommand = (token: string): { id: string; arg?: string } =>
  TIMEFRAME_PRESET_TOKENS.has(token) ? { id: `chart.timeframe.${token}` } : { id: 'chart.timeframe.set', arg: token }

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
      ...list.map((token) => {
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
    const shape = `${active}|${saved.join(',')}|${deps.store.custom().join(',')}|${[...collapsed].join(',')}`
    if (shape === listShape) return
    listShape = shape
    menu?.refresh()
  }

  const openList = (): void => {
    menu = openMenu({
      host: deps.overlays,
      anchor: caret,
      label: t()('timeframe.title'),
      className: 'qc-tf-menu',
      width: FLYOUT_WIDTH.timeframe,
      build(body, handle) {
        const active = activeChart(deps).timeframe()
        const saved = deps.store.saved()
        const custom = deps.store.custom()
        const groupOf = (token: string): TimeframeUnit => timeframeGroupUnit(parseTimeframe(token)?.unit ?? 'd')
        TIMEFRAME_PRESETS.forEach((group, gi) => {
          const tokens = allowedTimeframes([...group.tokens, ...custom.filter((c) => groupOf(c) === group.unit)], deps.restrictions()).sort((a, b) => timeframeOrder(a) - timeframeOrder(b))
          if (gi > 0) body.appendChild(h('div', { class: 'qc-separator', role: 'separator' }))
          const isCollapsed = collapsed.has(group.unit)
          const heading = h('button', { type: 'button', class: 'qc-tf-group', 'data-qc-item': '', tabindex: '-1', 'aria-expanded': String(!isCollapsed) }, h('span', {}, t()(TIMEFRAME_UNIT_NAME[group.unit])), deps.icons.glyph(isCollapsed ? ICONS.chevronDown : ICONS.chevronUp, { size: 18 }))
          heading.addEventListener('click', () => {
            if (collapsed.has(group.unit)) collapsed.delete(group.unit)
            else collapsed.add(group.unit)
            handle.refresh()
          })
          body.appendChild(heading)
          if (isCollapsed) return
          for (const token of tokens) {
            const row = h('div', { class: 'qc-tf-row', ...(token === active ? { 'data-qc-checked': 'true' } : {}) })
            const item = menuItem({
              text: timeframeLabel(t(), token),
              className: 'qc-tf-item',
              role: 'menuitemradio',
              checked: token === active,
              disabled: token !== active && !available(token),
              onSelect: () => {
                handle.close()
                pick(token)
              },
            })
            row.appendChild(item)
            if (custom.includes(token)) {
              row.appendChild(
                button({
                  label: t()('timeframe.delete', { timeframe: timeframeLabel(t(), token) }),
                  icon: deps.icons.glyph(ICONS.trash, { size: 18 }),
                  className: 'qc-tf-side',
                  onClick: () => {
                    deps.store.removeCustom(token)
                    handle.refresh()
                    sync()
                  },}),
              )
            }
            const star = button({
              label: t()('timeframe.save', { timeframe: timeframeLabel(t(), token) }),
              // The same star a tool wears in the drawing flyouts, on its own 18 grid.
              icon: deps.icons.glyph(saved.includes(token) ? ICONS.starFilled : ICONS.star, { size: 18 }),
              className: 'qc-tf-side',
              pressed: saved.includes(token),
              onClick: () => {
                deps.store.toggleSaved(token)
                handle.refresh()
                sync()
              },
            })
            row.appendChild(star)
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
      },
      footer(foot, handle) {
        foot.appendChild(composer(handle))
      },
      initialIndex: 0,
      onClose: () => {
        menu = null
      },
    })
    // Open on the active row, which is where the eye goes first.
    const list = items(menu.element)
    const activeIndex = list.findIndex((el) => el.getAttribute('aria-checked') === 'true')
    if (activeIndex >= 0) list[activeIndex]?.focus()
  }

  /** The footer: a count field, a unit select, and Add. Enter or Add saves the token to the custom
   *  group and applies it; Add is disabled while the pair is invalid or the token already exists. */
  const composer = (handle: MenuHandle): HTMLElement => {
    let count = '1'
    let unit: TimeframeUnit = 'm'
    let unitOpen = false

    // The count sits in a filled shell with its own two-step spinner, rather than leaning on the
    // browser's number input: a native spinner is drawn by the platform, so its size, its ink and
    // whether it appears at all differ per browser, and none of it answers to the theme.
    const countInput = h('input', { class: 'qc-tf-count-input', inputmode: 'numeric', 'aria-label': t()('timeframe.customCount'), value: count })
    const step = (label: string, className: string, delta: number): HTMLButtonElement => {
      const b = h('button', { type: 'button', class: `qc-tf-spin ${className}`, 'aria-label': label, tabindex: '-1' }, deps.icons.glyph(ICONS.chevronDown, { size: 18 })) as HTMLButtonElement
      b.addEventListener('click', () => {
        count = String(Math.min(TIMEFRAME_MAX[unit], Math.max(1, (Number(count) || 0) + delta)))
        countInput.value = count
        validate()
      })
      return b
    }
    const spinner = h('span', { class: 'qc-tf-spin-column' }, step(t()('timeframe.increment'), 'qc-tf-spin-up', 1), step(t()('timeframe.decrement'), 'qc-tf-spin-down', -1))
    const countField = h('div', { class: 'qc-tf-count' }, countInput, spinner)

    // The unit opens UPWARD onto its own list. A native select would draw the platform's menu
    // wherever the platform puts it, which on a footer this close to the bottom of the panel means
    // off the end of it; and the row it lands on could not be the menu row every other list uses.
    const unitLabel = h('span', { class: 'qc-tf-unit-label' }, t()(TIMEFRAME_UNIT_NAME[unit]))
    const unitButton = h('button', { type: 'button', class: 'qc-tf-unit', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': t()('timeframe.customUnit') }, unitLabel, deps.icons.glyph(ICONS.chevronDown, { size: 18, className: 'qc-tf-unit-caret' })) as HTMLButtonElement
    const unitList = h('div', { class: 'qc-tf-unit-list', role: 'listbox', 'aria-label': t()('timeframe.customUnit') })
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
      const option = h('button', { type: 'button', class: 'qc-menu-row', role: 'option', 'aria-selected': String(u === unit) }, h('span', { class: 'qc-menu-label' }, t()(TIMEFRAME_UNIT_NAME[u])))
      option.addEventListener('click', () => {
        unit = u
        unitLabel.textContent = t()(TIMEFRAME_UNIT_NAME[u])
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

    const add = button({ label: t()('timeframe.addCustom'), icon: deps.icons.glyph(ICONS.plus, { size: 18 }), className: 'qc-tf-add', onClick: () => submit() })
    const token = (): string | null => (count ? formatTimeframe({ count: Number(count), unit }) : null)
    const existing = (): boolean => {
      const tk = token()
      return tk !== null && (TIMEFRAME_PRESET_TOKENS.has(tk) || deps.store.custom().includes(tk))
    }
    const validate = (): void => {
      const tk = token()
      setDisabled(add, tk === null || existing())
      add.title = tk !== null && existing() ? t()('timeframe.exists', { timeframe: timeframeLabel(t(), tk) }) : t()('timeframe.addCustom')
    }
    const submit = (): void => {
      const tk = token()
      if (tk === null || existing()) return
      if (!deps.store.addCustom(tk)) return
      handle.close()
      pick(tk)
      sync()
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
    return h('div', { class: 'qc-tf-composer' }, h('div', { class: 'qc-menu-heading', role: 'presentation' }, t()(key)), h('div', { class: 'qc-tf-composer-row' }, countField, unitField, add))
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
