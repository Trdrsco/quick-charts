// The dependency boundary:
// the Quick Charts tarball may not depend, directly or through anything else, on a package a reader
// cannot install. What a reader receives is one artifact and one peer, and this fixture reads the
// manifest to say so.
//
// Two layers, kept apart on purpose. The first pins exactly what the manifest holds, so a change is
// a conscious event. The second is the gate itself, written in full. Nothing here fakes a pass.
import { describe, expect, it } from 'vitest'
import { chartManifest, directDependencies } from './scan'

/** Names Quick Charts may never carry, in any dependency block. */
const FORBIDDEN = /@trdrs\//

describe('the direct dependency set, as built', () => {
  it('pins the manifest edges by name', () => {
    // The drawing and indicator seams are source modules under src/internal, compiled into the
    // artifact like any other source, so neither is a dependency of any kind.
    expect(directDependencies()).toEqual({
      dependencies: [],
      peerDependencies: ['lightweight-charts'],
      devDependencies: ['@playwright/test', 'fancy-canvas', 'happy-dom', 'lightweight-charts', 'tsup', 'typescript', 'vite', 'vitest'],
      optionalDependencies: [],
    })
  })

  it('installs nothing but the one peer: no runtime dependency at all', () => {
    const m = chartManifest()
    expect(m.dependencies ?? {}).toEqual({})
    expect(m.optionalDependencies ?? {}).toEqual({})
    expect(Object.keys(m.peerDependencies ?? {})).toEqual(['lightweight-charts'])
  })
})

// The gate. Each block is the acceptance gate in full.
describe('the Quick Charts dependency boundary', () => {
  it('names no private package in any dependency block', () => {
    const m = chartManifest()
    const every = [
      ...Object.keys(m.dependencies ?? {}),
      ...Object.keys(m.peerDependencies ?? {}),
      ...Object.keys(m.devDependencies ?? {}),
      ...Object.keys(m.optionalDependencies ?? {}),
    ]
    expect(every.filter((name) => FORBIDDEN.test(name))).toEqual([])
  })

  it('ships the selected public artifact as one install', () => {
    const m = chartManifest()
    expect(m.name).toBe('@trdrs/quickcharts')
    expect(m.publishConfig?.access).toBe('public')
  })
})
