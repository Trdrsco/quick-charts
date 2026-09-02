// Where a resolved theme meets the DOM: one attribute and one set of custom properties, written on
// the widget's own root element and nowhere else.
//
// This is the whole styling mechanism. The package stylesheet (`quickcharts/styles.css`) is scoped
// to that attribute, so every `.qc-*` recipe resolves against the properties this module writes.
// Two widgets in one document therefore run different modes without either reaching the host page,
// and nothing in the package writes a color from JavaScript: a component that needs a new rule
// gets one in the stylesheet, not a style string.
import { themeRootStyle } from '../theme/renderer'
import type { SemanticTheme, ThemeMode } from '../theme/schema'

/** Write one resolved theme onto an element: the scoping attribute, then one custom property per
 *  role. Called at mount and on every theme change, and it replaces values in place, so a switch
 *  restyles the live chart without rebuilding a node. */
export function paintThemeRoot(root: HTMLElement, mode: ThemeMode, theme: SemanticTheme): void {
  const style = themeRootStyle(mode, theme)
  root.setAttribute(style.attribute.name, style.attribute.value)
  for (const declaration of style.declarations) root.style.setProperty(declaration.property, declaration.value)
}
