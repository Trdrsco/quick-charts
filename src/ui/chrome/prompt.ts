// The two questions a surface stops to ask, in one box: what to call a thing, and whether to go
// through with something that cannot be undone. Both stand on the same margin with the same title,
// the same corner close and the same two answers at the end of the row; only the middle differs, a
// labelled field or the line that says what happens.
//
// Five questions ask a name: a layout that has never been saved, a copy of the open one, the open
// one under a new name, a new layout, and a drawing template. Two confirm: deleting a layout and
// deleting a drawing template. None of them builds its own box.
import type { ChartTranslate } from '../../i18n'
import { openDialog, type DialogHandle } from './dialog'
import { append, button, h, setDisabled } from './dom'
import { ICONS } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'

/** The longest name a thing is given here. */
const NAME_MAX = 64

interface PromptShell {
  host: HTMLElement
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  title: string
  /** A stable `data-role` a host test finds the dialog by. */
  role: string
}

/** The box, its close and its title: everything a prompt has before it says its own piece. */
function promptHead(t: ChartTranslate, icons: IconResolver, title: string, close: () => void): HTMLElement[] {
  return [
    button({ label: t('layouts.close'), icon: icons.glyph(ICONS.dialogClose, { size: 18 }), className: 'qc-dialog-close qc-prompt-close', onClick: close }),
    h('div', { class: 'qc-prompt-title' }, title),
  ]
}

export interface NameDialogOptions extends Partial<PromptShell> {
  host: HTMLElement
  t: ChartTranslate
  icons: IconResolver
  title: string
  label: string
  /** What the field opens holding, selected so that typing replaces it. */
  value?: string
  placeholder?: string
  /** The verb, written on the button that commits. */
  verb: string
  /** Write under the name. True closes the dialog; false leaves it up with the name as typed, for a
   *  write the command refused. */
  commit(name: string): boolean
}

export function openNameDialog(options: NameDialogOptions): DialogHandle {
  const t = options.t
  return openDialog({
    host: options.host,
    label: options.title,
    className: 'qc-prompt',
    role: options.role ?? 'layout-name',
    width: 480,
    build(box, dialog) {
      const field = h('input', {
        type: 'text',
        class: 'qc-name-input',
        maxlength: String(NAME_MAX),
        autocomplete: 'off',
        spellcheck: 'false',
        value: options.value ?? '',
        ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      })
      const verb = button({ label: options.verb, text: options.verb, className: 'qc-button--primary', onClick: () => submit() })
      const submit = (): void => {
        const name = field.value.trim()
        if (!name) return
        if (options.commit(name)) dialog.close()
      }
      const sync = (): void => setDisabled(verb, field.value.trim() === '')
      field.addEventListener('input', sync)
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        submit()
      })
      sync()
      append(
        box,
        ...promptHead(t, options.icons, options.title, () => dialog.close()),
        h('label', { class: 'qc-name-field' }, h('span', { class: 'qc-name-label' }, options.label), h('span', { class: 'qc-name-box' }, field)),
        h('div', { class: 'qc-prompt-actions' }, button({ label: t('layouts.cancel'), text: t('layouts.cancel'), className: 'qc-button--secondary', onClick: () => dialog.close() }), verb),
      )
    },
    initialFocus: (box) => {
      const field = box.querySelector<HTMLInputElement>('.qc-name-input')
      field?.select()
      return field
    },
  })
}

export interface ConfirmDialogOptions extends Partial<PromptShell> {
  host: HTMLElement
  t: ChartTranslate
  icons: IconResolver
  title: string
  /** The line that says what happens, in the reading size. */
  body: string
  /** The verb, written on the button that goes through with it. */
  verb: string
  /** The verb ends something. Its button wears the negative fill and takes the keyboard on open, so
   *  the answer a hand is most likely to want is the one already under it. */
  destructive?: boolean
  /** Whether the verb can be used at all: a command the host has withdrawn stands disabled. */
  enabled?: boolean
  confirm(): void
}

export function openConfirmDialog(options: ConfirmDialogOptions): DialogHandle {
  const t = options.t
  return openDialog({
    host: options.host,
    label: options.title,
    className: 'qc-prompt',
    role: options.role ?? 'confirm',
    // A question that must be answered before anything else can happen is an alert to a reader.
    ariaRole: 'alertdialog',
    width: 480,
    build(box, dialog) {
      const go = button({
        label: options.verb,
        text: options.verb,
        className: options.destructive ? 'qc-button--primary qc-button--danger' : 'qc-button--primary',
        onClick: () => {
          options.confirm()
          dialog.close()
        },
      })
      if (options.enabled === false) setDisabled(go, true)
      append(
        box,
        ...promptHead(t, options.icons, options.title, () => dialog.close()),
        h('p', { class: 'qc-prompt-copy' }, options.body),
        h('div', { class: 'qc-prompt-actions' }, button({ label: t('layouts.cancel'), text: t('layouts.cancel'), className: 'qc-button--secondary', onClick: () => dialog.close() }), go),
      )
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-prompt-actions .qc-button--primary'),
  })
}
