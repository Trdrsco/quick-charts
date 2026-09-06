// The floating settings bar for the selected drawing: templates first, then the controls the tool
// actually has (a glyph mark carries no stroke, so it gets no color, width or style), the settings
// gear, lock, delete, and the More menu with the stacking moves, the interval presets, clone, copy
// and hide. Grip-draggable anywhere over the chart; where it sits is a preference. Every action is
// a command through the registry.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import type { DrawingPresets, SelectedDrawing } from '../../drawings'
import { clampFavoritesPosition, FILLABLE, FONT_TOOLS, NO_DASH, NO_LINE_DECOR, NO_STROKE, type FavoritesPosition, type VisibilityPreset } from '../../drawings/index'
import { isApplePlatform } from '../../platform'
import { button, el, focusFirst, menuKeys, ownPointer, rovingFocus } from './dom'
import { colorSwatches, openPopover, strokeSegments } from './fields'
import { iconSvg } from './icons'
import { openTemplateDeleteDialog, openTemplateNameDialog } from './templateDialog'

const WIDTHS = [1, 2, 3, 4]
const FONT_SIZES = [10, 12, 14, 16, 20, 24, 28, 32, 40]
const LINE_STYLES: readonly { id: LineStyle; label: ChartMessageKey }[] = [
  { id: 'solid', label: 'drawing.lineSolid' },
  { id: 'dashed', label: 'drawing.lineDashed' },
  { id: 'dotted', label: 'drawing.lineDotted' },
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

export interface SettingsBarDeps {
  chrome: HTMLElement
  t: ChartTranslate
  selected(): SelectedDrawing | null
  /** The selection's props, for the leveled tools whose level colors follow a color pick. */
  selectedProps(): Readonly<Record<string, unknown>> | null
  presets: DrawingPresets
  run(command: string, arg?: unknown): boolean
  /** Whether the registry would run a command now. A control whose command is denied or
   *  unavailable renders disabled, never hidden. */
  available(command: string): boolean
  stackPosition(): { atFront: boolean; atBack: boolean }
  /** Whether the drawing clipboard holds anything, read as the More menu opens. */
  canPaste(): boolean
  position(): FavoritesPosition | null
  onMove(position: FavoritesPosition): void
}

export interface SettingsBarHandle {
  render(): void
  destroy(): void
}

export function mountSettingsBar(deps: SettingsBarDeps): SettingsBarHandle {
  const { t } = deps
  const bar = el('div', { class: 'qc-overlay qc-drawing-settings-bar', role: 'toolbar', 'aria-label': t('drawing.settingsBar'), 'data-role': 'drawing-settings-bar' })
  ownPointer(bar)
  bar.hidden = true
  const grip = button({ class: 'qc-drawing-grip', label: t('drawing.moveToolbar'), html: iconSvg('grip', 12) })
  const controls = el('div', { class: 'qc-drawing-settings-controls' })
  bar.append(grip, controls)

  let closePanel: (() => void) | null = null
  const closeOpen = (): void => {
    closePanel?.()
    closePanel = null
  }
  const openPanel = (anchor: HTMLElement, content: HTMLElement, onClose?: () => void): void => {
    const wasOpen = anchor.getAttribute('aria-expanded') === 'true'
    closeOpen()
    if (wasOpen) return
    const close = openPopover(deps.chrome, anchor, content, 'below', () => {
      if (closePanel === close) closePanel = null
      onClose?.()
    })
    closePanel = close
    focusFirst(content)
  }

  const place = (): void => {
    const position = deps.position()
    if (position) {
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
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (last) deps.onMove(last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })

  const unrove = rovingFocus(bar, () => [grip, ...controls.querySelectorAll<HTMLElement>('button')], 'horizontal')

  const menuRow = (label: string, onPick: () => void, options: { icon?: string; hint?: string; disabled?: boolean; command?: string } = {}): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row', role: 'menuitem' })
    const cell = el('span', { class: 'qc-menu-icon' })
    if (options.icon) cell.innerHTML = options.icon
    b.append(cell, el('span', { class: 'qc-menu-label', text: label }))
    if (options.hint) b.appendChild(el('span', { class: 'qc-menu-hint', text: options.hint }))
    if (options.disabled || (options.command && !deps.available(options.command))) b.disabled = true
    b.addEventListener('click', () => {
      closeOpen()
      onPick()
    })
    return b
  }
  const menuOf = (label: string, ...items: HTMLElement[]): HTMLElement => {
    const m = el('div', { class: 'qc-drawing-menu', role: 'menu', 'aria-label': label }, ...items)
    menuKeys(m, () => [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    return m
  }
  const heading = (text: string): HTMLElement => el('div', { class: 'qc-dialog-heading', text })
  /** A control is enabled exactly when the registry would run its command now. */
  const gate = (b: HTMLButtonElement, command: string): HTMLButtonElement => {
    b.disabled = !deps.available(command)
    return b
  }

  const style = (patch: Record<string, unknown>): void => {
    deps.run('chart.drawings.style', patch)
  }

  /** A stroke color pick recolors every level of a leveled tool in one move; per-level colors
   *  stay editable in the dialog. */
  const pickLineColor = (selected: SelectedDrawing, color: string): void => {
    const alpha = alphaOf(selected.lineColor)
    const next = alpha < 1 ? withAlpha(color, alpha) : color
    style({ lineColor: next })
    const levels = deps.selectedProps()?.levels
    if (Array.isArray(levels)) deps.run('chart.drawings.props', { levels: (levels as { color?: string }[]).map((l) => ({ ...l, color: next })) })
  }
  const pickLineOpacity = (selected: SelectedDrawing, v: number): void => {
    style({ lineColor: withAlpha(selected.lineColor, v) })
    const levels = deps.selectedProps()?.levels
    if (Array.isArray(levels)) deps.run('chart.drawings.props', { levels: (levels as { color?: string }[]).map((l) => ({ ...l, color: withAlpha(l.color ?? selected.lineColor, v) })) })
  }

  /** The color buttons' face: the glyph over a strip in the drawing's color. The color is a stored
   *  value, so it goes in through the style API, never through markup. */
  const colorFace = (icon: 'pencil' | 'bucket' | 'textTee', color: string, empty = false): HTMLElement => {
    const strip = el('span', { class: 'qc-drawing-color-strip', 'data-empty': String(empty) })
    strip.style.setProperty('--qcd-swatch', empty ? 'transparent' : color)
    const face = el('span', { class: 'qc-drawing-color-face' })
    face.innerHTML = iconSvg(icon, 13)
    face.appendChild(strip)
    return face
  }
  /** The modifier the hints name: the key this platform has, since the layer takes either. */
  const modifier = (): string => t(isApplePlatform() ? 'drawing.modifierCommand' : 'drawing.modifierControl')

  const render = (): void => {
    const selected = deps.selected()
    closeOpen()
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
    const templates = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.drawingTemplates'), title: t('drawing.templates'), html: iconSvg('template') }), 'chart.drawings.template.apply')
    templates.setAttribute('aria-haspopup', 'menu')
    templates.setAttribute('aria-expanded', 'false')
    templates.addEventListener('click', () => {
      const saved = deps.presets.templatesFor(type)
      const items: HTMLElement[] = [
        menuRow(t('drawing.saveTemplateAs'), () => openTemplateNameDialog({ container: deps.chrome, t }, (name) => deps.run('chart.drawings.template.save', name)), { command: 'chart.drawings.template.save' }),
        menuRow(t('drawing.applyDefaultTemplate'), () => deps.run('chart.drawings.template.apply', null), { command: 'chart.drawings.template.apply' }),
      ]
      if (saved.length) items.push(el('div', { class: 'qc-separator', role: 'separator' }))
      for (const template of saved) {
        const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
        rowEl.append(
          menuRow(template.name, () => deps.run('chart.drawings.template.apply', template.name), { command: 'chart.drawings.template.apply' }),
          button({
            class: 'qc-drawing-star',
            label: t('drawing.removeTemplateNamed', { name: template.name }),
            title: t('drawing.remove'),
            html: iconSvg('trash', 18),
            disabled: !deps.available('chart.drawings.template.remove'),
            onClick: () => {
              closeOpen()
              openTemplateDeleteDialog({ container: deps.chrome, t }, template.name, () => deps.run('chart.drawings.template.remove', template.name))
            },
          }),
        )
        items.push(rowEl)
      }
      openPanel(templates, menuOf(t('drawing.drawingTemplates'), ...items))
    })
    controls.appendChild(templates)

    if (selected.hasCells) {
      controls.append(
        gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.addRow'), text: t('drawing.addRowShort'), onClick: () => deps.run('chart.drawings.tableAddRow') }), 'chart.drawings.tableAddRow'),
        gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.addColumn'), text: t('drawing.addColumnShort'), onClick: () => deps.run('chart.drawings.tableAddColumn') }), 'chart.drawings.tableAddColumn'),
      )
    }

    if (hasStroke) {
      const color = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.drawingColor'), title: t('drawing.color') }), 'chart.drawings.style')
      color.appendChild(colorFace('pencil', selected.lineColor))
      color.setAttribute('aria-haspopup', 'dialog')
      color.setAttribute('aria-expanded', 'false')
      color.addEventListener('click', () =>
        openPanel(color, colorSwatches(t, { value: selected.lineColor, onPick: (c) => pickLineColor(selected, c), opacity: alphaOf(selected.lineColor), onOpacity: (v) => pickLineOpacity(selected, v) })),
      )
      controls.appendChild(color)
    }
    if (FILLABLE.has(type)) {
      const fill = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.backgroundColor'), title: t('drawing.background') }), 'chart.drawings.style')
      fill.appendChild(colorFace('bucket', selected.fillColor, selected.fillOpacity === 0))
      fill.setAttribute('aria-haspopup', 'dialog')
      fill.setAttribute('aria-expanded', 'false')
      fill.addEventListener('click', () =>
        openPanel(
          fill,
          colorSwatches(t, {
            value: selected.fillColor,
            onPick: (c) => style({ fillColor: c, ...(selected.fillOpacity === 0 ? { fillOpacity: 0.12 } : {}) }),
            opacity: selected.fillOpacity,
            onOpacity: (v) => style({ fillOpacity: v }),
          }),
        ),
      )
      controls.appendChild(fill)
    }
    if (selected.hasText || FONT_TOOLS.has(type)) {
      const text = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.textColor') }), 'chart.drawings.style')
      text.appendChild(colorFace('textTee', selected.textColor))
      text.setAttribute('aria-haspopup', 'dialog')
      text.setAttribute('aria-expanded', 'false')
      text.addEventListener('click', () =>
        openPanel(
          text,
          colorSwatches(t, {
            value: selected.textColor,
            onPick: (c) => {
              const alpha = alphaOf(selected.textColor)
              style({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
            },
            opacity: alphaOf(selected.textColor),
            onOpacity: (v) => style({ textColor: withAlpha(selected.textColor, v) }),
          }),
        ),
      )
      controls.appendChild(text)
    }
    if (FONT_TOOLS.has(type) && type !== 'table') {
      const size = gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.fontSize'), text: String(selected.fontSize) }), 'chart.drawings.style')
      size.setAttribute('aria-haspopup', 'menu')
      size.setAttribute('aria-expanded', 'false')
      size.addEventListener('click', () => openPanel(size, menuOf(t('drawing.fontSize'), ...FONT_SIZES.map((n) => menuRow(String(n), () => style({ fontSize: n }))))))
      controls.appendChild(size)
    }
    if (hasStroke && !NO_LINE_DECOR.has(type)) {
      const width = gate(button({ class: 'qc-button qc-drawing-bar-button qc-drawing-bar-wide', label: t('drawing.lineThickness'), title: t('drawing.thickness') }), 'chart.drawings.style')
      width.append(strokeSegments(selected.lineWidth), el('span', { text: `${selected.lineWidth}px` }))
      width.setAttribute('aria-haspopup', 'menu')
      width.setAttribute('aria-expanded', 'false')
      width.addEventListener('click', () =>
        openPanel(
          width,
          menuOf(
            t('drawing.lineThickness'),
            ...WIDTHS.map((w) => {
              const rowEl = menuRow(`${w}px`, () => style({ lineWidth: w }))
              rowEl.querySelector('.qc-menu-icon')?.appendChild(strokeSegments(w))
              return rowEl
            }),
          ),
        ),
      )
      controls.appendChild(width)
      if (!NO_DASH.has(type)) {
        const lineStyle = gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.lineStyle') }), 'chart.drawings.style')
        lineStyle.appendChild(strokeSegments(1, selected.lineStyle))
        lineStyle.setAttribute('aria-haspopup', 'menu')
        lineStyle.setAttribute('aria-expanded', 'false')
        lineStyle.addEventListener('click', () =>
          openPanel(
            lineStyle,
            menuOf(
              t('drawing.lineStyle'),
              ...LINE_STYLES.map((s) => {
                const rowEl = menuRow(t(s.label), () => style({ lineStyle: s.id }))
                rowEl.querySelector('.qc-menu-icon')?.appendChild(strokeSegments(1, s.id))
                return rowEl
              }),
            ),
          ),
        )
        controls.appendChild(lineStyle)
      }
    }

    controls.append(
      gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.drawingSettings'), title: t('drawing.settings'), html: iconSvg('gear'), onClick: () => deps.run('chart.drawings.settings') }), 'chart.drawings.settings'),
      gate(
        button({
          class: 'qc-button qc-drawing-bar-button',
          label: t(selected.locked ? 'drawing.unlockDrawing' : 'drawing.lockDrawing'),
          title: t(selected.locked ? 'drawing.unlock' : 'drawing.lock'),
          html: iconSvg(selected.locked ? 'lockClosed' : 'lockOpen'),
          pressed: selected.locked,
          onClick: () => deps.run('chart.drawings.lock', !selected.locked),
        }),
        'chart.drawings.lock',
      ),
      gate(button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.deleteDrawing'), title: t('drawing.deleteWithKey'), html: iconSvg('trash'), onClick: () => deps.run('chart.drawings.deleteSelected') }), 'chart.drawings.deleteSelected'),
    )

    const more = button({ class: 'qc-button qc-drawing-bar-button', label: t('drawing.moreActions'), title: t('drawing.more'), html: iconSvg('kebab') })
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.addEventListener('click', () => {
      const at = deps.stackPosition()
      openPanel(
        more,
        menuOf(
          t('drawing.moreActions'),
          heading(t('drawing.visualOrder')),
          ...ORDER_MOVES.map((move) => menuRow(t(move.label), () => deps.run(move.command), { icon: iconSvg('layers'), disabled: move.dead(at), command: move.command })),
          el('div', { class: 'qc-separator', role: 'separator' }),
          heading(t('drawing.visibilityOnIntervals')),
          ...VISIBILITY_PRESETS.map((v) => menuRow(t(v.label), () => deps.run('chart.drawings.visibility', v.preset), { command: 'chart.drawings.visibility' })),
          el('div', { class: 'qc-separator', role: 'separator' }),
          menuRow(t('drawing.clone'), () => deps.run('chart.drawings.clone'), { icon: iconSvg('clone'), hint: t('drawing.hintClone', { modifier: modifier() }), command: 'chart.drawings.clone' }),
          menuRow(t('drawing.copy'), () => deps.run('chart.drawings.copy'), { hint: t('drawing.hintCopy', { modifier: modifier() }), command: 'chart.drawings.copy' }),
          menuRow(t('drawing.paste'), () => deps.run('chart.drawings.paste'), { hint: t('drawing.hintPaste', { modifier: modifier() }), disabled: !deps.canPaste(), command: 'chart.drawings.paste' }),
          el('div', { class: 'qc-separator', role: 'separator' }),
          menuRow(t('drawing.hide'), () => deps.run('chart.drawings.hideSelected'), { icon: iconSvg('eyeCrossed'), command: 'chart.drawings.hideSelected' }),
        ),
      )
    })
    controls.appendChild(more)
  }

  deps.chrome.appendChild(bar)
  render()
  return {
    render,
    destroy() {
      closeOpen()
      unrove()
      bar.remove()
    },
  }
}
