// The chart settings dialog: a 750px card with the pages on a rail at its start, the page shown
// beside it, and a footer of the Template menu, Cancel and Ok. It edits the active chart: its own
// five pages, built from the chart's settings, and whatever the extensions attached to that chart
// contribute, a page of their own or rows inside one of the chart's.
//
// Every change previews on the chart at once. The dialog is an edit session over what it captured
// on opening: Cancel, the close and Escape put back the viewer's settings, the price-scale mode and
// the timezone as they were, and hand every contribution back the state its `open` answered; Ok
// keeps what the session made and tells every contribution so. The Template menu applies the chart's
// defaults, saves the viewer's settings under a name, and lists the saved ones to apply or delete.
//
// The dialog stands over a chart that stays live under the pointer, so the bars it restyles can be
// watched and hovered while it is up. It opens centred for the page it opens on, keeps its top edge
// while pages of other heights are shown, and rises only as far as a taller page needs to stay on
// screen. The header carries it anywhere for as long as it is open.
import type { ChartMessageKey } from '../../i18n'
import { settingsContributionsOf } from '../../extension'
import type { ChartSettingsContribution, ChartSettingsPageId } from '../../settings/contribution'
import { readPartialChartSettings } from '../../settings/defaults'
import type { PartialChartSettings } from '../../settings/schema'
import type { ScaleMode } from '../../scaleMode'
import { isIntradayTimeframe } from '../../timeframe'
import { EXCHANGE_TIMEZONE, timezoneListing } from '../../timezones'
import type { ChartHandle } from '../../widget/chart'
import { offersTimezone } from '../../widget/offeredTimezones'
import { timezoneCommand } from '../chrome/bottomBar'
import { activeChart, shows, type ChromeContext } from '../chrome/context'
import { tidyRules } from '../chrome/dom'
import { openConfirmDialog, openNameDialog } from '../chrome/prompt'
import { ICONS, type Glyph } from '../controls/icons'
import { selectChevron } from '../controls/select'
import { openDialog, type DialogHandle } from '../drawings/dialog'
import { button, el, focusFirst, menuKeys } from '../drawings/dom'
import { openPopover, reopenPopover } from '../drawings/fields'
import { createSettingsForm, type SettingsFormDeps } from './form'
import { buildChartPage, CHART_PAGES, type ChartPageContext } from './pages'
import type { ChartTemplateRow, ChartTemplates } from './templates'

export interface ChartSettingsDialogDeps extends ChromeContext {
  /** Where the Template menu saves and lists templates, or null when the host keeps none. */
  templates: ChartTemplates | null
}

export interface ChartSettingsDialog {
  /** Open the dialog on a page, a chart page's id or a contributed page's, or on the first; an open
   *  dialog shows the page. Answers whether the dialog stands open. */
  open(page?: string): boolean
  /** Open the dialog, or close an open one as Cancel does. */
  toggle(): void
  isOpen(): boolean
  /** Told whenever the dialog opens or closes. */
  onToggle(listener: (open: boolean) => void): () => void
  /** Read the language and the host's policy again. */
  sync(): void
  /** Close an open dialog as Cancel does and stop listening. */
  destroy(): void
}

/** The rail's icon for each of the chart's pages. */
const PAGE_ICONS: Readonly<Record<ChartSettingsPageId, Glyph>> = {
  symbol: ICONS.settingsSymbol,
  statusLine: ICONS.settingsStatusLine,
  scales: ICONS.settingsScales,
  canvas: ICONS.settingsCanvas,
  events: ICONS.settingsEvents,
}

/** One page on the rail: one of the chart's, or one a contribution adds. */
interface PageEntry {
  id: string
  label(): string
  chart?: ChartSettingsPageId
  contribution?: ChartSettingsContribution
}

/** The margin the dialog keeps from the viewport's top and bottom edges. */
const EDGE = 20

let nextDialogId = 0

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** The viewer's own settings, the partial the chart saves with its content. */
function viewerSettings(chart: ChartHandle): PartialChartSettings {
  try {
    const content: unknown = JSON.parse(chart.saveLoad.serialize().content)
    return readPartialChartSettings(isRecord(content) ? content.settings : undefined).settings
  } catch {
    return {}
  }
}

