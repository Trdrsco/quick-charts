// The Image tool's dialog, opened by arming the tool rather than after placing something: the
// picture is chosen first and then dropped onto the chart. One dashed zone is both the click
// target and the drop target, the format and size limits are stated inside it before a file is
// chosen, a transparency slider sits beneath, and Ok stays disabled until there is a picture.
//
// The bytes are the host's: the file goes through the asset port's `intakeImage`, which owns the
// decode and the resample, and a refusal comes back as a code this dialog resolves through the
// chart's own catalog.
import { IMAGE_ACCEPT, IMAGE_ERROR_MESSAGES, type DrawingAssetPort, type ImageIntakeResult } from '../../drawings/index'
import type { ChartTranslate } from '../../i18n'
import type { PlacedImage } from '../../drawings'
import { openDialog } from './dialog'
import { button, el } from './dom'
import { opacitySlider } from './fields'

export interface ImagePickerDeps {
  container: HTMLElement
  t: ChartTranslate
  assets: DrawingAssetPort
  onConfirm(image: PlacedImage): void
  onClose?(): void
}

/** Whole megabytes over a megabyte, otherwise kilobytes: the size a refusal quotes. */
export function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}

/** The first usable image among dropped or pasted items: picking the first IMAGE rather than the
 *  first item is the difference between a drop that works and one that silently does nothing. */
export function firstImageFile(list: FileList | readonly File[] | null | undefined): File | null {
  if (!list) return null
  for (const file of Array.from(list as ArrayLike<File>)) if (file && file.type.startsWith('image/')) return file
  return null
}

export function openImagePicker(deps: ImagePickerDeps): () => void {
  const { t } = deps
  // A paste lands here while the dialog is open, so pasting works on the picker and not only the chart.
  const onPaste = (e: ClipboardEvent): void => {
    const pasted = firstImageFile(e.clipboardData?.files)
    if (!pasted) return
    e.preventDefault()
    void take(pasted)
  }
  document.addEventListener('paste', onPaste)
  const dialog = openDialog({
    container: deps.container,
    title: t('drawing.image'),
    closeLabel: t('drawing.close'),
    role: 'drawing-image-picker',
    width: 420,
    onClose: () => {
      document.removeEventListener('paste', onPaste)
      deps.onClose?.()
    },
  })
  let picked: { dataUrl: string; width: number; height: number } | null = null
  let opacity = 1
  let busy = false

  const zone = button({ class: 'qc-drawing-drop', label: t('drawing.chooseImage') })
  const preview = el('img', { class: 'qc-drawing-drop-preview', alt: '' }) as HTMLImageElement
  preview.hidden = true
  const words = el(
    'span',
    { class: 'qc-drawing-drop-words' },
    el('span', { class: 'qc-drawing-drop-title', text: t('drawing.chooseImage') }),
    el('span', { class: 'qc-secondary', text: t('drawing.imageFormats') }),
    el('span', { class: 'qc-secondary', text: t('drawing.imageMaxSize') }),
  )
  zone.append(preview, words)
  const file = el('input', { type: 'file', accept: IMAGE_ACCEPT, class: 'qc-drawing-file' }) as HTMLInputElement
  file.hidden = true
  const error = el('div', { class: 'qc-negative qc-drawing-note' })
  error.hidden = true
  const dims = el('div', { class: 'qc-secondary qc-drawing-note' })
  dims.hidden = true
  const ok = button({ class: 'qc-button qc-button--primary', label: t('drawing.ok'), text: t('drawing.ok'), disabled: true })

  const render = (): void => {
    const title = words.firstElementChild as HTMLElement
    title.textContent = busy ? t('drawing.imageReading') : t('drawing.chooseImage')
    preview.hidden = !picked
    words.hidden = !!picked
    if (picked) {
      preview.src = picked.dataUrl
      preview.style.opacity = String(opacity)
      dims.textContent = t('drawing.imageDimensions', { width: picked.width, height: picked.height })
    }
    dims.hidden = !picked || !error.hidden
    ok.disabled = !picked || busy
  }

  const take = async (chosen: File | null): Promise<void> => {
    if (!chosen) return
    busy = true
    error.hidden = true
    render()
    let result: ImageIntakeResult
    try {
      result = await deps.assets.intakeImage(chosen)
    } catch {
      result = { ok: false, error: 'unreadable' }
    }
    busy = false
    if (!result.ok) {
      error.textContent = t(IMAGE_ERROR_MESSAGES[result.error], { size: result.bytes === undefined ? '' : humanSize(result.bytes) })
      error.hidden = false
      render()
      return
    }
    picked = { dataUrl: result.asset.dataUrl, width: result.asset.width, height: result.asset.height }
    render()
  }

  zone.addEventListener('click', () => file.click())
  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.dataset.qcActive = 'true'
  })
  zone.addEventListener('dragleave', () => {
    zone.dataset.qcActive = 'false'
  })
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.dataset.qcActive = 'false'
    void take(firstImageFile(e.dataTransfer?.files))
  })
  file.addEventListener('change', () => {
    void take(file.files?.[0] ?? null)
    file.value = '' // so picking the same file twice still fires a change
  })
  ok.addEventListener('click', () => {
    if (!picked || busy) return
    deps.onConfirm({ ...picked, opacity })
    dialog.close()
  })

  dialog.body.append(
    zone,
    file,
    error,
    dims,
    el('div', { class: 'qc-drawing-row' }, el('span', { class: 'qc-secondary qc-drawing-row-label', text: t('drawing.transparency') }), opacitySlider(t, SWATCH_TRACK, opacity, (v) => {
      opacity = v
      render()
    })),
  )
  dialog.footer.append(button({ class: 'qc-button', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: () => dialog.close() }), ok)
  render()
  zone.focus({ preventScroll: true })
  return dialog.close
}

/** The neutral track the transparency slider fades into: not a drawing's own color, so the
 *  stylesheet's muted ink stands in through the custom property the slider sets. */
const SWATCH_TRACK = 'currentColor'
