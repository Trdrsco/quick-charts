// The one path every glyph of the chart's interface is drawn through.
//
// A surface names the glyph it would draw; the resolver draws the host's drawing for that glyph's
// icon when the host gave one and the drawing stands, and the chart's own otherwise. So a host's
// artwork reaches every control that means the same thing, a surface never decides for itself
// whether it may be redrawn, and a factory that fails costs one glyph its artwork, never a control.
// Each widget draws through its own resolver, so two widgets on one page wear what each was given.
//
// A factory is told the reading direction when it draws, so the resolver remembers every drawing it
// handed out and what made it. When the widget's direction turns around, each is drawn again for
// the new one and put in place of the old; the controls around them stay exactly as they were.
import { ICONS, type Glyph, type IconName } from '../controls/icons'
import { glyph as drawOwn } from '../chrome/dom'
import { checkIcons, iconOf, toolGlyph, type ChartIconId, type ChartIcons } from './catalog'
import type { ChartIconFactory } from './contract'
import { drawHostIcon, type IconDiagnostics } from './draw'

/** How a surface asks for a glyph: the box, and a class for the glyph's own span. */
export interface GlyphOptions {
  /** The box's width, and its height unless `height` says otherwise. Defaults to the glyph's own. */
  size?: number
  height?: number
  className?: string
}

/** The box a glyph fills, in CSS pixels. */
interface IconBox {
  width: number
  height: number
}

export interface IconResolver {
  /** One glyph as a `qc-icon` span, hidden from assistive technology: the control it stands in
   *  carries the name. */
  glyph(mark: Glyph, options?: GlyphOptions): HTMLElement
  /** One glyph of the table by its name, as a bare `<svg>` sized by its height, for a surface that
   *  stands the element in a cell of its own. The height defaults to the glyph's own. */
  icon(name: IconName, height?: number): SVGSVGElement
  /** A drawing tool's miniature as a bare `<svg>`, or null for a type that draws none. */
  tool(type: string, size?: number): SVGSVGElement | null
  /** The host's drawing for an icon on a box, or null for the chart's own. For a surface whose own
   *  glyph is not drawn from the glyph table. */
  host(id: ChartIconId, box: IconBox): SVGSVGElement | null
  /** A host's own factory drawn on a box, the way `host` draws a published icon's: for a control the
   *  host made rather than one of the chart's. `icon` names the drawing in a diagnostic. */
  draw(factory: ChartIconFactory, box: IconBox, icon: string): SVGSVGElement | null
  /** Draw every host drawing still standing again, for the reading direction now. A drawing already
   *  made for that direction is left alone, and one whose factory refuses the new direction stays as
   *  it was drawn. */
  redraw(): void
}

export interface IconResolverDeps {
  icons?: ChartIcons
  document: Document
  /** The widget's reading direction now. */
  direction(): 'ltr' | 'rtl'
  diagnostics: IconDiagnostics
}

/** A host drawing the resolver handed out, with what made it, so it can be made again in place. */
interface HostDrawing {
  element: WeakRef<SVGSVGElement>
  factory: ChartIconFactory
  box: IconBox
  icon: string
  direction: 'ltr' | 'rtl'
}

export function createIconResolver(deps: IconResolverDeps): IconResolver {
  checkIcons(deps.icons)
  const icons = deps.icons ?? {}
  /** Every host drawing that may still stand. A record goes when its element is collected, so a
   *  menu drawn and discarded a thousand times holds nothing once its glyphs are gone. */
  const standing = new Set<HostDrawing>()
  const forget = new FinalizationRegistry<HostDrawing>((record) => standing.delete(record))
  const draw = (factory: ChartIconFactory, box: IconBox, icon: string): SVGSVGElement | null => {
    const direction = deps.direction()
    const drawn = drawHostIcon(factory, { document: deps.document, width: box.width, height: box.height, direction })
    if ('failure' in drawn) {
      deps.diagnostics.report(icon, drawn.failure)
      return null
    }
    const record: HostDrawing = { element: new WeakRef(drawn.element), factory, box, icon, direction }
    standing.add(record)
    forget.register(drawn.element, record, record)
    return drawn.element
  }
  const host = (id: ChartIconId, box: IconBox): SVGSVGElement | null => {
    const factory = icons[id]
    return factory ? draw(factory, box, id) : null
  }
  const redraw = (): void => {
    const direction = deps.direction()
    for (const record of [...standing]) {
      if (record.direction === direction) continue
      const element = record.element.deref()
      if (!element) {
        standing.delete(record)
        continue
      }
      // A drawing no element holds any more has nowhere to stand again.
      if (!element.parentNode) continue
      const fresh = draw(record.factory, record.box, record.icon)
      if (!fresh) continue
      element.replaceWith(fresh)
      standing.delete(record)
      forget.unregister(record)
    }
  }
  const glyph = (mark: Glyph, options: GlyphOptions = {}): HTMLElement => {
    const id = iconOf(mark)
    if (id) {
      const width = options.size ?? mark.size ?? 28
      const drawn = host(id, { width, height: options.height ?? width })
      if (drawn) {
        const span = deps.document.createElement('span')
        span.className = `qc-icon${options.className ? ` ${options.className}` : ''}`
        span.setAttribute('aria-hidden', 'true')
        span.append(drawn)
        return span
      }
    }
    return drawOwn(mark, options)
  }
  /** A glyph's width for a height, by its own proportion. */
  const widthFor = (mark: Glyph, height: number): number => (mark.aspect === undefined ? height : Math.round(height * mark.aspect * 1000) / 1000)
  /** The chart's own drawing as a bare element: package-authored markup, which is what makes the
   *  innerHTML write safe. */
  const ownSvg = (mark: Glyph, width: number, height: number): SVGSVGElement => {
    const holder = deps.document.createElement('span')
    holder.innerHTML = `<svg width="${width}" height="${height}" viewBox="${mark.viewBox}" fill="none" aria-hidden="true">${mark.body}</svg>`
    return holder.firstElementChild as SVGSVGElement
  }
  const bare = (mark: Glyph, width: number, height: number): SVGSVGElement => {
    const id = iconOf(mark)
    return (id ? host(id, { width, height }) : null) ?? ownSvg(mark, width, height)
  }
  return {
    glyph,
    icon(name, requested) {
      const mark: Glyph = ICONS[name]
      const height = requested ?? mark.size ?? 28
      return bare(mark, widthFor(mark, height), height)
    },
    tool(type, size = 28) {
      const mark = toolGlyph(type)
      return mark ? bare(mark, size, size) : null
    },
    host,
    draw,
    redraw,
  }
}
