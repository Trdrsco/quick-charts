// The two template dialogs: naming a template to save, and confirming a delete. The name prompt
// is the one dialog every save entry point opens (the settings bar's menu and the settings
// dialog's footer), so saving over an existing name replaces it wherever the save came from. A
// delete confirms and names what dies, because a single hover-click must never destroy a named
// thing.
import type { ChartTranslate } from '../../i18n'
import { openDialog } from './dialog'
import { button, el } from './dom'

export interface TemplateDialogDeps {
  container: HTMLElement
  t: ChartTranslate
}

/** Ask for a template name. Save stays disabled until a name exists; Enter saves. */
export function openTemplateNameDialog(deps: TemplateDialogDeps, onSave: (name: string) => void): () => void {
  const { t } = deps
  const dialog = openDialog({ container: deps.container, title: t('drawing.saveTemplate'), closeLabel: t('drawing.close'), role: 'drawing-template-name', width: 380 })
  const input = el('input', { class: 'qc-field qc-drawing-input', 'aria-label': t('drawing.templateName'), maxlength: '64' }) as HTMLInputElement
  const save = button({ class: 'qc-button qc-button--primary', label: t('drawing.save'), text: t('drawing.save'), disabled: true })
  const submit = (): void => {
    const name = input.value.trim()
    if (!name) return
    onSave(name)
    dialog.close()
  }
  input.addEventListener('input', () => {
    save.disabled = !input.value.trim()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') dialog.close()
  })
  save.addEventListener('click', submit)
  dialog.body.append(el('label', { class: 'qc-muted qc-drawing-field-label', text: t('drawing.templateName') }), input)
  dialog.footer.append(button({ class: 'qc-button', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: () => dialog.close() }), save)
  input.focus({ preventScroll: true })
  return dialog.close
}

/** Confirm a delete, naming the template. */
export function openTemplateDeleteDialog(deps: TemplateDialogDeps, name: string, onDelete: () => void): () => void {
  const { t } = deps
  const dialog = openDialog({ container: deps.container, title: t('drawing.deleteTemplateTitle'), closeLabel: t('drawing.close'), role: 'drawing-template-delete', width: 380 })
  dialog.body.append(el('p', { class: 'qc-secondary qc-drawing-dialog-copy', text: t('drawing.deleteTemplateBody', { name }) }))
  const remove = button({
    class: 'qc-button qc-button--primary qc-drawing-danger',
    label: t('drawing.delete'),
    text: t('drawing.delete'),
    onClick: () => {
      onDelete()
      dialog.close()
    },
  })
  dialog.footer.append(button({ class: 'qc-button', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: () => dialog.close() }), remove)
  remove.focus({ preventScroll: true })
  return dialog.close
}
