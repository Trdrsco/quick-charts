// The in-place editor for a text-bearing drawing: typing happens at the drawing's own text
// position, in its own text style, and the box grows with the content, so committing swaps pixels
// with the painted text. Enter inserts a newline; Ctrl or Cmd with Enter, a press on the chart, or
// leaving the field commits; Escape cancels, which removes a drawing that was placed for this text
// and had none yet.
//
// The editor mounts in the chrome subtree over the pane. A press on the chart commits BEFORE the
// drawing layer sees it, because the renderer prevents the default of that press and the field
// would otherwise never blur.
import type { ChartTranslate } from '../../i18n'
import type { TextEditSession } from '../../drawings'
import { el } from './dom'

/** The editor's line height and the family it types in, matched to the drawing renderer's text. */
const LINE_HEIGHT = 1.35
const FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif'

let measurer: CanvasRenderingContext2D | null | undefined

/** The box that holds the text, or the placeholder when there is none, so a language whose word
 *  for it is longer gets a box that fits it. */
function measure(value: string, font: string, fontSize: number, placeholder: string): { width: number; height: number } {
  if (measurer === undefined) measurer = document.createElement('canvas').getContext('2d')
  const lines = value.length > 0 ? value.split('\n') : [placeholder]
  let width = 0
  if (measurer) {
    measurer.font = font
    for (const line of lines) width = Math.max(width, measurer.measureText(line).width)
  } else {
    for (const line of lines) width = Math.max(width, line.length * fontSize * 0.6)
  }
  return { width: Math.max(width, fontSize), height: lines.length * Math.round(fontSize * LINE_HEIGHT) }
}

export interface TextEditorDeps {
  /** The chrome subtree the editor mounts into. */
  container: HTMLElement
  /** The gesture box, whose press commits the edit. */
  gestures: HTMLElement
  t: ChartTranslate
  onCommit(value: string): void
  onCancel(): void
}

export interface TextEditorHandle {
  destroy(): void
}

export function mountTextEditor(session: TextEditSession, deps: TextEditorDeps): TextEditorHandle {
  const font = `${session.italic ? 'italic ' : ''}${session.bold ? '600 ' : ''}${session.fontSize}px ${FONT_FAMILY}`
  const placeholder = deps.t('drawing.textPlaceholder')
  const area = el('textarea', { class: 'qc-drawing-text-editor', 'aria-label': deps.t('drawing.textEditor'), rows: '1', spellcheck: 'false', wrap: 'off', placeholder }) as HTMLTextAreaElement
  area.value = session.value
  area.style.left = `${session.x}px`
  area.style.top = `${session.y}px`
  area.style.transform = `translate(-50%, -50%) rotate(${session.angle}rad)`
  area.style.font = font
  area.style.lineHeight = `${Math.round(session.fontSize * LINE_HEIGHT)}px`
  area.style.color = session.color
  area.style.caretColor = session.color

  const size = (): void => {
    const { width, height } = measure(area.value, font, session.fontSize, placeholder)
    area.style.width = `${width + 12}px`
    area.style.height = `${height + 6}px`
  }
  size()

  let done = false
  const finish = (how: 'commit' | 'cancel'): void => {
    if (done) return
    done = true
    destroy()
    if (how === 'commit') deps.onCommit(area.value)
    else deps.onCancel()
  }

  area.addEventListener('input', size)
  area.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      finish('cancel')
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      finish('commit')
    }
  })
  area.addEventListener('blur', () => finish('commit'))
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'mousedown'] as const) area.addEventListener(type, (e) => e.stopPropagation())
  // A press on the chart commits before the drawing layer handles the press, in the capture phase.
  const onChartPress = (): void => finish('commit')
  deps.gestures.addEventListener('pointerdown', onChartPress, true)

  const destroy = (): void => {
    deps.gestures.removeEventListener('pointerdown', onChartPress, true)
    area.remove()
  }

  deps.container.appendChild(area)
  area.focus({ preventScroll: true })
  area.select()
  return {
    destroy() {
      done = true
      destroy()
    },
  }
}
