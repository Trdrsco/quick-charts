// The floating settings bar for the selected drawing: templates first, then the controls the tool
// actually has (a glyph mark carries no stroke, so it gets no color, width or style), the settings
// gear, lock, delete, and the More menu with the stacking moves and the timeframe presets as
// hover-opened submenus, then clone, copy and hide. Grip-draggable anywhere over the chart; where
// it sits is a preference. Every action is a command through the registry.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import type { DrawingPresets, SelectedDrawing } from '../../drawings'
import { clampFavoritesPosition, FILLABLE, FONT_TOOLS, NO_DASH, NO_LINE_DECOR, NO_STROKE, type FavoritesPosition, type VisibilityPreset } from '../../drawings/index'
// The channel table is the bar's own business: a host composes colours through the drawing's
// props, not through a list the package publishes.
import { TOOL_COLOR_CHANNELS } from '../../drawings/capabilities'
import { isApplePlatform } from '../../platform'
import { button, dragUntilRelease, el, focusFirst, followHostSize, menuKeys, ownPointer, paintedPosition, rovingFocus } from './dom'
import { tidyRules } from '../chrome/dom'
import { openPopover, reopenPopover } from './fields'
import { createColorPalette } from '../controls/color'
import { OWN_WORDS_TOOLS } from '../../drawings/capabilities'
import type { IconName } from '../controls/icons'
import { openTemplateDeleteDialog, openTemplateNameDialog } from './templateDialog'
import type { IconResolver } from '../icons/resolver'
import { HIGHLIGHTER_WIDTHS } from './highlighterWidth'

const WIDTHS = [1, 2, 3, 4] as const
const FONT_SIZES = [10, 12, 14, 16, 20, 24, 28, 32, 40]
const LINE_STYLES: readonly { id: LineStyle; label: ChartMessageKey; icon: IconName }[] = [
  { id: 'solid', label: 'drawing.lineSolid', icon: 'lineSolid' },
  { id: 'dashed', label: 'drawing.lineDashed', icon: 'lineDashed' },
  { id: 'dotted', label: 'drawing.lineDotted', icon: 'lineDotted' },
]
const ORDER_MOVES: readonly { label: ChartMessageKey; command: string; dead: (at: { atFront: boolean; atBack: boolean }) => boolean }[] = [
  { label: 'drawing.bringToFront', command: 'chart.drawings.bringToFront', dead: (at) => at.atFront },
  { label: 'drawing.sendToBack', command: 'chart.drawings.sendToBack', dead: (at) => at.atBack },
  { label: 'drawing.bringForward', command: 'chart.drawings.bringForward', dead: (at) => at.atFront },
  { label: 'drawing.sendBackward', command: 'chart.drawings.sendBackward', dead: (at) => at.atBack },
]
const VISIBILITY_PRESETS: readonly { label: ChartMessageKey; preset: VisibilityPreset }[] = [
  { label: 'drawing.visCurrentAndAbove', preset: 'current-and-above' },
  { label: 'drawing.visCurrentAndBelow', preset: 'current-and-below' },
  { label: 'drawing.visCurrentOnly', preset: 'current-only' },
  { label: 'drawing.visAll', preset: 'all' },
]
/** How long a submenu survives the pointer leaving its row or itself. The pointer travels between
 *  the two, and on a diagonal it can leave both for a frame; closing on the first leave makes the
 *  panel feel like it is running away from the cursor. */
const SUBMENU_GRACE_MS = 150
/** The line style glyphs are 28-grid marks, worn at their own size on the bar and in their menu. */
const LINE_STYLE_GLYPH = 28

/** The thickness marks by width, one per width the bar offers. */
const THICKNESS_ICONS = { 1: 'lineThickness1', 2: 'lineThickness2', 3: 'lineThickness3', 4: 'lineThickness4' } as const satisfies Record<(typeof WIDTHS)[number], IconName>

/** A control the bar may carry between its templates and its settings: a table's two edits, the
 *  stroke's color, a mark's ink offered as its background, the fill, a price note's tag background,
 *  the words' color and their size. */
type BarControl = 'tableAddColumn' | 'tableAddRow' | 'line' | 'markFill' | 'fill' | 'labelFill' | 'text' | 'size'

/** The controls a tool's bar carries, in their order, for the tools that lay out their own: the
 *  words and the notes, the marks and the table. Every other tool's bar follows from what its paint
 *  has. */
