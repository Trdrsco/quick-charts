// The widget's minimal drawing rail: a small framework-free button strip over the chart — cursor,
// three core placement tools, delete and clear. Deliberately quiet chrome (theme-tinted, no
// labels): the rail is the widget's built-in entry point, and a host wanting richer tooling hides
// it and drives DrawingsHandle.armTool from its own UI. Glyphs live in RAIL_ICONS below so the
// rail stays self-contained in the packed artifact.
import type { DrawingsHandle } from './drawings'
import type { ResolvedTheme } from './host'

/** 24-grid stroke glyphs, keyed by rail button id. */
const RAIL_ICONS: Record<string, string> = {
  cursor: '<path d="M7 4v13l3.8-3.4 2.4 5.4 2-.9-2.4-5.3H18z"/>',
  trend_line: '<line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>',
  horizontal_line: '<line x1="4" y1="12" x2="20" y2="12"/><circle cx="12" cy="12" r="1.6"/>',
  rectangle: '<rect x="5" y="7" width="14" height="10" rx="1"/>',
  remove: '<path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13"/>',
  clear: '<path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13"/><path d="M10.5 10.5l3 6M13.5 10.5l-3 6"/>',
}

const TOOLS: ReadonlyArray<{ id: string; tool: string | null; title: string }> = [
  { id: 'cursor', tool: null, title: 'Cursor' },
  { id: 'trend_line', tool: 'trend_line', title: 'Trend line' },
  { id: 'horizontal_line', tool: 'horizontal_line', title: 'Horizontal line' },
  { id: 'rectangle', tool: 'rectangle', title: 'Rectangle' },
]

export interface DrawingsRail {
  /** Repaint the armed-tool highlight (wire to DrawingsEvents.onToolChange). */
  syncTool(type: string | null): void
  /** Enable/disable the delete button (wire to DrawingsEvents.onSelectionChange). */
  syncSelection(id: string | null): void
  destroy(): void
}

export function mountDrawingsRail(container: HTMLElement, drawings: DrawingsHandle, theme: ResolvedTheme): DrawingsRail {
  // The rail floats over the chart canvases; the container anchors it.
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  const rail = document.createElement('div')
  // pointer-events:auto opts this strip back in over an inert chrome layer; the layer being a
  // SEPARATE subtree from the chart box is what keeps a tool click out of the gesture layers'
  // capture-phase handlers (a bubble-phase stopPropagation cannot unwind those).
  rail.style.cssText = 'position:absolute;left:8px;top:8px;z-index:3;display:flex;flex-direction:column;gap:4px;pointer-events:auto;'
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) {
    rail.addEventListener(type, (e) => e.stopPropagation())
  }

  const buttons = new Map<string, HTMLButtonElement>()
  const baseStyle = (el: HTMLButtonElement) => {
    el.style.cssText =
      'width:28px;height:28px;display:flex;align-items:center;justify-content:center;' +
      `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:6px;` +
      `color:${theme.textColor};cursor:pointer;padding:0;`
  }

  const button = (id: string, title: string, onClick: () => void): HTMLButtonElement => {
    const el = document.createElement('button')
    el.type = 'button'
    el.title = title
    el.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${RAIL_ICONS[id] ?? ''}</svg>`
    baseStyle(el)
    el.addEventListener('click', onClick)
    rail.appendChild(el)
    buttons.set(id, el)
    return el
  }

  for (const t of TOOLS) button(t.id, t.title, () => drawings.armTool(t.tool))
  const removeBtn = button('remove', 'Delete selected drawing', () => drawings.deleteSelected())
  button('clear', 'Clear all drawings', () => drawings.clearAll())

  const syncTool = (type: string | null) => {
    for (const t of TOOLS) {
      const el = buttons.get(t.id)
      if (!el) continue
      const active = type === t.tool
      el.style.color = active ? theme.upColor : theme.textColor
      el.style.borderColor = active ? theme.upColor : theme.gridColor
    }
  }
  const syncSelection = (id: string | null) => {
    removeBtn.disabled = id === null
    removeBtn.style.opacity = id === null ? '0.45' : '1'
  }
  syncTool(drawings.activeTool())
  syncSelection(drawings.hasSelection() ? 'selected' : null)

  container.appendChild(rail)
  return {
    syncTool,
    syncSelection,
    destroy() {
      rail.remove()
    },
  }
}
