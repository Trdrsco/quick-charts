// The editor for a text-bearing drawing's words, in two forms.
//
// A drawing that types its words on the chart (its session carries `inline`) paints them itself as
// they are typed: the words, the placeholder, the caret and the selection's wash all stand on the
// canvas. The editor is then a field nobody sees, laid exactly over those words in their own type
// and line height, so the browser's caret moves, its selection, its input method popups and the
// accessibility tree all land on the painted words. It reports what it holds on every change and
// follows the words wherever a repaint stands them. Enter and Shift+Enter break the line; Escape,
// Ctrl or Cmd with Enter, a press on the chart and the field losing the focus within the page all
// commit, the words exactly as typed. The caret is lit for half a second and dark for half, and
// holds still where the viewer asks for reduced motion.
//
// Any other drawing types in a box of its own at its text position, in its own text style, the box
// growing with the content. Enter inserts a newline; Ctrl or Cmd with Enter, a press on the chart,
// or leaving the field commits; Escape cancels, which removes a drawing placed for this text that
// had none yet.
//
// Both mount in the chrome subtree over the pane. A press on the chart commits BEFORE the drawing
// layer sees it, because the renderer prevents the default of that press and the field would
// otherwise never blur. Neither lets a key reach the chart.
import type { ChartTranslate } from '../../i18n'
import type { TextEditFrame, TextEditSession, TextInlineEdit } from '../../drawings'
import { el } from './dom'

/** The box editor's line height, matched to the drawing renderer's text. */
const LINE_HEIGHT = 1.35

/** The inline field's padding: the words stand this far inside it. */
const FIELD_PAD = 2
/** How long the caret stays lit, and then dark. */
export const CARET_BLINK_MS = 500

let measurer: CanvasRenderingContext2D | null | undefined

/** How wide a line reads in a CSS font, or null without a rendering context to ask. */
function widthOf(line: string, font: string): number | null {
  if (measurer === undefined) measurer = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measurer) return null
  measurer.font = font
  return measurer.measureText(line).width
}

/** The box that holds the text, or the placeholder when there is none, so a language whose word
 *  for it is longer gets a box that fits it. */
function measure(value: string, font: string, fontSize: number, placeholder: string): { width: number; height: number } {
  const lines = value.length > 0 ? value.split('\n') : [placeholder]
  let width = 0
  for (const line of lines) width = Math.max(width, widthOf(line, font) ?? line.length * fontSize * 0.6)
  return { width: Math.max(width, fontSize), height: lines.length * Math.round(fontSize * LINE_HEIGHT) }
}

/** A CSS font's size in pixels. */
const fontPx = (font: string): number => Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 14)

export interface TextEditorDeps {
  /** The chrome subtree the editor mounts into. */
  container: HTMLElement
  /** The gesture box, whose press commits the edit. */
  gestures: HTMLElement
  t: ChartTranslate
  /** The family the box editor types in: the theme's `text.fontFamily`. An inline field types in
   *  the font its drawing paints with. */
  fontFamily: string
  onCommit(value: string): void
  onCancel(): void
}

export interface TextEditorHandle {
  destroy(): void
}

export function mountTextEditor(session: TextEditSession, deps: TextEditorDeps): TextEditorHandle {
  return session.inline ? mountInlineEditor(session, session.inline, deps) : mountBoxEditor(session, deps)
}

/** Whether the viewer asks for reduced motion, so the caret holds still. */
const stillCaret = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Whether the page holds the focus; a page that cannot say is taken to. */
const pageFocused = (): boolean => typeof document.hasFocus !== 'function' || document.hasFocus()