const BAR_LAYOUTS: Readonly<Record<string, readonly BarControl[]>> = {
  text: ['text', 'size'],
  comment: ['text', 'fill', 'size'],
  callout: ['text', 'fill', 'size'],
  price_label: ['text', 'fill', 'size'],
  note: ['line', 'fill', 'text'],
  price_note: ['line', 'labelFill', 'text'],
  signpost: ['size'],
  pin: ['line', 'text', 'size'],
  table: ['tableAddColumn', 'tableAddRow', 'line', 'fill', 'text'],
  flag: ['markFill'],
  arrow_marker: ['markFill', 'text'],
  arrow_up: ['line', 'text'],
  arrow_down: ['line', 'text'],
}

/** Tools whose words the bar offers no color for: a trend angle reads its angle in its line's
 *  color and takes no words of its own. */
const NO_WORDS_INK: ReadonlySet<string> = new Set(['trend_angle'])

/** The thickness mark: an 18 by N bar with fully rounded ends, on the bar and in its menu. */
function widthBar(icons: IconResolver, width: number): HTMLElement {
  const h = Math.max(1, Math.min(4, Math.round(width))) as keyof typeof THICKNESS_ICONS
  return el('span', { class: 'qc-drawing-width-bar', 'aria-hidden': 'true' }, icons.icon(THICKNESS_ICONS[h]))
}

export interface SettingsBarDeps {
  chrome: HTMLElement
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  selected(): SelectedDrawing | null
  /** The selection's props, for the leveled tools whose level colors follow a color pick. */
  selectedProps(): Readonly<Record<string, unknown>> | null
  presets: DrawingPresets
  run(command: string, arg?: unknown): boolean
  /** Whether the registry would run a command now. A control whose command is denied or
   *  unavailable renders disabled. */
  available(command: string): boolean
  /** Whether a control for a command is drawn at all: false for a command the policy refuses when
   *  the host hides what it refuses. Every control is drawn without it. */
  shown?(command: string): boolean
  stackPosition(): { atFront: boolean; atBack: boolean }
  position(): FavoritesPosition | null
  onMove(position: FavoritesPosition): void
  /** The colours this viewer mixed, newest first, and how a new one joins them. Kept by whoever
   *  mounts the bar, beside the position it already remembers. */
  recentColors(): readonly string[]
  onMixColor(hex: string): void
  /** Whether a cell of the selected table is being typed in, so the drawing's menu offers to remove
   *  its row and its column. Never, without it. */
  tableCell?(): boolean
}

export interface SettingsBarHandle {
  render(): void
  /** Raise the selected drawing's own menu at a viewport point, as a right-click on the drawing
   *  does. False without a selection. */
  openMenuAt(clientX: number, clientY: number): boolean
  destroy(): void
}

/** An anchor standing for a point on the page: a menu raised at a press hangs from it as a panel
 *  hangs from its control, below and after the point and turned to fit. */
function pointAnchor(clientX: number, clientY: number): HTMLElement {
  const anchor = el('span', { 'aria-hidden': 'true' })
  anchor.getBoundingClientRect = () => new DOMRect(clientX, clientY, 0, 0)
  return anchor
}

type MenuWidth = 'content' | 'wide' | 'narrow'

/** The submenus a drawing's menus open: its templates, its visual order and its visibility. */
type Submenu = 'template' | 'order' | 'visibility'

