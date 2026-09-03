// The pieces of a browser that happy-dom leaves out, for the two places this package mounts a real
// widget without a browser: the feature-manifest build (scripts/build-feature-manifest.mjs) and the
// workspace conformance run (test/conformance). Both run the real `createChart` over the real renderer;
// what they cannot do is rasterize, so the canvas below accepts every drawing call and remembers every
// property, and the color reading the renderer takes through `getComputedStyle` answers in the rgb
// notation a browser would.
//
// This file has no import at all. Node loads it directly under its TypeScript stripping from the build
// script, and Vitest loads it into the happy-dom environment, so it has to stand alone in both.

/** What `installBrowserShim` hands back: one call takes every patch off again. */
export interface BrowserShimHandle {
  uninstall(): void
}

/** A CSS color as `getComputedStyle` reports it: hex in rgb notation, `rgb`/`rgba` written with one
 *  space after each comma, anything else as given. The renderer parses its colors by writing one on
 *  an element and reading it back, and it accepts only that notation. */
export function normalizeCssColor(color: string): string {
  const text = color.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (hex) {
    let digits = hex[1] as string
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c + c).join('')
    if (digits.length !== 6 && digits.length !== 8) return text
    const r = Number.parseInt(digits.slice(0, 2), 16)
    const g = Number.parseInt(digits.slice(2, 4), 16)
    const b = Number.parseInt(digits.slice(4, 6), 16)
    const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
    return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
  }
  const fn = /^(rgba?)\(([^)]*)\)$/i.exec(text)
  if (fn) {
    const parts = (fn[2] as string)
      .split(/[\s,/]+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 3) return `rgb(${parts.join(', ')})`
    if (parts.length === 4) {
      const alpha = (parts[3] as string).endsWith('%') ? Number.parseFloat(parts[3] as string) / 100 : Number.parseFloat(parts[3] as string)
      return alpha === 1 ? `rgb(${parts.slice(0, 3).join(', ')})` : `rgba(${parts.slice(0, 3).join(', ')}, ${alpha})`
    }
  }
  return text
}

/** A 2D context that remembers what was set on it and accepts every call. `measureText` answers a
 *  width proportional to the text so layout arithmetic has something to work with; `getImageData`
 *  answers zeroed pixels of the asked size. */
function fakeContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const props = new Map<string | symbol, unknown>()
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, property) => {
      if (property === 'canvas') return canvas
      if (property === 'measureText') return (text: string) => ({ width: text.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (property === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h })
      if (property === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h })
      if (property === 'createLinearGradient' || property === 'createRadialGradient' || property === 'createPattern') return () => ({ addColorStop: () => undefined })
      if (property === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      if (property === 'isPointInPath' || property === 'isPointInStroke') return () => false
      if (props.has(property)) return props.get(property)
      return () => undefined
    },
    set: (_target, property, value) => {
      props.set(property, value)
      return true
    },
  })
}

/** The bytes of a PNG header: enough for a consumer to read the type off a blob a fake canvas made. */
const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

/** Install the shim on a window: the canvas context, the canvas export surface, the computed color
 *  reading, and the object URLs a download needs. Idempotent per window. */
