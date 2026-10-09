import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { HOST_LAYER_ORDER } from '../../src/theme/css-contract'

// A host page's global rules over the chart, as an application lays them over everything it holds:
// the layer order the package documents for a host, declared first, its reset in the `reset` layer
// under the chart's own layers, and its own rules beside them, unlayered.

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** The host's stylesheet: the layer order first, the reset in its layer, then the host's own rules. */
export const HOST_RULES = [HOST_LAYER_ORDER, `@layer reset {\n${fixture('preflight.css')}\n}`, fixture('host.css')].join('\n')

/** Lay the host's rules over the page at the head of the document, before the chart's stylesheet, so
 *  the layer order they declare is the one the cascade reads. */
export async function applyHostRules(page: Page): Promise<void> {
  await page.evaluate((css) => {
    const style = document.createElement('style')
    style.dataset.hostRules = 'true'
    style.textContent = css
    document.head.prepend(style)
  }, HOST_RULES)
}
