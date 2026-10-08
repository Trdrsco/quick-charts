// The rig the painted checks of the text tools share: words measured in Trebuchet MS, the font the
// measured pixels were painted in, so every box a tool sizes comes out at those pixels, and a canvas
// context that records each call with the state it was made in.
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'

/** Trebuchet MS's advances for the printable ASCII characters, space first, in its units of 2048
 *  to the em. It kerns none of the pairs the checks paint. */
const ASCII_UNITS = [
  617, 752, 665, 1074, 1074, 1229, 1446, 327, 752, 752, 752, 1074, 752, 752, 752, 1074, 1074, 1074, 1074, 1074, 1074, 1074, 1074, 1074, 1074, 1074, 752, 752, 1074, 1074,
  1074, 752, 1578, 1208, 1159, 1225, 1256, 1097, 1075, 1385, 1340, 570, 976, 1179, 1037, 1453, 1307, 1380, 1142, 1384, 1192, 985, 1189, 1328, 1203, 1745, 1140, 1168,
  1127, 752, 728, 752, 1074, 1074, 1074, 1076, 1141, 1014, 1141, 1117, 757, 1028, 1119, 584, 751, 1033, 604, 1700, 1119, 1099, 1141, 1141, 796, 829, 812, 1119, 1003,
  1524, 1026, 1010, 972, 752, 1074, 752, 1074,
]

/** How wide a line reads at a size. */
export const advance = (text: string, px: number): number => [...text].reduce((sum, c) => sum + (ASCII_UNITS[c.charCodeAt(0) - 32] ?? 1100), 0) * (px / 2048)

/** A CSS font's size in pixels. */
export const pxOf = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14)

/** Hand the drawings' shared measurer the font: call before anything measures. */
export function measureInTrebuchet(): void {
  const measurer = {
    font: '',
    measureText(this: { font: string }, text: string) {
      return { width: advance(text, pxOf(this.font)) }
    },
  }
  HTMLCanvasElement.prototype.getContext = (() => measurer) as unknown as typeof HTMLCanvasElement.prototype.getContext
}

/** A pane where a time is its own x and a price its own y. */
export const identityViewport: Viewport = {
  width: 1200,
  height: 900,
  xOf: (time) => Number(time),
  yOf: (price) => price,
  timeAt: (x) => x as never,
  priceAt: (y) => y,
  barsBetween: (a, b) => Number(b) - Number(a),
  logicalOf: (time) => Number(time),
  timeOfLogical: (logical) => logical as never,
}

export interface PaintCall {
  name: string
  args: unknown[]
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: unknown
  alpha: number
  baseline: unknown
  align: unknown
  shadow: { color: unknown; blur: unknown; x: unknown; y: unknown }
}

/** Paint a drawing on a context that records each call with the state it was made in. */
export function painted(d: IDrawing, viewport: Viewport = identityViewport): PaintCall[] {
  const calls: PaintCall[] = []
  let state = new Map<string | symbol, unknown>([['globalAlpha', 1]])
  const stack: Map<string | symbol, unknown>[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: advance(text, pxOf(String(state.get('font') ?? ''))) })
      if (p === 'save') return () => void stack.push(new Map(state))
      if (p === 'restore') return () => void (state = stack.pop() ?? state)
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({
          name: String(p),
          args,
          fillStyle: state.get('fillStyle'),
          strokeStyle: state.get('strokeStyle'),
          lineWidth: state.get('lineWidth'),
          alpha: Number(state.get('globalAlpha')),
          baseline: state.get('textBaseline'),
          align: state.get('textAlign'),
          shadow: { color: state.get('shadowColor'), blur: state.get('shadowBlur'), x: state.get('shadowOffsetX'), y: state.get('shadowOffsetY') },
        })
      }
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  ;(d as unknown as { paint(c: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return calls
}

export const named = (calls: PaintCall[], name: string): PaintCall[] => calls.filter((c) => c.name === name)