export function mountSettingsBar(deps: SettingsBarDeps): SettingsBarHandle {
  const { t } = deps
  const shown = (command: string): boolean => deps.shown?.(command) ?? true
  const bar = el('div', { class: 'qc-overlay qc-drawing-settings-bar', role: 'toolbar', 'aria-label': t('drawing.settingsBar'), 'data-role': 'drawing-settings-bar' })
  ownPointer(bar)
  bar.hidden = true
  const grip = button({ class: 'qc-drawing-grip', label: t('drawing.moveToolbar'), icon: deps.icons.icon('grip', 12) })
  const controls = el('div', { class: 'qc-drawing-settings-controls' })
  bar.append(grip, controls)

  let closePanel: (() => void) | null = null
  /** Which drawing the open panel belongs to, so a re-render can tell an edit from a new selection. */
  let panelFor: string | null = null
  /** Which control it hangs off, so a rebuilt bar can give that control its open state back. */
  let panelControl: string | null = null
  /** Say the control is shut, on whichever button is CURRENTLY standing for it: a rebuilt bar
   *  holds a different element than the one the panel was opened from, and the detached one's
   *  attribute is read by nobody. */
  const markOpen = (open: boolean): void => {
    if (panelControl) controls.querySelector(`[data-qc-control='${panelControl}']`)?.setAttribute('aria-expanded', String(open))
  }
  const closeOpen = (): void => {
    markOpen(false)
    closePanel?.()
    closePanel = null
    panelFor = null
    panelControl = null
  }
  const openPanel = (anchor: HTMLElement, content: HTMLElement, placement: 'below' | 'below-end' = 'below', onClose?: () => void, className?: string): void => {
    const wasOpen = anchor.getAttribute('aria-expanded') === 'true'
    closeOpen()
    if (wasOpen) return
    // The bar is rebuilt on every render, so a panel re-reads the host's policy by opening again
    // from whichever control now stands for the one it hung off.
    const control = anchor.dataset.qcControl
    const close = openPopover(deps.chrome, anchor, content, placement, () => {
      if (closePanel === close) {
        markOpen(false)
        closePanel = null
        panelFor = null
        panelControl = null
      }
      onClose?.()
    }, anchor, () => reopenPopover(close, content, () => (control ? controls.querySelector<HTMLElement>(`[data-qc-control='${control}']`) : null)), className ? { className } : {})
    closePanel = close
    panelFor = deps.selected()?.id ?? null
    panelControl = anchor.dataset.qcControl ?? null
    focusFirst(content)
  }

  const place = (): void => {
    const remembered = deps.position()
    if (remembered) {
      const position = paintedPosition(remembered, bar, deps.chrome)
      bar.style.left = `${position.x}px`
      bar.style.top = `${position.y}px`
      bar.style.transform = ''
    } else {
      bar.style.left = ''
      bar.style.top = ''
      bar.style.transform = ''
    }
  }
  grip.addEventListener('pointerdown', (e) => {
    closeOpen()
    const host = deps.chrome.getBoundingClientRect()
    const rect = bar.getBoundingClientRect()
    const offset = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    let last: FavoritesPosition | null = null
    const onMove = (ev: PointerEvent): void => {
      last = clampFavoritesPosition({ x: ev.clientX - host.left - offset.dx, y: ev.clientY - host.top - offset.dy }, { width: rect.width, height: rect.height }, { width: host.width, height: host.height })
      bar.style.left = `${last.x}px`
      bar.style.top = `${last.y}px`
      bar.style.transform = ''
    }
    // A press with no movement is a press, not a move: nothing is reported and nothing is saved.
    dragUntilRelease(onMove, () => {
      if (last) deps.onMove(last)
    })
    e.preventDefault()
  })

  const unrove = rovingFocus(bar, () => [grip, ...controls.querySelectorAll<HTMLElement>('button')], 'horizontal')
  // A panel opening beside the chart narrows the box this bar floats in; the bar moves in with it
  // rather than standing where the chart used to be, cut off behind what opened.
  const unfollow = followHostSize(deps.chrome, place)

  /** One row of a bar menu. A row carries a mark only when it has one: a plain row is its label
   *  alone, and a row aligned under a marked one takes a spacer the mark's width. The current
   *  choice in a menu of values is marked active. */
  const menuRow = (label: string, onPick: () => void, options: { icon?: Element; spacer?: boolean; hint?: string; disabled?: boolean; command?: string; active?: boolean; submenu?: boolean } = {}): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-bar-row', role: 'menuitem' })
    if (options.icon !== undefined || options.spacer) {
      const cell = el('span', { class: 'qc-menu-icon' })
      if (options.icon) cell.appendChild(options.icon)
      b.appendChild(cell)
    }
    b.appendChild(el('span', { class: 'qc-menu-label', text: label }))
    if (options.hint) b.appendChild(el('span', { class: 'qc-menu-hint', text: options.hint }))
    if (options.submenu) b.appendChild(el('span', { class: 'qc-drawing-bar-arrow' }, deps.icons.icon('submenuArrow', 18)))
    if (options.active) b.dataset.qcActive = 'true'
    if (options.disabled || (options.command && !deps.available(options.command))) b.disabled = true
    if (options.command && !shown(options.command)) b.hidden = true
    if (!options.submenu) {
      b.addEventListener('click', () => {
        closeOpen()
        onPick()
      })
    }
    return b
  }
  const menuOf = (label: string, width: MenuWidth, ...items: HTMLElement[]): HTMLElement => {
    const m = el('div', { class: 'qc-drawing-menu qc-drawing-bar-menu', role: 'menu', 'aria-label': label, 'data-width': width }, ...items.filter((item) => !item.hidden))
    tidyRules(m, (child) => !child.hidden)
    menuKeys(m, () => [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    return m
  }
  const separator = (): HTMLElement => el('div', { class: 'qc-separator', role: 'separator' })
  /** A control is enabled exactly when the registry would run its command now. */
  const gate = (b: HTMLButtonElement, command: string): HTMLButtonElement => {
    b.disabled = !deps.available(command)
    b.hidden = !shown(command)
    return b
  }

  const style = (patch: Record<string, unknown>): void => {
    deps.run('chart.drawings.style', patch)
  }

  /** The sets of levels a leveled tool holds: its levels, a box's price and time divisions, or a gann
   *  square's fans and arcs beside its grid. */
  const LEVEL_KEYS = ['levels', 'priceLevels', 'timeLevels', 'fans', 'arcs'] as const
  /** Recolor every level of every set the selected drawing holds, in one move. */
  const recolorLevels = (color: (level: { color?: string }) => string): void => {
    const props = deps.selectedProps()
    const patch: Record<string, unknown> = {}
    for (const key of LEVEL_KEYS) {
      const levels = props?.[key]
      if (Array.isArray(levels)) patch[key] = (levels as { color?: string }[]).map((l) => ({ ...l, color: color(l) }))
    }
    if (Object.keys(patch).length) deps.run('chart.drawings.props', patch)
  }
  /** A stroke color pick recolors every level of a leveled tool in one move; per-level colors
   *  stay editable in the dialog. */
  const pickLineColor = (selected: SelectedDrawing, color: string): void => {
    const alpha = alphaOf(selected.lineColor)
    const next = alpha < 1 ? withAlpha(color, alpha) : color
    style({ lineColor: next })
    recolorLevels(() => next)
  }
  const pickLineOpacity = (selected: SelectedDrawing, v: number): void => {
    style({ lineColor: withAlpha(selected.lineColor, v) })
    recolorLevels((l) => withAlpha(l.color ?? selected.lineColor, v))
  }

  /** The color buttons' face: the glyph over a strip in the drawing's color. The color is a stored
   *  value, so it goes in through the style API, never through markup. */
  const colorFace = (icon: 'pencil16' | 'bucket' | 'textTee', color: string, empty = false): HTMLElement => {
    const strip = el('span', { class: 'qc-drawing-color-strip', 'data-empty': String(empty) })
    strip.style.setProperty('--qcd-swatch', empty ? 'transparent' : color)
    const face = el('span', { class: 'qc-drawing-color-face' })
    face.append(deps.icons.icon(icon), strip)
    return face
  }
  /** The modifier the hints name: the key this platform has, since the layer takes either. */
  const modifier = (): string => t(isApplePlatform() ? 'drawing.modifierCommand' : 'drawing.modifierControl')

  /** The rows a tool's templates offer: save the setup as a template, apply the tool's default,
   *  then each saved template, applied by its row and removed by its trash. */
  const templateItems = (type: string): HTMLElement[] => {
    const saved = deps.presets.templatesFor(type)
    const items: HTMLElement[] = [
      menuRow(t('drawing.saveTemplateAs'), () => openTemplateNameDialog({ container: deps.chrome, t, icons: deps.icons }, (name) => deps.run('chart.drawings.template.save', name)), { command: 'chart.drawings.template.save' }),
      menuRow(t('drawing.applyDefaultTemplate'), () => deps.run('chart.drawings.template.apply', null), { command: 'chart.drawings.template.apply' }),
    ]
    if (saved.length) items.push(separator())
    for (const template of saved) {
      const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
      rowEl.append(
        menuRow(template.name, () => deps.run('chart.drawings.template.apply', template.name), { command: 'chart.drawings.template.apply' }),
        button({
          class: 'qc-drawing-star',
          label: t('drawing.removeTemplateNamed', { name: template.name }),
          title: t('drawing.remove'),
          icon: deps.icons.icon('trash', 18),
          disabled: !deps.available('chart.drawings.template.remove'),
          onClick: () => {
            closeOpen()
            openTemplateDeleteDialog({ container: deps.chrome, t, icons: deps.icons }, template.name, () => deps.run('chart.drawings.template.remove', template.name))
          },
        }),
      )
      // A saved template is applied by its row and removed by its trash; a host that hides what
      // its policy refuses leaves out the trash it refuses, and the template with its row.
      const remove = rowEl.querySelector<HTMLElement>('.qc-drawing-star')
      if (remove) remove.hidden = !shown('chart.drawings.template.remove')
      rowEl.hidden = !shown('chart.drawings.template.apply')
      items.push(rowEl)
    }
    return items
  }

  /** A drawing's menus, with their submenus: one open at a time, raised beside the row the pointer
   *  is on and kept up through the grace period while the pointer crosses from the row into the
   *  panel. The More menu carries the order and visibility submenus, the copies and Hide. The menu
   *  a right-click on the drawing raises carries a table's own edits first, then the templates, the
   *  order and visibility submenus, the copies, Lock, Hide, Remove and the settings. */
  const drawingMenu = (kind: 'more' | 'context', selected: SelectedDrawing): { element: HTMLElement; closeSub(): void } => {
    let sub: { kind: Submenu; close: () => void } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancelClose = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const closeSub = (): void => {
      cancelClose()
      sub?.close()
      sub = null
    }
    const scheduleClose = (): void => {
      cancelClose()
      timer = setTimeout(closeSub, SUBMENU_GRACE_MS)
    }
    const submenuOf = (kind: Submenu): HTMLElement => {
      if (kind === 'template') return menuOf(t('drawing.drawingTemplates'), 'wide', ...templateItems(selected.type))
      if (kind === 'order') {
        const at = deps.stackPosition()
        return menuOf(t('drawing.visualOrder'), 'narrow', ...ORDER_MOVES.map((move) => menuRow(t(move.label), () => deps.run(move.command), { disabled: move.dead(at), command: move.command })))
      }
      return menuOf(t('drawing.visibilityOnTimeframes'), 'wide', ...VISIBILITY_PRESETS.map((v) => menuRow(t(v.label), () => deps.run('chart.drawings.visibility', v.preset), { command: 'chart.drawings.visibility' })))
    }
    const arm = (kind: Submenu | null, row?: HTMLElement): void => {
      cancelClose()
      if (sub?.kind === kind) return
      sub?.close()
      sub = null
      if (!kind || !row) return
      const panel = submenuOf(kind)
      panel.addEventListener('mouseenter', cancelClose)
      panel.addEventListener('mouseleave', scheduleClose)
      const close = openPopover(deps.chrome, row, panel, 'sidecar', () => {
        if (sub?.close === close) sub = null
      })
      sub = { kind, close }
    }
    const submenuRow = (kind: Submenu, label: string, icon?: IconName): HTMLButtonElement => {
      const row = menuRow(label, () => undefined, { ...(icon ? { icon: deps.icons.icon(icon) } : { spacer: true }), submenu: true })
      row.setAttribute('aria-haspopup', 'menu')
      row.addEventListener('mouseenter', () => arm(kind, row))
      row.addEventListener('mouseleave', scheduleClose)
      row.addEventListener('click', () => arm(kind, row))
      // A submenu every row of which is left out is not offered.
      const commands = kind === 'order' ? ORDER_MOVES.map((move) => move.command) : kind === 'template' ? ['chart.drawings.template.apply', 'chart.drawings.template.save'] : ['chart.drawings.visibility']
      if (!commands.some(shown)) row.hidden = true
      return row
    }
    const plain = (b: HTMLButtonElement): HTMLButtonElement => {
      b.addEventListener('mouseenter', () => arm(null))
      return b
    }
    const order = submenuRow('order', t('drawing.visualOrder'), 'layers')
    const visibility = submenuRow('visibility', t('drawing.visibilityOnTimeframes'))
    const clone = plain(menuRow(t('drawing.clone'), () => deps.run('chart.drawings.clone'), { icon: deps.icons.icon('clone'), hint: t('drawing.hintClone', { modifier: modifier() }), command: 'chart.drawings.clone' }))
    const copy = plain(menuRow(t('drawing.copy'), () => deps.run('chart.drawings.copy'), { spacer: true, hint: t('drawing.hintCopy', { modifier: modifier() }), command: 'chart.drawings.copy' }))
    const hide = plain(menuRow(t('drawing.hide'), () => deps.run('chart.drawings.hideSelected'), { icon: deps.icons.icon('eyeCrossed'), command: 'chart.drawings.hideSelected' }))
    if (kind === 'more') return { element: menuOf(t('drawing.moreActions'), 'wide', order, visibility, separator(), clone, copy, separator(), hide), closeSub }
    // A table's own edits lead: its adds, then while a cell is being typed in, its removes.
    const table: HTMLElement[] = []
    if (selected.hasCells) {
      table.push(
        plain(menuRow(t('drawing.addColumnRight'), () => deps.run('chart.drawings.tableAddColumn'), { icon: deps.icons.icon('tableAddColumn'), command: 'chart.drawings.tableAddColumn' })),
        plain(menuRow(t('drawing.addRowBelow'), () => deps.run('chart.drawings.tableAddRow'), { icon: deps.icons.icon('tableAddRow'), command: 'chart.drawings.tableAddRow' })),
      )
      if (deps.tableCell?.()) {
        table.push(
          separator(),
          plain(menuRow(t('drawing.removeRow'), () => deps.run('chart.drawings.tableRemoveRow'), { icon: deps.icons.icon('trash28'), command: 'chart.drawings.tableRemoveRow' })),
          plain(menuRow(t('drawing.removeColumn'), () => deps.run('chart.drawings.tableRemoveColumn'), { icon: deps.icons.icon('trash28'), command: 'chart.drawings.tableRemoveColumn' })),
        )
      }
      table.push(separator())
    }
    const element = menuOf(
      t('drawing.drawingMenu'),
      'wide',
      ...table,
      submenuRow('template', t('drawing.template')),
      order,
      visibility,
      separator(),
      clone,
      copy,
      separator(),
      plain(menuRow(t(selected.locked ? 'drawing.unlock' : 'drawing.lock'), () => deps.run('chart.drawings.lock', !selected.locked), { icon: deps.icons.icon(selected.locked ? 'lockOpen' : 'lockClosed'), command: 'chart.drawings.lock' })),
      hide,
      plain(menuRow(t('drawing.remove'), () => deps.run('chart.drawings.deleteSelected'), { icon: deps.icons.icon('trash28'), hint: t('drawing.hintRemove'), command: 'chart.drawings.deleteSelected' })),
      separator(),
      plain(menuRow(t('menu.settings'), () => deps.run('chart.drawings.settings'), { icon: deps.icons.icon('gear'), command: 'chart.drawings.settings' })),
    )
    return { element, closeSub }
  }

  const render = (): void => {
    const selected = deps.selected()
    // A panel is dismissed when the SELECTION moves, not when a control inside it reports an edit.
    // Dragging the opacity restyles the drawing on every step, and every restyle renders the bar
    // again: closing here would take the slider out from under the pointer holding it.
    if (!selected || selected.id !== panelFor) closeOpen()
    bar.hidden = !selected
    controls.replaceChildren()
    // A hidden bar holds no controls at all, so a census of the chart's buttons and a keyboard
    // walk both meet only what a viewer can reach.
    if (!selected) {
      bar.replaceChildren()
      return
    }
    if (!bar.contains(grip)) bar.append(grip, controls)
    place()
    const type = selected.type
    const hasStroke = !NO_STROKE.has(type)

    // Templates: the first control after the grip. The tool's default is the auto-remembered
    // last-used setup, so there is no explicit save-default row.
    const templates = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.drawingTemplates'), title: t('drawing.templates'), icon: deps.icons.icon('template') }), 'chart.drawings.template.apply')
    templates.setAttribute('aria-haspopup', 'menu')
    templates.setAttribute('aria-expanded', 'false')
    templates.dataset.qcControl = 'templates'
    templates.addEventListener('click', () => openPanel(templates, menuOf(t('drawing.drawingTemplates'), 'wide', ...templateItems(type))))
    controls.appendChild(templates)

    /** A color panel on the bar, the dialog's color popover in width: as wide as its palette
     *  wherever it opens. Choosing a colour is the whole of what the panel is for, so the choice
     *  closes it; moving the opacity is not a choice and leaves it standing. */
    const colorPanel = (control: HTMLElement, spec: { value: string; onPick: (c: string) => void; opacity: number; onOpacity: (v: number) => void }): void => {
      openPanel(
        control,
        createColorPalette(t, {
          recents: { list: deps.recentColors, add: deps.onMixColor },
          value: spec.value,
          onPick: (c) => {
            spec.onPick(c)
            closeOpen()
          },
          opacity: spec.opacity,
          onOpacity: spec.onOpacity,
        }).element,
        'below',
        undefined,
        'qc-drawing-popover--color',
      )
    }

    /** The bar's controls, each built on its own. */
    const build: Record<BarControl, () => void> = {
      // A table's own edits: a column right of the cell last typed in and a row below it, or at the
      // table's ends where no cell is.
      tableAddColumn: () => {
        controls.appendChild(gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.addColumnRight'), title: t('drawing.addColumnRight'), icon: deps.icons.icon('tableAddColumn'), onClick: () => deps.run('chart.drawings.tableAddColumn') }), 'chart.drawings.tableAddColumn'))
      },
      tableAddRow: () => {
        controls.appendChild(gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.addRowBelow'), title: t('drawing.addRowBelow'), icon: deps.icons.icon('tableAddRow'), onClick: () => deps.run('chart.drawings.tableAddRow') }), 'chart.drawings.tableAddRow'))
      },
      line: () => strokeColor('pencil16', 'drawing.drawingColor', 'drawing.color'),
      // A mark's ink is its stroke color, which its bar offers as its background.
      markFill: () => strokeColor('bucket', 'drawing.backgroundColor', 'drawing.background'),
      fill: () => {
        const fill = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.backgroundColor'), title: t('drawing.background') }), 'chart.drawings.style')
        fill.appendChild(colorFace('bucket', selected.fillColor, selected.fillOpacity === 0 || deps.selectedProps()?.fillBackground === false))
        fill.setAttribute('aria-haspopup', 'dialog')
        fill.setAttribute('aria-expanded', 'false')
        fill.dataset.qcControl = 'fill'
        /** A background picked or faded here is one the viewer means to see, so a shape whose
         *  background was switched off turns it back on. */
        const showFill = (): void => {
          if (deps.selectedProps()?.fillBackground === false) deps.run('chart.drawings.props', { fillBackground: true })
        }
        fill.addEventListener('click', () =>
          colorPanel(fill, {
            value: selected.fillColor,
            onPick: (c) => {
              style({ fillColor: c, ...(selected.fillOpacity === 0 ? { fillOpacity: 0.12 } : {}) })
              showFill()
            },
            opacity: selected.fillOpacity,
            onOpacity: (v) => {
              style({ fillOpacity: v })
              showFill()
            },
          }),
        )
        controls.appendChild(fill)
      },
      // A price note's tag wears a background of its own.
      labelFill: () => propColor({ prop: 'labelBackgroundColor', icon: 'bucket', label: 'drawing.backgroundColor' }),
      text: () => {
        const text = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.textColor') }), 'chart.drawings.style')
        text.appendChild(colorFace('textTee', selected.textColor))
        text.setAttribute('aria-haspopup', 'dialog')
        text.setAttribute('aria-expanded', 'false')
        text.dataset.qcControl = 'text'
        text.addEventListener('click', () =>
          colorPanel(text, {
            value: selected.textColor,
            onPick: (c) => {
              const alpha = alphaOf(selected.textColor)
              style({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
            },
            opacity: alphaOf(selected.textColor),
            onOpacity: (v) => style({ textColor: withAlpha(selected.textColor, v) }),
          }),
        )
        controls.appendChild(text)
      },
      size: () => {
        const size = gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.fontSize'), text: String(selected.fontSize) }), 'chart.drawings.style')
        size.setAttribute('aria-haspopup', 'menu')
        size.setAttribute('aria-expanded', 'false')
        size.dataset.qcControl = 'size'
        size.addEventListener('click', () => openPanel(size, menuOf(t('drawing.fontSize'), 'content', ...FONT_SIZES.map((n) => menuRow(String(n), () => style({ fontSize: n }), { active: selected.fontSize === n })))))
        controls.appendChild(size)
      },
    }

    /** The stroke's color, worn with a glyph and a name of the tool's own. */
    function strokeColor(icon: 'pencil16' | 'bucket', label: ChartMessageKey, title: ChartMessageKey): void {
      const color = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t(label), title: t(title) }), 'chart.drawings.style')
      color.appendChild(colorFace(icon, selected!.lineColor))
      color.setAttribute('aria-haspopup', 'dialog')
      color.setAttribute('aria-expanded', 'false')
      color.dataset.qcControl = 'color'
      color.addEventListener('click', () =>
        colorPanel(color, {
          value: selected!.lineColor,
          onPick: (c) => pickLineColor(selected!, c),
          opacity: alphaOf(selected!.lineColor),
          onOpacity: (v) => pickLineOpacity(selected!, v),
        }),
      )
      controls.appendChild(color)
    }

    /** A color the tool keeps in a prop of its own. */
    function propColor(channel: { prop: string; icon: 'pencil16' | 'bucket' | 'textTee'; label: string }): void {
      const current = typeof deps.selectedProps()?.[channel.prop] === 'string' ? String(deps.selectedProps()![channel.prop]) : selected!.lineColor
      const control = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t(channel.label as Parameters<typeof t>[0]) }), 'chart.drawings.style')
      control.appendChild(colorFace(channel.icon, current))
      control.setAttribute('aria-haspopup', 'dialog')
      control.setAttribute('aria-expanded', 'false')
      control.dataset.qcControl = channel.prop
      control.addEventListener('click', () =>
        colorPanel(control, {
          value: current,
          onPick: (c) => deps.run('chart.drawings.props', { [channel.prop]: alphaOf(current) < 1 ? withAlpha(c, alphaOf(current)) : c }),
          opacity: alphaOf(current),
          onOpacity: (v) => deps.run('chart.drawings.props', { [channel.prop]: withAlpha(current, v) }),
        }),
      )
      controls.appendChild(control)
    }

    const layout = BAR_LAYOUTS[type]
    if (layout) {
      for (const control of layout) build[control]()
    } else {
      if (selected.hasCells) {
        build.tableAddColumn()
        build.tableAddRow()
      }
      if (hasStroke) build.line()
      if (FILLABLE.has(type)) build.fill()
      if ((selected.hasText && !NO_WORDS_INK.has(type)) || FONT_TOOLS.has(type) || OWN_WORDS_TOOLS.has(type)) build.text()
      for (const channel of TOOL_COLOR_CHANNELS[type] ?? []) propColor(channel)
      if (FONT_TOOLS.has(type) && type !== 'table') build.size()
      if (hasStroke && !NO_LINE_DECOR.has(type)) {
        const widths: readonly number[] = type === 'highlighter' ? HIGHLIGHTER_WIDTHS : WIDTHS
        const width = gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.lineThickness'), title: t('drawing.thickness') }), 'chart.drawings.style')
        width.append(widthBar(deps.icons, selected.lineWidth), el('span', { text: `${selected.lineWidth}px` }))
        width.setAttribute('aria-haspopup', 'menu')
        width.setAttribute('aria-expanded', 'false')
        width.dataset.qcControl = 'width'
        width.addEventListener('click', () =>
          openPanel(width, menuOf(t('drawing.lineThickness'), 'content', ...widths.map((w) => menuRow(`${w}px`, () => style({ lineWidth: w }), { ...(type === 'highlighter' ? {} : { icon: widthBar(deps.icons, w) }), active: selected.lineWidth === w })))),
        )
        controls.appendChild(width)
        if (!NO_DASH.has(type)) {
          const current = LINE_STYLES.find((s) => s.id === selected.lineStyle) ?? LINE_STYLES[0]!
          const lineStyle = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.lineStyle'), icon: deps.icons.icon(current.icon, LINE_STYLE_GLYPH) }), 'chart.drawings.style')
          lineStyle.setAttribute('aria-haspopup', 'menu')
          lineStyle.setAttribute('aria-expanded', 'false')
          lineStyle.dataset.qcControl = 'lineStyle'
          lineStyle.addEventListener('click', () =>
            openPanel(
              lineStyle,
              menuOf(t('drawing.lineStyle'), 'content', ...LINE_STYLES.map((s) => menuRow(t(s.label), () => style({ lineStyle: s.id }), { icon: deps.icons.icon(s.icon, LINE_STYLE_GLYPH), active: selected.lineStyle === s.id }))),
            ),
          )
          controls.appendChild(lineStyle)
        }
      }
    }

    controls.append(
      gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.drawingSettings'), title: t('drawing.settings'), icon: deps.icons.icon('gear'), onClick: () => deps.run('chart.drawings.settings') }), 'chart.drawings.settings'),
      gate(
        button({
          class: 'qc-button qc-drawing-bar-button',
          label: t(selected.locked ? 'drawing.unlockDrawing' : 'drawing.lockDrawing'),
          title: t(selected.locked ? 'drawing.unlock' : 'drawing.lock'),
          icon: deps.icons.icon(selected.locked ? 'lockClosed' : 'lockOpen'),
          pressed: selected.locked,
          onClick: () => deps.run('chart.drawings.lock', !selected.locked),
        }),
        'chart.drawings.lock',
      ),
      gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.deleteDrawing'), title: t('drawing.deleteWithKey'), icon: deps.icons.icon('trash28'), onClick: () => deps.run('chart.drawings.deleteSelected') }), 'chart.drawings.deleteSelected'),
    )

    // More opens with its inline-end edge level with the control's, since it is the last control
    // and a menu hanging past the bar's end would run off the chart.
    const more = button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.moreActions'), title: t('drawing.more'), icon: deps.icons.icon('kebab') })
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.dataset.qcControl = 'more'
    more.addEventListener('click', () => {
      const menu = drawingMenu('more', selected)
      openPanel(more, menu.element, 'below-end', menu.closeSub)
    })
    controls.appendChild(more)
    // The rebuilt control takes back the open state, so the next press closes what is already up.
    if (closePanel) markOpen(true)
  }

  deps.chrome.appendChild(bar)
  render()
  return {
    render,
    openMenuAt(clientX, clientY) {
      const selected = deps.selected()
      if (!selected) return false
      closeOpen()
      const menu = drawingMenu('context', selected)
      const close = openPopover(deps.chrome, pointAnchor(clientX, clientY), menu.element, 'below', () => {
        menu.closeSub()
        if (closePanel === close) {
          closePanel = null
          panelFor = null
        }
      })
      closePanel = close
      panelFor = selected.id
      focusFirst(menu.element)
      return true
    },
    destroy() {
      closeOpen()
      unfollow()
      unrove()
      bar.remove()
    },
  }
}