/** A partial written with its keys in order, so two partials holding the same leaves compare equal. */
const written = (partial: PartialChartSettings): string =>
  JSON.stringify(
    Object.keys(partial)
      .sort()
      .map((section) => {
        const leaves = (partial as Record<string, Record<string, unknown>>)[section]!
        return [section, Object.keys(leaves).sort().map((leaf) => [leaf, leaves[leaf]])]
      }),
  )

const holdsLeaves = (partial: PartialChartSettings): boolean => Object.values(partial).some((leaves) => isRecord(leaves) && Object.keys(leaves).length > 0)

/** A contribution's own failure is its own: the dialog carries on. */
function guarded<T>(run: () => T): T | undefined {
  try {
    return run()
  } catch {
    return undefined
  }
}

export function createChartSettingsDialog(deps: ChartSettingsDialogDeps): ChartSettingsDialog {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const dialogId = ++nextDialogId
  const listeners = new Set<(open: boolean) => void>()
  let session: Session | null = null

  interface Session {
    chart: ChartHandle
    dialog: DialogHandle
    nav: HTMLElement
    panel: HTMLElement
    template: HTMLButtonElement
    cancel: HTMLButtonElement
    ok: HTMLButtonElement
    pages: PageEntry[]
    page: string
    contributions: readonly ChartSettingsContribution[]
    states: unknown[]
    initial: { settings: PartialChartSettings; scale: ScaleMode; timezone: string }
    settled: boolean
    placed: boolean
    disposers: (() => void)[]
    abort: AbortController
    saved: ChartTemplateRow[]
    closeMenu: (() => void) | null
  }

  const tell = (open: boolean): void => {
    for (const listener of [...listeners]) listener(open)
  }

  const panelId = `qc-chart-settings-panel-${dialogId}`
  const tabId = (page: string): string => `qc-chart-settings-tab-${dialogId}-${page}`

  /** The rail's pages: the chart's own, each followed by the pages anchored on it, and each of those
   *  by the pages anchored on it in turn, in contribution order. A contributed page's anchor is the
   *  first id its `after` names that the rail holds, a chart page's or another contribution's, so the
   *  order is read once every contribution is known and does not depend on which attached first. A
   *  page whose `after` names no page the rail holds stands last, as do pages whose anchors name
   *  only one another. */
  const pagesOf = (contributions: readonly ChartSettingsContribution[]): PageEntry[] => {
    const chartPages: PageEntry[] = CHART_PAGES.map((page) => ({ id: page.id, chart: page.id, label: () => t()(page.label as ChartMessageKey) }))
    const ids = new Set(chartPages.map((page) => page.id))
    const contributed: { entry: PageEntry; after: readonly string[] }[] = []
    for (const contribution of contributions) {
      if (!('page' in contribution.place)) continue
      const own = contribution.place.page
      // A later page of an id the rail already holds is left out.
      if (ids.has(own.id)) continue
      ids.add(own.id)
      const after: readonly unknown[] = Array.isArray(own.after) ? own.after : own.after === undefined ? [] : [own.after]
      contributed.push({ entry: { id: own.id, label: () => own.label, contribution }, after: after.filter((id): id is string => typeof id === 'string') })
    }
    // The pages anchored on each page, in contribution order; `null` holds the pages that stand last.
    const anchored = new Map<string | null, PageEntry[]>()
    for (const { entry, after } of contributed) {
      const anchor = after.find((id) => id !== entry.id && ids.has(id)) ?? null
      anchored.set(anchor, [...(anchored.get(anchor) ?? []), entry])
    }
    const pages: PageEntry[] = []
    const placed = new Set<string>()
    const place = (entry: PageEntry): void => {
      if (placed.has(entry.id)) return
      placed.add(entry.id)
      pages.push(entry)
      for (const next of anchored.get(entry.id) ?? []) place(next)
    }
    for (const page of chartPages) place(page)
    for (const page of anchored.get(null) ?? []) place(page)
    for (const { entry } of contributed) place(entry)
    return pages
  }

  const run = (id: string, arg?: unknown): boolean => deps.commands.execute(id, arg).kind === 'ok'

  const pageContext = (s: Session): ChartPageContext => {
    const chart = s.chart
    const zones = deps.timezones ?? null
    return {
      t: t(),
      locale: deps.i18n.tag(),
      settings: chart.settings(),
      style: chart.style(),
      apply: (partial) => {
        run('chart.settings.apply', { settings: partial })
      },
      timezones: timezoneListing(t(), { withExchange: offersTimezone(zones, EXCHANGE_TIMEZONE) }).filter((row) => offersTimezone(zones, row.id)),
      timezone: chart.timezone(),
      setTimezone: (id) => {
        run(timezoneCommand(id))
      },
      intraday: isIntradayTimeframe(chart.timeframe()),
      extendedHours: chart.hasExtendedHours(),
      indicators: chart.indicators.get().length > 0,
      prices: deps.widget.capabilities().prices,
      accent: deps.widget.theme.get()['state.accent'],
    }
  }

  /** Draw the shown page again from the state it reads, keeping the keyboard on the control it was
   *  on and the page where it was scrolled to. */
  const render = (s: Session): void => {
    const focused = document.activeElement instanceof HTMLElement && s.panel.contains(document.activeElement) ? document.activeElement.dataset.qcKey : undefined
    const entry = s.pages.find((page) => page.id === s.page) ?? s.pages[0]!
    const formDeps: SettingsFormDeps = { t: t(), icons: deps.icons, layer: s.dialog.layer, changed: () => render(s), barColor: deps.widget.theme.get()['series.up'] }
    s.panel.replaceChildren()
    s.panel.dataset.page = entry.id
    s.panel.setAttribute('aria-labelledby', tabId(entry.id))
    if (entry.chart) {
      buildChartPage(entry.chart, createSettingsForm(s.panel, formDeps), pageContext(s))
      // The chart's rows stand disabled when the host's policy refuses the command they write through.
      if (!deps.commands.available('chart.settings.apply')) {
        for (const control of s.panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = true
      }
      for (const contribution of s.contributions) {
        const place = contribution.place
        if (!('into' in place) || place.into !== entry.chart) continue
        const rows = document.createDocumentFragment()
        guarded(() => contribution.build(createSettingsForm(rows, formDeps)))
        const before = place.before === undefined ? [] : typeof place.before === 'string' ? [place.before] : place.before
        const target = before.map((id) => [...s.panel.children].find((child) => (child as HTMLElement).dataset.row === id)).find((found) => found !== undefined) ?? null
        s.panel.insertBefore(rows, target)
      }
    } else if (entry.contribution) {
      const contribution = entry.contribution
      guarded(() => contribution.build(createSettingsForm(s.panel, formDeps)))
    }
    if (focused) [...s.panel.querySelectorAll<HTMLElement>('[data-qc-key]')].find((control) => control.dataset.qcKey === focused)?.focus({ preventScroll: true })
  }

  /** The rail, built once a session: one tab per page, each wearing its icon and its name. */
  const buildNav = (s: Session): void => {
    s.nav.replaceChildren()
    s.nav.setAttribute('aria-label', t()('settings.menu'))
    s.pages.forEach((page, index) => {
      const icon = el('span', { class: 'qc-chart-settings-nav-icon', 'aria-hidden': 'true' })
      if (page.chart) icon.appendChild(deps.icons.glyph(PAGE_ICONS[page.chart], { size: 28 }))
      else if (page.contribution && 'page' in page.contribution.place) {
        const paint = page.contribution.place.page.icon
        const dispose = guarded(() => paint(icon))
        if (dispose) s.disposers.push(dispose)
      }
      const tab = el(
        'button',
        { type: 'button', id: tabId(page.id), class: 'qc-chart-settings-nav-item', role: 'tab', 'aria-controls': panelId, 'data-settings-page': page.id },
        icon,
        el('span', { class: 'qc-chart-settings-nav-label', text: page.label() }),
      )
      tab.addEventListener('click', () => show(s, page.id))
      tab.addEventListener('keydown', (event) => {
        let next = index
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % s.pages.length
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + s.pages.length) % s.pages.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = s.pages.length - 1
        else return
        event.preventDefault()
        show(s, s.pages[next]!.id)
        ;(s.nav.children[next] as HTMLElement | undefined)?.focus()
      })
      s.nav.appendChild(tab)
    })
    markNav(s)
    // The page stands at least as tall as the rail's tabs, so a short page never squeezes the rail.
    s.panel.style.minHeight = `${8 + s.pages.length * 40}px`
  }

  const markNav = (s: Session): void => {
    for (const tab of s.nav.querySelectorAll<HTMLElement>('.qc-chart-settings-nav-item')) {
      const selected = tab.dataset.settingsPage === s.page
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
    }
  }

  /** Stand the dialog on screen for the page it shows: centred when it first opens, then holding its
   *  top edge, raised only as far as a taller page needs to stay clear of the viewport's foot. A
   *  dialog a host's stylesheet spreads across the whole window stands where that stylesheet puts it. */
  const place = (s: Session): void => {
    const box = s.dialog.box
    const height = box.offsetHeight
    const width = box.offsetWidth
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    if (width >= viewport.width) {
      for (const property of ['position', 'left', 'top'] as const) box.style.removeProperty(property)
      return
    }
    let left: number
    let top: number
    if (!s.placed) {
      left = (viewport.width - width) / 2
      top = (viewport.height - height) / 2
      s.placed = true
    } else {
      const rect = box.getBoundingClientRect()
      left = rect.left
      top = rect.top
      if (top + height > viewport.height - EDGE) top = Math.max(EDGE, viewport.height - EDGE - height)
    }
    box.style.position = 'fixed'
    box.style.left = `${Math.round(left)}px`
    box.style.top = `${Math.round(top)}px`
  }

  const show = (s: Session, page: string): void => {
    if (!s.pages.some((entry) => entry.id === page)) return
    s.closeMenu?.()
    s.page = page
    markNav(s)
    s.panel.scrollTop = 0
    render(s)
    place(s)
  }

  /** The session is over: what it opened over the dialog closes, its listeners and its reads in
   *  flight stop, and the dialog reads as closed while its exit motion plays. */
  const end = (s: Session): void => {
    s.closeMenu?.()
    s.abort.abort()
    for (const dispose of s.disposers.splice(0)) guarded(dispose)
    if (session === s) {
      session = null
      tell(false)
    }
  }

  /** Put back what the session captured on opening: the viewer's settings, the scale mode, the
   *  timezone, and every contribution's state. */
  const restore = (s: Session): void => {
    const chart = s.chart
    if (written(viewerSettings(chart)) !== written(s.initial.settings)) {
      chart.resetSettings()
      if (holdsLeaves(s.initial.settings)) chart.applySettings(s.initial.settings)
    }
    if (chart.scaleMode() !== s.initial.scale) chart.setScaleMode(s.initial.scale)
    if (chart.timezone() !== s.initial.timezone) chart.setTimezone(s.initial.timezone)
    s.contributions.forEach((contribution, index) => guarded(() => contribution.cancel?.(s.states[index])))
  }

  const cancel = (s: Session): void => {
    if (s.settled) return
    s.settled = true
    end(s)
    restore(s)
    s.dialog.close()
  }

  const ok = (s: Session): void => {
    if (s.settled) return
    s.settled = true
    end(s)
    for (const contribution of s.contributions) guarded(() => contribution.commit?.())
    s.dialog.close()
  }

  /** The saved templates, read again from the store. */
  const listTemplates = (s: Session): void => {
    if (!deps.templates) return
    deps.templates
      .list(s.abort.signal)
      .then((rows) => {
        if (session === s) s.saved = rows
      })
      .catch(() => undefined)
  }

  /** Apply the chart's defaults: the viewer's settings dropped, and every contribution's own. */
  const applyDefaults = (s: Session): void => {
    run('chart.settings.reset')
    for (const contribution of s.contributions) guarded(() => contribution.applyDefaults?.())
    render(s)
  }

  /** Apply a saved template: the viewer's settings become the template's, the scale mode kept. */
  const applyTemplate = (s: Session, row: ChartTemplateRow): void => {
    deps.templates
      ?.load(row.ref.id, s.abort.signal)
      .then((settings) => {
        if (session !== s || s.settled || !settings) return
        const scale = s.chart.scaleMode()
        run('chart.settings.reset')
        if (holdsLeaves(settings)) run('chart.settings.apply', { settings })
        if (s.chart.scaleMode() !== scale) run(`chart.scale.${scale}`)
        render(s)
      })
      .catch(() => undefined)
  }

  const saveTemplate = (s: Session): void => {
    const store = deps.templates
    if (!store) return
    openNameDialog({
      host: deps.overlays,
      t: t(),
      icons: deps.icons,
      title: t()('settings.saveTemplate'),
      label: t()('drawing.templateName'),
      verb: t()('drawing.save'),
      role: 'chart-template-name',
      commit: (name) => {
        store
          .save(name, viewerSettings(s.chart), s.abort.signal)
          .then(() => listTemplates(s))
          .catch(() => undefined)
        return true
      },
    })
  }

  const removeTemplate = (s: Session, row: ChartTemplateRow): void => {
    const store = deps.templates
    if (!store) return
    openConfirmDialog({
      host: deps.overlays,
      t: t(),
      icons: deps.icons,
      title: t()('drawing.deleteTemplateTitle'),
      body: t()('settings.deleteTemplateBody', { name: row.name }),
      verb: t()('drawing.delete'),
      destructive: true,
      role: 'chart-template-delete',
      confirm: () => {
        store
          .remove(row.ref, s.abort.signal)
          .then(() => listTemplates(s))
          .catch(() => undefined)
      },
    })
  }

  /** The Template menu: Apply defaults and Save as, then the saved templates, each with its delete.
   *  It drops below its button and turns over above it only where the viewport has no room below. */
  const openTemplateMenu = (s: Session): void => {
    if (s.closeMenu) {
      s.closeMenu()
      return
    }
    const menu = el('div', { class: 'qc-drawing-menu qc-drawing-list qc-drawing-template-menu qc-chart-settings-template-menu', role: 'menu', 'aria-label': t()('drawing.template') })
    const rowOf = (text: string, enabled: boolean, onPick: () => void): HTMLButtonElement => {
      const row = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-list-row', role: 'menuitem' }, el('span', { class: 'qc-menu-label', text })) as HTMLButtonElement
      row.disabled = !enabled
      row.addEventListener('click', () => {
        s.closeMenu?.()
        onPick()
      })
      return row
    }
    const defaults = rowOf(t()('command.settingsReset'), deps.commands.available('chart.settings.reset'), () => applyDefaults(s))
    defaults.hidden = !shows(deps, 'chart.settings.reset')
    menu.appendChild(defaults)
    if (deps.templates) menu.appendChild(rowOf(t()('drawing.saveAs'), true, () => saveTemplate(s)))
    if (s.saved.length) menu.appendChild(el('div', { class: 'qc-separator', role: 'separator' }))
    for (const saved of s.saved) {
      const row = el('div', { class: 'qc-drawing-flyout-row' })
      row.append(
        rowOf(saved.name, deps.commands.available('chart.settings.apply'), () => applyTemplate(s, saved)),
        button({
          class: 'qc-drawing-star',
          label: t()('drawing.removeTemplateNamed', { name: saved.name }),
          title: t()('drawing.remove'),
          icon: deps.icons.icon('trash', 18),
          onClick: () => {
            s.closeMenu?.()
            removeTemplate(s, saved)
          },
        }),
      )
      menu.appendChild(row)
    }
    for (const child of [...menu.children]) if ((child as HTMLElement).hidden) child.remove()
    tidyRules(menu, (child) => !child.hidden)
    const unkeys = menuKeys(menu, () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    const close = openPopover(
      s.dialog.layer,
      s.template,
      menu,
      'below',
      () => {
        unkeys()
        s.closeMenu = null
      },
      s.template,
      () => reopenPopover(close, menu, () => s.template),
      { gap: 0, className: 'qc-drawing-popover--list' },
    )
    s.closeMenu = close
    focusFirst(menu)
  }

  const open = (page?: string): boolean => {
    if (session) {
      if (page) show(session, page)
      return true
    }
    const chart = activeChart(deps)
    const contributions = settingsContributionsOf(chart.id)
    const states = contributions.map((contribution) => guarded(() => contribution.open?.()))
    const initial = { settings: viewerSettings(chart), scale: chart.scaleMode(), timezone: chart.timezone() }
    let s: Session | null = null
    const dialog = openDialog({
      container: deps.overlays,
      title: t()('settings.menu'),
      heading: t()('drawing.settings'),
      closeLabel: t()('layouts.close'),
      icons: deps.icons,
      role: 'chart-settings',
      width: 750,
      veil: false,
      passThrough: true,
      // Escape, the close and the host's teardown end the session as the dialog begins to close.
      onClosing: () => {
        if (s && !s.settled) cancel(s)
      },
      onClose: () => {
        if (s && !s.settled) cancel(s)
      },
    })
    dialog.box.classList.add('qc-chart-settings-dialog')
    dialog.body.classList.add('qc-chart-settings-body')
    dialog.footer.classList.add('qc-chart-settings-footer')
    const nav = el('div', { class: 'qc-chart-settings-nav', role: 'tablist', 'aria-orientation': 'vertical' })
    const panel = el('section', { id: panelId, class: 'qc-chart-settings-panel qc-drawing-page', role: 'tabpanel', tabindex: '0' })
    dialog.body.append(nav, panel)
    const template = el(
      'button',
      { type: 'button', class: 'qc-field qc-drawing-template-button', 'aria-label': t()('drawing.template'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      el('span', { class: 'qc-drawing-select-value', text: t()('drawing.template') }),
      selectChevron(deps.icons),
    ) as HTMLButtonElement
    const cancelButton = button({ class: 'qc-button qc-drawing-footer-button qc-drawing-cancel', label: t()('drawing.cancel'), text: t()('drawing.cancel'), onClick: () => s && cancel(s) })
    const okButton = button({ class: 'qc-button qc-button--primary qc-drawing-footer-button', label: t()('drawing.ok'), text: t()('drawing.ok'), onClick: () => s && ok(s) })
    dialog.footer.append(template, el('span', { class: 'qc-drawing-footer-gap' }), cancelButton, okButton)

    const pages = pagesOf(contributions)
    s = {
      chart,
      dialog,
      nav,
      panel,
      template,
      cancel: cancelButton,
      ok: okButton,
      pages,
      page: page && pages.some((entry) => entry.id === page) ? page : pages[0]!.id,
      contributions,
      states,
      initial,
      settled: false,
      placed: false,
      disposers: [],
      abort: new AbortController(),
      saved: [],
      closeMenu: null,
    }
    const current = s
    session = current
    template.addEventListener('click', () => openTemplateMenu(current))
    // The chart's own changes (a style, a market, an indicator, the theme) change what its pages
    // show; another chart becoming active ends the session, as Cancel does.
    const redraw = (): void => {
      if (!current.settled) render(current)
    }
    current.disposers.push(
      chart.on('style', redraw),
      chart.on('symbol', redraw),
      chart.on('timeframe', redraw),
      chart.on('indicator', redraw),
      deps.widget.on('theme', redraw),
      deps.widget.on('activeChart', (next) => {
        if (next !== chart) cancel(current)
      }),
    )
    buildNav(current)
    render(current)
    place(current)
    listTemplates(current)
    nav.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true })
    tell(true)
    return true
  }

  return {
    open,
    toggle() {
      if (session) cancel(session)
      else open()
    },
    isOpen: () => session !== null,
    onToggle(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sync() {
      const s = session
      if (!s) return
      s.dialog.heading.textContent = t()('drawing.settings')
      s.dialog.box.setAttribute('aria-label', t()('settings.menu'))
      for (const tab of s.nav.querySelectorAll<HTMLElement>('.qc-chart-settings-nav-item')) {
        const entry = s.pages.find((page) => page.id === tab.dataset.settingsPage)
        const label = tab.querySelector('.qc-chart-settings-nav-label')
        if (entry && label) label.textContent = entry.label()
      }
      s.nav.setAttribute('aria-label', t()('settings.menu'))
      s.template.setAttribute('aria-label', t()('drawing.template'))
      s.template.querySelector('.qc-drawing-select-value')!.textContent = t()('drawing.template')
      for (const [b, key] of [[s.cancel, 'drawing.cancel'], [s.ok, 'drawing.ok']] as const) {
        b.textContent = t()(key)
        b.setAttribute('aria-label', t()(key))
        b.title = t()(key)
      }
      render(s)
    },
    destroy() {
      if (session) cancel(session)
      listeners.clear()
    },
  }
}
