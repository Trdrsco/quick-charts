// Resolvers and host drawings for the icon tests. `ownIcons` gives a surface mounted with no widget
// around it the chart's own glyphs, or a host's drawings where a test holds a surface to them;
// `everyHostIcon` is a host that draws every published icon, each drawing marked with its icon, and
// `ownGlyphs` names every glyph on the page the host did not draw.
import { CHART_ICON_IDS, type ChartIcons } from '../src/ui/icons/catalog'
import type { ChartIconFactory } from '../src/ui/icons/contract'
import { createIconDiagnostics, type IconDiagnostics } from '../src/ui/icons/draw'
import { createIconResolver, type IconResolver } from '../src/ui/icons/resolver'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function ownIcons(icons?: ChartIcons, diagnostics: IconDiagnostics = createIconDiagnostics(), direction: () => 'ltr' | 'rtl' = () => 'ltr'): IconResolver {
  return createIconResolver({ icons, document, direction, diagnostics })
}

/** A host's drawing for one icon: a plain square in the control's ink, marked with its icon and the
 *  reading direction it was drawn for. */
export function hostIcon(id: string): ChartIconFactory {
  return (context) => {
    const svg = context.document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 10 10')
    svg.setAttribute('data-host-icon', id)
    svg.setAttribute('data-direction', context.direction)
    const square = context.document.createElementNS(SVG_NS, 'path')
    square.setAttribute('d', 'M1 1h8v8H1z')
    square.setAttribute('fill', 'currentColor')
    svg.append(square)
    return svg
  }
}

/** A host that draws every icon the chart publishes. */
export const everyHostIcon = (): ChartIcons => Object.fromEntries(CHART_ICON_IDS.map((id) => [id, hostIcon(id)]))

/** Every glyph under `root` the host did not draw, apart from those under `except`, each named by
 *  the control that wears it so a failure says where the glyph stands. */
export function ownGlyphs(root: ParentNode = document, except?: string): string[] {
  return [...root.querySelectorAll('svg')]
    .filter((svg) => !svg.hasAttribute('data-host-icon') && !(except && svg.closest(except)))
    .map((svg) => {
      const control = svg.closest('[aria-label]')
      const box = svg.parentElement
      return `${control?.getAttribute('aria-label') ?? '(unnamed)'} > ${box?.getAttribute('class') ?? box?.tagName.toLowerCase() ?? ''}`
    })
}
