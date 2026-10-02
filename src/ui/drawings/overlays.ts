// Where a drawing toolbar's panels stand. An externally-mounted drawing toolbar is not inside the
// widget, so its panels need to be told which bounds to stay within; the overlays those panels
// register are the shared register's business, not this module's.

/** An externally-mounted drawing toolbar and the widget-owned plane its panels use. The
 * association is private implementation state: the public container remains mounting space, not
 * an overlay API. */
const panelHosts = new WeakMap<HTMLElement, HTMLElement>()

/** Bind a package-created external drawing toolbar to the widget bounds its panels stay within. */
export function bindPanelHost(surface: HTMLElement, host: HTMLElement): () => void {
  panelHosts.set(surface, host)
  return () => {
    if (panelHosts.get(surface) === host) panelHosts.delete(surface)
  }
}

/** Resolve the panel host for a drawing toolbar mount, falling back to the chart-local chrome for
 * standalone drawing toolbars and for any host element the package did not create and bind. */
export function panelHostFor(surface: HTMLElement | null, fallback: HTMLElement): HTMLElement {
  return (surface && panelHosts.get(surface)) ?? fallback
}
