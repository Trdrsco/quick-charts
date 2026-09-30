// Which body-level layer belongs to which widget. Inside the root every pane is its own stacking
// context and the host's own chrome may stack above the widget, so a surface that must stand over
// the whole page cannot be raised from inside the root at any z-index. The widget keeps a themed
// layer on the document body for those surfaces, and this is how a surface inside the root finds
// the one that is its own.

const layers = new WeakMap<Element, HTMLElement>()

/** Pair a widget's root with its layer. Returns the unpairing, which the widget runs at teardown. */
export function registerLayer(root: Element, layer: HTMLElement): () => void {
  layers.set(root, layer)
  return () => {
    if (layers.get(root) === layer) layers.delete(root)
  }
}

/** The layer of the widget an element lives in, or null where there is none: an element outside
 *  any widget, or a root a test built by hand. */
export function layerFor(element: Element): HTMLElement | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const layer = layers.get(node)
    if (layer) return layer
  }
  return null
}
