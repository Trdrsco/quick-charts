import type { PaneRect } from '../layoutGrid'

const EPS = 1e-6
export const SAVED_GEOMETRY_MIN = 0.02

export interface PaneDivider {
  axis: 'v' | 'h'
  pos: number
  span: readonly [number, number]
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS

function mergeSpans(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [start, end] of sorted) {
    const last = out.at(-1)
    if (last && start <= last[1] + EPS) last[1] = Math.max(last[1], end)
    else out.push([start, end])
  }
  return out
}

export function dividersOf(rects: readonly PaneRect[]): PaneDivider[] {
  const lines = { v: new Map<number, [number, number][]>(), h: new Map<number, [number, number][]>() }
  const add = (axis: 'v' | 'h', pos: number, span: [number, number]): void => {
    if (pos < EPS || pos > 1 - EPS) return
    const key = [...lines[axis].keys()].find((held) => near(held, pos)) ?? pos
    lines[axis].set(key, [...(lines[axis].get(key) ?? []), span])
  }
  for (const rect of rects) {
    add('v', rect.x, [rect.y, rect.y + rect.h])
    add('v', rect.x + rect.w, [rect.y, rect.y + rect.h])
    add('h', rect.y, [rect.x, rect.x + rect.w])
    add('h', rect.y + rect.h, [rect.x, rect.x + rect.w])
  }
  const out: PaneDivider[] = []
  for (const axis of ['v', 'h'] as const)
    for (const [pos, spans] of lines[axis]) for (const span of mergeSpans(spans)) out.push({ axis, pos, span })
  return out
}

export function moveDivider(rects: readonly PaneRect[], divider: PaneDivider, to: number, min = 0.05): PaneRect[] | null {
  const overlaps = (rect: PaneRect): boolean => {
    const [start, end] = divider.span
    const [rectStart, rectEnd] = divider.axis === 'v' ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w]
    return rectStart < end - EPS && start < rectEnd - EPS
  }
  let low = min
  let high = 1 - min
  for (const rect of rects) {
    if (!overlaps(rect)) continue
    const [start, end] = divider.axis === 'v' ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h]
    if (near(end, divider.pos)) low = Math.max(low, start + min)
    if (near(start, divider.pos)) high = Math.min(high, end - min)
  }
  if (low > high + EPS) return null
  const clamped = Math.min(high, Math.max(low, to))
  return rects.map((rect) => {
    if (!overlaps(rect)) return { ...rect }
    const [start, end] = divider.axis === 'v' ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h]
    if (near(end, divider.pos)) return divider.axis === 'v' ? { ...rect, w: clamped - rect.x } : { ...rect, h: clamped - rect.y }
    if (near(start, divider.pos)) return divider.axis === 'v' ? { ...rect, x: clamped, w: rect.x + rect.w - clamped } : { ...rect, y: clamped, h: rect.y + rect.h - clamped }
    return { ...rect }
  })
}

const topology = (rects: readonly PaneRect[]): string[] => {
  const out: string[] = []
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!
    if (near(a.x, 0)) out.push(`${i}:left`)
    if (near(a.y, 0)) out.push(`${i}:top`)
    if (near(a.x + a.w, 1)) out.push(`${i}:right`)
    if (near(a.y + a.h, 1)) out.push(`${i}:bottom`)
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!
      const vertical = (near(a.x + a.w, b.x) || near(b.x + b.w, a.x)) && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
      const horizontal = (near(a.y + a.h, b.y) || near(b.y + b.h, a.y)) && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS
      if (vertical) out.push(`${i}:${j}:v`)
      if (horizontal) out.push(`${i}:${j}:h`)
    }
  }
  return out.sort()
}

export function validGeometry(value: unknown, catalog: readonly PaneRect[]): PaneRect[] | null {
  if (!Array.isArray(value) || value.length !== catalog.length) return null
  const rects: PaneRect[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const { x, y, w, h } = item as Partial<PaneRect>
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    if (x! < -EPS || y! < -EPS || w! < SAVED_GEOMETRY_MIN || h! < SAVED_GEOMETRY_MIN || x! + w! > 1 + EPS || y! + h! > 1 + EPS) return null
    rects.push({ x: x!, y: y!, w: w!, h: h! })
  }
  let area = 0
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!
    area += a.w * a.h
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS) return null
    }
  }
  if (!near(area, 1) || topology(rects).join('|') !== topology(catalog).join('|')) return null
  return rects
}
