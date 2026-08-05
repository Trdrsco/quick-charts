// The indicator inputs micro-editor — the legend gear's surface: one numeric or enum field per
// declared manifest input, applied as a whole on Enter/Apply. Same chrome discipline as every
// widget editor: tiny theme-tinted vanilla DOM in the overlay subtree, self-removing, pointer
// events stopped. Pre-render: it only hands a validated input patch back; the host owns the
// recompute.
import type { ResolvedTheme } from './host'
import type { ManifestInput } from './indicatorModel'

export function openInputsEditor(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  inputs: Readonly<Record<string, ManifestInput>>,
  current: Readonly<Record<string, number>>,
  theme: ResolvedTheme,
  onApply: (patch: Record<string, number>) => void,
): void {
  const host = container.getBoundingClientRect()
  const el = document.createElement('div')
  el.style.cssText =
    `position:absolute;left:${Math.max(4, rect.x - host.left)}px;top:${Math.max(4, rect.y - host.top + rect.h + 4)}px;z-index:6;` +
    `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:6px;padding:6px 8px;` +
    `display:flex;flex-direction:column;gap:4px;font-size:11px;color:${theme.textColor};pointer-events:auto;min-width:150px;`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) el.addEventListener(type, (e) => e.stopPropagation())

  const dismiss = () => el.remove()
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement>()

  for (const [key, spec] of Object.entries(inputs)) {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;'
    const name = document.createElement('span')
    // Prettify the key ('smoothingLength' → 'Smoothing Length'); display names richer than this
    // are a host concern.
    name.textContent = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
    row.appendChild(name)
    if (spec.kind === 'enum') {
      const select = document.createElement('select')
      select.style.cssText = `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};font-size:11px;padding:1px 2px;`
      ;(spec.options ?? []).forEach((label, i) => {
        const o = document.createElement('option')
        o.value = String(i)
        o.textContent = label
        select.appendChild(o)
      })
      select.value = String(current[key] ?? spec.default)
      fields.set(key, select)
      row.appendChild(select)
    } else {
      const input = document.createElement('input')
      input.type = 'number'
      if (spec.min !== undefined) input.min = String(spec.min)
      if (spec.max !== undefined) input.max = String(spec.max)
      input.step = spec.kind === 'int' ? '1' : 'any'
      input.value = String(current[key] ?? spec.default)
      input.style.cssText = `width:72px;background:transparent;border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};padding:1px 4px;font-size:11px;outline:none;`
      fields.set(key, input)
      row.appendChild(input)
    }
    el.appendChild(row)
  }

  const apply = () => {
    const patch: Record<string, number> = {}
    for (const [key, field] of fields) {
      const spec = inputs[key]!
      let value = Number(field.value)
      if (!Number.isFinite(value)) continue // an unparseable field keeps its previous value
      if (spec.kind === 'int' || spec.kind === 'enum') value = Math.round(value)
      if (spec.min !== undefined) value = Math.max(spec.min, value)
      if (spec.max !== undefined) value = Math.min(spec.max, value)
      patch[key] = value
    }
    onApply(patch)
    dismiss()
  }

  const buttons = document.createElement('div')
  buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:2px;'
  const mkButton = (label: string, onClick: () => void, accent = false) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText =
      `background:none;border:1px solid ${accent ? theme.upColor : theme.gridColor};border-radius:4px;` +
      `color:${accent ? theme.upColor : theme.textColor};cursor:pointer;padding:1px 8px;font-size:11px;`
    b.addEventListener('click', onClick)
    buttons.appendChild(b)
  }
  mkButton('Cancel', dismiss)
  mkButton('Apply', apply, true)
  el.appendChild(buttons)

  el.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') apply()
    else if (e.key === 'Escape') dismiss()
  })

  container.appendChild(el)
  ;(fields.values().next().value as HTMLElement | undefined)?.focus?.()
}