export function installBrowserShim(win: Window & typeof globalThis): BrowserShimHandle {
  const canvasProto = win.HTMLCanvasElement.prototype as HTMLCanvasElement & { __qcShim?: boolean }
  if (canvasProto.__qcShim) return { uninstall: () => undefined }
  canvasProto.__qcShim = true

  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
  const originalGetContext = canvasProto.getContext
  const originalToBlob = canvasProto.toBlob
  const originalToDataURL = canvasProto.toDataURL
  const originalGetComputedStyle = win.getComputedStyle
  // Object URLs: a download hands its blob to `URL.createObjectURL`. The widget reaches the GLOBAL
  // `URL`, which under Node is Node's own and takes only Node's `Blob`, while the blob a fake canvas
  // makes is the window's. Both URL objects take the stand-in, so a download resolves to a blob URL
  // whichever `URL` the runtime hands the widget.
  type ObjectUrls = { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (u: string) => void }
  const urls = [...new Set([win.URL as unknown as ObjectUrls, globalThis.URL as unknown as ObjectUrls])]
  const originalObjectUrls = urls.map((u) => ({ target: u, create: u.createObjectURL, revoke: u.revokeObjectURL }))

  canvasProto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null
    let ctx = contexts.get(this)
    if (!ctx) {
      ctx = fakeContext2d(this)
      contexts.set(this, ctx)
    }
    return ctx
  } as typeof canvasProto.getContext

  canvasProto.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
    win.setTimeout(() => callback(new win.Blob([PNG_HEADER], { type: type ?? 'image/png' })), 0)
  }

  canvasProto.toDataURL = function (this: HTMLCanvasElement, type?: string) {
    return `data:${type ?? 'image/png'};base64,iVBORw0KGgo=`
  }

  win.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const computed = originalGetComputedStyle.call(win, element, pseudo ?? undefined)
    const inline = (element as HTMLElement).style?.color
    return new Proxy(computed, {
      get: (target, property) => {
        if (property === 'color') return normalizeCssColor(inline || target.color || 'rgb(0, 0, 0)')
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }) as typeof win.getComputedStyle

  let objectUrls = 0
  for (const target of urls) {
    target.createObjectURL = () => `blob:shim/${++objectUrls}`
    target.revokeObjectURL = () => undefined
  }

  // Layout. happy-dom lays nothing out, so every element measures zero and a chart has nothing to
  // size itself by or to picture. An element measures as its own inline pixel size when it has one,
  // else as the nearest ancestor that has one: the host's container box, handed down to the widget
  // root and its panes the way the stylesheet's percentages would hand it down in a browser.
  const elementProto = win.HTMLElement.prototype
  const measured = (property: 'clientWidth' | 'clientHeight') => Object.getOwnPropertyDescriptor(elementProto, property)
  const originalWidth = measured('clientWidth')
  const originalHeight = measured('clientHeight')
  const pixels = (value: string): number | null => {
    const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
    return m ? Number(m[1]) : null
  }
  const measure = (element: HTMLElement, axis: 'width' | 'height'): number => {
    for (let at: HTMLElement | null = element; at; at = at.parentElement) {
      const own = pixels(at.style[axis])
      if (own !== null) return own
    }
    return 0
  }
  Object.defineProperty(elementProto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return measure(this, 'width')
    },
  })
  Object.defineProperty(elementProto, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return measure(this, 'height')
    },
  })

  // A ResizeObserver that reports the same measure once, on observe, the way a browser reports an
  // element's first layout. happy-dom's own never calls back, so a renderer that sizes itself from
  // its container would stay at zero and hold no visible range.
  const g = win as unknown as { ResizeObserver?: typeof ResizeObserver }
  const originalResizeObserver = g.ResizeObserver
  class MeasuredResizeObserver {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element): void {
      const width = measure(target as HTMLElement, 'width')
      const height = measure(target as HTMLElement, 'height')
      const rect = { x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRectReadOnly
      const size = [{ inlineSize: width, blockSize: height }]
      const entry = { target, contentRect: rect, borderBoxSize: size, contentBoxSize: size, devicePixelContentBoxSize: size } as ResizeObserverEntry
      win.setTimeout(() => this.callback([entry], this as unknown as ResizeObserver), 0)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  g.ResizeObserver = MeasuredResizeObserver as unknown as typeof ResizeObserver
  const globalScope = globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }
  const originalGlobalResizeObserver = globalScope.ResizeObserver
  globalScope.ResizeObserver = g.ResizeObserver

  return {
    uninstall() {
      g.ResizeObserver = originalResizeObserver
      globalScope.ResizeObserver = originalGlobalResizeObserver
      if (originalWidth) Object.defineProperty(elementProto, 'clientWidth', originalWidth)
      else Reflect.deleteProperty(elementProto, 'clientWidth')
      if (originalHeight) Object.defineProperty(elementProto, 'clientHeight', originalHeight)
      else Reflect.deleteProperty(elementProto, 'clientHeight')
      delete canvasProto.__qcShim
      canvasProto.getContext = originalGetContext
      canvasProto.toBlob = originalToBlob
      canvasProto.toDataURL = originalToDataURL
      win.getComputedStyle = originalGetComputedStyle
      for (const { target, create, revoke } of originalObjectUrls) {
        if (create) target.createObjectURL = create
        else Reflect.deleteProperty(target, 'createObjectURL')
        if (revoke) target.revokeObjectURL = revoke
        else Reflect.deleteProperty(target, 'revokeObjectURL')
      }
    },
  }
}

/** The window globals a document-level API reads off `globalThis` rather than off `window`. The
 *  Vitest environment installs these itself; the build script, which makes its own window, uses this
 *  list to do the same. */
export const BROWSER_GLOBALS: readonly string[] = [
  'window',
  'document',
  'navigator',
  'location',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'SVGElement',
  'Text',
  'DocumentFragment',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'FocusEvent',
  'InputEvent',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
  'Blob',
  'File',
  'DOMParser',
  'Image',
  'CSSStyleDeclaration',
]
