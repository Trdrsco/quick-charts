// The keyboard resolves to a COMMAND and runs through the registry, which is what makes a shortcut
// obey the same access policy and feature flags a menu row does. What is pinned here is that a
// press cannot reach a verb the registry would refuse, that a refused press is left for the page,
// and that a shortcut means the same physical key however a host wrote it.
import { describe, expect, it } from 'vitest'
import { createCommandRegistry } from '../../src/widget/commands'
import { attachShortcuts, eventShortcut, normalizeShortcut } from '../../src/widget/shortcuts'

/** A stand-in root that records its listener, so a press can be delivered without a DOM. */
function fakeRoot() {
  let handler: ((event: KeyboardEvent) => void) | null = null
  const root = {
    hasAttribute: () => false,
    tabIndex: 0,
    addEventListener: (_type: string, fn: (event: KeyboardEvent) => void) => {
      handler = fn
    },
    removeEventListener: () => {
      handler = null
    },
  }
  const press = (over: Partial<KeyboardEvent> & { code: string }): { prevented: boolean } => {
    let prevented = false
    handler?.({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault: () => {
        prevented = true
      },
      ...over,
    } as unknown as KeyboardEvent)
    return { prevented }
  }
  return { root: root as unknown as HTMLElement, press, bound: () => handler !== null }
}

describe('a shortcut names one physical key', () => {
  it('orders modifiers so two spellings of one chord are the same key', () => {
    expect(normalizeShortcut('Shift+Alt+KeyR')).toBe(normalizeShortcut('Alt+Shift+KeyR'))
    expect(normalizeShortcut('Alt+KeyR')).toBe('Alt+KeyR')
    expect(normalizeShortcut('Delete')).toBe('Delete')
  })

  it('refuses a modifier it cannot honor rather than binding the key to something else', () => {
    expect(normalizeShortcut('Hyper+KeyR')).toBeNull()
    expect(normalizeShortcut('')).toBeNull()
  })

  it('reads a press in the same terms', () => {
    expect(eventShortcut({ code: 'KeyR', altKey: true } as KeyboardEvent)).toBe('Alt+KeyR')
    expect(eventShortcut({ code: 'Escape' } as KeyboardEvent)).toBe('Escape')
  })
})

describe('the dispatcher runs shortcuts through the registry', () => {
  const registryWith = (available: () => boolean, access?: (id: string) => boolean) => {
    const ran: string[] = []
    const handle = createCommandRegistry(access ? { access: { command: access } } : undefined)
    handle.registry.register({
      id: 'chart.view.reset',
      scope: 'chart',
      label: 'command.viewReset',
      shortcut: 'Alt+KeyR',
      available,
      execute: () => {
        ran.push('reset')
      },
    })
    return { ran, handle }
  }

  it('runs the command a press resolves to, and takes the key', () => {
    const { ran, handle } = registryWith(() => true)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    expect(press({ code: 'KeyR', altKey: true }).prevented).toBe(true)
    expect(ran).toEqual(['reset'])
  })

  it('leaves the key alone when the access policy refuses the verb', () => {
    const { ran, handle } = registryWith(() => true, () => false)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    // The press must not be consumed: eating a key for a command the host forbade would make a
    // disabled verb feel like a broken keyboard.
    expect(press({ code: 'KeyR', altKey: true }).prevented).toBe(false)
    expect(ran).toEqual([])
  })

  it('leaves the key alone when the command is unavailable right now', () => {
    const { ran, handle } = registryWith(() => false)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    expect(press({ code: 'KeyR', altKey: true }).prevented).toBe(false)
    expect(ran).toEqual([])
  })

  it('ignores a press aimed at something the viewer is typing into', () => {
    const { ran, handle } = registryWith(() => true)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    press({ code: 'KeyR', altKey: true, target: { tagName: 'INPUT' } as unknown as EventTarget })
    expect(ran).toEqual([])
  })

  it('ignores a chord that names a different key', () => {
    const { ran, handle } = registryWith(() => true)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    press({ code: 'KeyR' }) // no Alt
    expect(ran).toEqual([])
  })

  it('follows a remapped shortcut, and drops the old key with it', () => {
    const { ran, handle } = registryWith(() => true)
    const { root, press } = fakeRoot()
    attachShortcuts({ root, commands: handle.registry })
    handle.registry.setShortcut('chart.view.reset', 'Ctrl+KeyK')
    expect(press({ code: 'KeyR', altKey: true }).prevented).toBe(false)
    expect(press({ code: 'KeyK', ctrlKey: true }).prevented).toBe(true)
    expect(ran).toEqual(['reset'])
  })

  it('unbinds at dispose', () => {
    const { handle } = registryWith(() => true)
    const { root, bound } = fakeRoot()
    const shortcuts = attachShortcuts({ root, commands: handle.registry })
    expect(bound()).toBe(true)
    shortcuts.dispose()
    expect(bound()).toBe(false)
  })
})
