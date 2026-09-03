// The command registry's door, in the order it judges a call: the access policy on the id, then
// the spec's own refusal of the argument, then availability, then the run. Each step is pinned
// against what the later steps never see, and a refusal that throws is a refusal.
import { describe, expect, it } from 'vitest'
import { createCommandRegistry, type CommandSpec } from '../../src/widget/commands'

function rig(options: { permit?: (id: string) => boolean; refuses?: (arg: unknown) => boolean; available?: () => boolean } = {}) {
  const calls: string[] = []
  const registry = createCommandRegistry(options.permit ? { access: { command: options.permit } } : undefined)
  const spec: CommandSpec = {
    id: 'chart.test.arm',
    scope: 'chart',
    label: 'command.drawingArm',
    available: () => {
      calls.push('available')
      return options.available?.() ?? true
    },
    ...(options.refuses
      ? {
          refuses: (arg: unknown) => {
            calls.push('refuses')
            return options.refuses!(arg)
          },
        }
      : {}),
    execute: () => {
      calls.push('execute')
    },
  }
  registry.registry.register(spec)
  return { registry: registry.registry, calls }
}

describe('the door, in order', () => {
  it('a refused id is denied before the spec is asked anything', () => {
    const { registry, calls } = rig({ permit: () => false, refuses: () => false })
    expect(registry.execute('chart.test.arm', 'ray')).toEqual({ kind: 'denied' })
    expect(registry.available('chart.test.arm')).toBe(false)
    expect(calls).toEqual([])
  })

  it('a refused argument is denied before availability is read, and availability by id never asks refuses', () => {
    const { registry, calls } = rig({ refuses: (arg) => arg === 'trend_line' })
    expect(registry.execute('chart.test.arm', 'trend_line')).toEqual({ kind: 'denied' })
    expect(calls).toEqual(['refuses'])
    expect(registry.available('chart.test.arm')).toBe(true)
    expect(calls).toEqual(['refuses', 'available'])
    expect(registry.execute('chart.test.arm', 'ray')).toEqual({ kind: 'ok' })
    expect(calls).toEqual(['refuses', 'available', 'refuses', 'available', 'execute'])
  })

  it('an accepted argument still waits on availability', () => {
    const { registry, calls } = rig({ refuses: () => false, available: () => false })
    expect(registry.execute('chart.test.arm', 'ray')).toEqual({ kind: 'unavailable' })
    expect(calls).toEqual(['refuses', 'available'])
  })

  it('a refusal that throws refuses: the chart never guesses in the caller\'s favor', () => {
    const { registry, calls } = rig({
      refuses: () => {
        throw new Error('policy exploded')
      },
    })
    expect(registry.execute('chart.test.arm', 'ray')).toEqual({ kind: 'denied' })
    expect(calls).toEqual(['refuses'])
  })

  it('a spec without refuses judges by id and availability alone', () => {
    const { registry, calls } = rig()
    expect(registry.execute('chart.test.arm', 'anything')).toEqual({ kind: 'ok' })
    expect(calls).toEqual(['available', 'execute'])
  })
})
