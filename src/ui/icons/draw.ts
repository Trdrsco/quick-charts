// The one place a host's icon factory is called and its answer checked.
//
// What is checked is the chart's own safety, not the host's taste: an answer that is not an SVG
// element cannot stand where a glyph stands, and one that already stands somewhere, or was handed
// out before, would be pulled out of the control holding it. Either draws nothing, as a factory that
// throws does, and the caller says why once and falls back.
import type { ChartIconContext, ChartIconDiagnostic, ChartIconFactory, ChartIconFailure } from './contract'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Every element a factory has answered. One answered twice is refused the second time, whether or
 *  not the first control still holds it. */
const answered = new WeakSet<object>()

const isSvg = (node: unknown): node is SVGSVGElement =>
  typeof node === 'object' && node !== null && (node as Node).nodeType === 1 && (node as Element).namespaceURI === SVG_NS && (node as Element).localName === 'svg'

const FAILURE_TEXT: Record<ChartIconFailure, string> = {
  threw: 'the factory threw',
  'not-svg': 'the factory answered something other than an <svg> element',
  'in-use': 'the factory answered an element already in a document or answered before',
}

/** Call a factory for one box. The answer is sized to the box and hidden from assistive technology,
 *  because the control around it carries the name. */
export function drawHostIcon(factory: ChartIconFactory, context: ChartIconContext): { element: SVGSVGElement } | { failure: ChartIconFailure } {
  let node: unknown
  try {
    node = factory(context)
  } catch {
    return { failure: 'threw' }
  }
  if (!isSvg(node)) return { failure: 'not-svg' }
  if (node.parentNode !== null || answered.has(node)) return { failure: 'in-use' }
  answered.add(node)
  node.setAttribute('width', String(context.width))
  node.setAttribute('height', String(context.height))
  node.setAttribute('aria-hidden', 'true')
  node.setAttribute('focusable', 'false')
  return { element: node }
}

/** The widget's record of glyphs it could not draw from a host's factory: the first failure of each
 *  icon, so a factory failing on every repaint reports once rather than without end. */
export interface IconDiagnostics {
  report(icon: string, failure: ChartIconFailure): void
  list(): readonly ChartIconDiagnostic[]
}

export function createIconDiagnostics(): IconDiagnostics {
  const seen = new Map<string, ChartIconDiagnostic>()
  return {
    report(icon, failure) {
      if (!seen.has(icon)) seen.set(icon, { icon, code: failure, message: `${icon}: ${FAILURE_TEXT[failure]}` })
    },
    list: () => [...seen.values()],
  }
}