function mountInlineEditor(session: TextEditSession, inline: TextInlineEdit, deps: TextEditorDeps): TextEditorHandle {
  const area = el('textarea', {
    class: 'qc-drawing-text-editor',
    'data-qc-editor': 'inline',
    'aria-label': deps.t('drawing.textEditor'),
    placeholder: deps.t('drawing.addText'),
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    dir: 'ltr',
    rows: '1',
    wrap: 'off',
  }) as HTMLTextAreaElement
  area.value = session.value
  let done = false

  // ── Laid over the words ───────────────────────────────────────────────────────────────────────
  let frame: TextEditFrame | null = inline.frame()
  /** Lay the field over the words: its content box on the words' block, and a font size of room
   *  past the widest line, so the caret after it never scrolls the field. */
  const lay = (): void => {
    const f = frame
    if (!f) {
      area.style.left = `${session.x}px`
      area.style.top = `${session.y}px`
      return
    }
    const wraps = f.wrapWidth !== null
    const lines = area.value.split('\n')
    const typed = wraps ? f.lines : Math.max(f.lines, lines.length)
    const widest = wraps ? 0 : Math.max(0, ...lines.map((line) => widthOf(line, f.font) ?? 0))
    const content = wraps ? (f.wrapWidth as number) : Math.max(f.width, widest)
    const room = wraps ? 0 : Math.ceil(fontPx(f.font))
    const before = f.align === 'center' ? room / 2 : f.align === 'right' ? room : 0
    area.style.font = f.font
    area.style.lineHeight = `${f.lineHeight}px`
    area.style.textAlign = f.align
    area.style.whiteSpace = wraps ? 'pre-wrap' : 'pre'
    area.wrap = wraps ? 'soft' : 'off'
    area.style.left = `${f.x - FIELD_PAD - before}px`
    area.style.top = `${f.y - FIELD_PAD}px`
    area.style.width = `${content + room + FIELD_PAD * 2}px`
    area.style.height = `${typed * f.lineHeight + FIELD_PAD * 2}px`
    area.style.transform = f.angle ? `rotate(${f.angle}rad)` : ''
    area.style.transformOrigin = `${FIELD_PAD + before}px ${FIELD_PAD}px`
    area.scrollLeft = 0
    area.scrollTop = 0
  }
  lay()
  const stopFollowing = inline.onFrame((next) => {
    if (!next) return
    frame = next
    lay()
  })

  // ── What the field holds, shown on the chart ──────────────────────────────────────────────────
  let lit = true
  let composingFrom: number | null = null
  let composingText = ''
  const report = (): void => {
    if (done) return
    inline.update({
      value: area.value,
      selectionStart: area.selectionStart,
      selectionEnd: area.selectionEnd,
      composition: composingFrom === null ? null : { start: composingFrom, end: composingFrom + composingText.length },
      caret: lit && document.activeElement === area && pageFocused(),
    })
  }
  let blink: ReturnType<typeof setInterval> | null = null
  /** Light the caret and start its blink over, as a field's own caret does on every change. */
  const relight = (): void => {
    lit = true
    if (blink !== null) clearInterval(blink)
    blink = stillCaret()
      ? null
      : setInterval(() => {
          lit = !lit
          report()
        }, CARET_BLINK_MS)
  }
  const changedHere = (): void => {
    relight()
    report()
  }

  const finish = (how: 'commit' | 'cancel'): void => {
    if (done) return
    const value = area.value
    destroy()
    if (how === 'commit') deps.onCommit(value)
    else deps.onCancel()
  }

  area.addEventListener('input', () => {
    // A method that reports no run of its own composes up to the caret.
    if (composingFrom !== null && !composingText) composingText = area.value.slice(composingFrom, Math.max(composingFrom, area.selectionEnd))
    lay()
    changedHere()
  })
  area.addEventListener('compositionstart', () => {
    composingFrom = Math.min(area.selectionStart, area.selectionEnd)
    composingText = ''
  })
  area.addEventListener('compositionupdate', (e) => {
    composingText = (e as CompositionEvent).data ?? ''
  })
  area.addEventListener('compositionend', () => {
    composingFrom = null
    composingText = ''
    changedHere()
  })
  for (const type of ['select', 'keyup', 'mouseup', 'focus'] as const) area.addEventListener(type, changedHere)
  // A selection moved by the keyboard or the pointer reports through the document.
  const onSelection = (): void => {
    if (document.activeElement === area) changedHere()
  }
  document.addEventListener('selectionchange', onSelection)
  // The field never scrolls: the words it holds stand where they paint.
  area.addEventListener('scroll', () => {
    area.scrollLeft = 0
    area.scrollTop = 0
  })

  area.addEventListener('keydown', (e) => {
    e.stopPropagation()
    // A key an input method composes with is the method's.
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      inline.finished()
      finish('commit')
      return
    }
    // Tab moves the edit on where the drawing's words take turns, as a table's cells do.
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && inline.tab(e.shiftKey)) e.preventDefault()
  })
  area.addEventListener('blur', () => {
    // The window losing the focus is not the viewer leaving the words: the focus comes back to the
    // field with the window, and the caret is dark meanwhile.
    if (!pageFocused()) {
      report()
      return
    }
    finish('commit')
  })

  // A double-click that began with the click that opened this edit asks for the drawing's settings.
  // The field's first press says which: it is the second click of a double-click, or a press of
  // its own.
  let firstPress: 'unseen' | 'single' | 'continued' = 'unseen'
  area.addEventListener('mousedown', (e) => {
    e.stopPropagation()
    if (firstPress === 'unseen') firstPress = e.detail >= 2 ? 'continued' : 'single'
  })
  area.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    if (firstPress === 'continued' && inline.doubleClick()) e.preventDefault()
  })
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) area.addEventListener(type, (e) => e.stopPropagation())

  // A press on the chart commits before the drawing layer handles the press, in the capture phase.
  const onChartPress = (): void => finish('commit')
  deps.gestures.addEventListener('pointerdown', onChartPress, true)

  const destroy = (): void => {
    if (done) return
    done = true
    const hadFocus = document.activeElement === area
    if (blink !== null) clearInterval(blink)
    stopFollowing()
    document.removeEventListener('selectionchange', onSelection)
    deps.gestures.removeEventListener('pointerdown', onChartPress, true)
    area.remove()
    // The keys go back to the chart, where the drawing is still selected.
    if (hadFocus) deps.gestures.focus({ preventScroll: true })
  }

  deps.container.appendChild(area)
  area.focus({ preventScroll: true })
  const end = area.value.length
  area.setSelectionRange(end, end)
  changedHere()
  return { destroy }
}

function mountBoxEditor(session: TextEditSession, deps: TextEditorDeps): TextEditorHandle {
  const font = `${session.italic ? 'italic ' : ''}${session.bold ? '600 ' : ''}${session.fontSize}px ${deps.fontFamily}`
  const placeholder = deps.t('drawing.textPlaceholder')
  const area = el('textarea', { class: 'qc-drawing-text-editor', 'data-qc-editor': 'box', 'aria-label': deps.t('drawing.textEditor'), rows: '1', spellcheck: 'false', wrap: 'off', placeholder }) as HTMLTextAreaElement
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
