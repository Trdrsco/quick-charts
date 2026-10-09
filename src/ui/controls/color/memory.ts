// Where the colors a viewer mixed are kept, for the color controls inside one surface. The chart
// owns what it remembers: a surface that keeps the viewer's preferences provides their mixed colors
// to its own subtree, and every palette opened inside that subtree offers them and adds to them. A
// palette with nothing provided above it offers no mixed colors, and its mixer still applies.
//
// A provider is found the way a widget's layer is: by walking up from the element that asks, so a
// row builder deep inside a dialog needs no handle threaded through to it.

/** The colors a viewer mixed, newest first, and how a new one joins them. */
export interface ColorMemory {
  list(): readonly string[]
  add(hex: string): void
}

const provided = new WeakMap<Element, ColorMemory>()

/** Provide the mixed colors to everything inside `root`. Returns the withdrawal, which the surface
 *  runs when it closes. */
export function provideColorMemory(root: Element, memory: ColorMemory): () => void {
  provided.set(root, memory)
  return () => {
    if (provided.get(root) === memory) provided.delete(root)
  }
}

/** The mixed colors provided to an element: the nearest provider at or above it, or null where
 *  none is. */
export function colorMemoryFor(element: Element): ColorMemory | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const memory = provided.get(node)
    if (memory) return memory
  }
  return null
}
