// The two template dialogs: naming a template to save, and confirming a delete. The name prompt
// is the one dialog every save entry point opens (the settings bar's menu and the settings
// dialog's footer), so saving over an existing name replaces it wherever the save came from. A
// delete confirms and names what dies, because a single hover-click must never destroy a named
// thing.
import type { ChartTranslate } from '../../i18n'
import { openConfirmDialog, openNameDialog } from '../chrome/prompt'
import type { IconResolver } from '../icons/resolver'

export interface TemplateDialogDeps {
  container: HTMLElement
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
}

/** Ask for a template name, in the one dialog every name is asked in. */
export function openTemplateNameDialog(deps: TemplateDialogDeps, onSave: (name: string) => void): () => void {
  const { t } = deps
  const dialog = openNameDialog({
    host: deps.container,
    t,
    icons: deps.icons,
    title: t('drawing.saveTemplate'),
    label: t('drawing.templateName'),
    verb: t('drawing.save'),
    role: 'drawing-template-name',
    commit: (name) => {
      onSave(name)
      return true
    },
  })
  return dialog.close
}

/** Confirm a delete, naming the template, in the one box a question is asked in. */
export function openTemplateDeleteDialog(deps: TemplateDialogDeps, name: string, onDelete: () => void): () => void {
  const { t } = deps
  const dialog = openConfirmDialog({
    host: deps.container,
    t,
    icons: deps.icons,
    title: t('drawing.deleteTemplateTitle'),
    body: t('drawing.deleteTemplateBody', { name }),
    verb: t('drawing.delete'),
    destructive: true,
    role: 'drawing-template-delete',
    confirm: onDelete,
  })
  return dialog.close
}
