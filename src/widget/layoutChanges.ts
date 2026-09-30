// Whether the open layout holds changes it has not written, and the autosave that writes them.
//
// Both are the layout's behavior, not a control's: a widget whose saved-layouts menu is hidden, or
// whose host draws a toolbar of its own, still knows there is something to save and still saves it
// when the viewer turned autosave on. The saved-layouts menu reads this answer rather than keeping
// a second one.
import type { CommandRegistry } from './commands'
import type { ChartWidget } from './create'
import type { Emitter, WidgetEvents } from './events'
import type { AutosavePreference } from './widgetCommands'

export interface LayoutChanges {
  /** True while the open layout holds changes it has not written. */
  unsaved(): boolean
  /** Write the open layout now, when autosave is on and there is something it may write. */
  catchUp(): void
  /** Hear every change of `unsaved()`. Returns the unsubscribe. */
  onChange(cb: () => void): () => void
  dispose(): void
}

export interface LayoutChangesDeps {
  widget: ChartWidget
  commands: CommandRegistry
  autosave: AutosavePreference
  events: Emitter<WidgetEvents>
}

export function trackLayoutChanges(deps: LayoutChangesDeps): LayoutChanges {
  const { commands, autosave, events } = deps
  const saveLoad = deps.widget.layout.saveLoad
  const listeners = new Set<() => void>()
  let unsaved = false
  const set = (next: boolean): void => {
    if (unsaved === next) return
    unsaved = next
    for (const cb of [...listeners]) cb()
  }
  // Autosave writes only a layout already saved under a name, because a first write needs a name the
  // viewer chose, and never one holding content it could not put back, which a write would lose. The
  // access policy decides through the command like every other door.
  const catchUp = (): void => {
    if (!autosave.get() || !unsaved || saveLoad.notSaving() || !saveLoad.current()) return
    if (commands.available('widget.layout.save')) commands.execute('widget.layout.save')
  }
  const offs = [
    events.on('saveNeeded', () => {
      set(true)
      catchUp()
    }),
    events.on('layout', (event) => {
      // Removing a saved layout says nothing about the one on screen.
      if (event.kind === 'removed') return
      // A detached chart keeps what is on screen under no layout at all, so it is unsaved work.
      if (event.kind === 'detached') set(true)
      // A layout that stopped saving still holds what it could not write.
      else if (!saveLoad.notSaving()) set(false)
    }),
  ]
  return {
    unsaved: () => unsaved,
    catchUp,
    onChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    dispose() {
      for (const off of offs.splice(0)) off()
      listeners.clear()
    },
  }
}
