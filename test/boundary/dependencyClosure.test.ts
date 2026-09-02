// The dependency boundary (public-chart-library-boundary-plan.md, PCL-1 and the acceptance gates):
// the free chart's tarball may not depend, directly or through another organ, on broker,
// account-manager, chart-engine, engine-client, engine-wire, i18n, ui, watchlist, news,
// trading-core, or app code.
//
// Two layers, kept apart on purpose. The AS-BUILT pins say exactly what the manifest and the
// lockfile closure hold today, so a change is a conscious event and the target blocks cannot rot
// against a tree that moved. The TARGET blocks are the gate itself, written in full and skipped,
// with the stream that unskips each named in its title. Nothing here fakes a pass.
import { describe, expect, it } from 'vitest'
import { directDependencies, shippedClosure } from './scan'

/** Names the free chart may never carry in its shipped closure. App code has no package name a
 *  chart could depend on by accident; the workspace-link walk would surface it as a link outside
 *  `packages/`, and the two app names are listed so a manifest typo cannot hide one. */
const FORBIDDEN: readonly string[] = [
  '@trdrs/account-manager',
  '@trdrs/broker',
  '@trdrs/chart-engine',
  '@trdrs/engine-client',
  '@trdrs/engine-wire',
  '@trdrs/i18n',
  '@trdrs/ui',
  '@trdrs/watchlist',
  '@trdrs/news',
  '@trdrs/trading-core',
  '@trdrs/community',
  '@trdrs/library',
  '@trdrs/order-ticket',
  '@trdrs/web',
  '@trdrs/mobile',
]

describe('the direct dependency set, as built', () => {
  it('pins the manifest edges by name', () => {
    expect(directDependencies()).toEqual({
      dependencies: ['@trdrs/account-manager', '@trdrs/broker', '@trdrs/chart-drawings'],
      peerDependencies: ['lightweight-charts'],
      devDependencies: ['lightweight-charts', 'tsup', 'typescript'],
      optionalDependencies: [],
    })
  })

  it('pins the shipped lockfile closure, workspace links walked', () => {
    const closure = shippedClosure('packages/chart')
    expect(closure.map((e) => `${e.id} <- ${e.via}`)).toEqual([
      '@trdrs/account-manager <- packages/chart',
      '@trdrs/broker <- @trdrs/account-manager',
      '@trdrs/chart-drawings <- packages/chart',
      'fancy-canvas@2.1.0 <- @trdrs/chart-drawings',
    ])
  })

  it('names the forbidden edges present today, so the target blocks track a real removal', () => {
    const present = shippedClosure('packages/chart')
      .map((e) => e.id)
      .filter((id) => FORBIDDEN.includes(id))
    expect(present).toEqual(['@trdrs/account-manager', '@trdrs/broker'])
  })
})

// TARGET. Each block is the acceptance gate in full; the stream that lands the removal deletes the
// `.skip`, and the matching as-built pin above moves with it.
describe('the free chart dependency boundary (target)', () => {
  // W1-A (PCL-3 chart-trading extraction): trade lines, execution marks, the chart order draft,
  // gesture planning, and the account panel move to packages/chart-trading; the manifest loses
  // @trdrs/broker and @trdrs/account-manager.
  it.skip('[W1-A unskips] carries no broker or account-manager edge, direct or through another organ', () => {
    const ids = shippedClosure('packages/chart').map((e) => e.id)
    expect(ids.filter((id) => id === '@trdrs/broker' || id === '@trdrs/account-manager')).toEqual([])
    expect(directDependencies().dependencies).not.toContain('@trdrs/broker')
    expect(directDependencies().dependencies).not.toContain('@trdrs/account-manager')
  })

  // W1-C (PCL-4 chart-owned localization runtime): the packed artifact bundles its own runtime and
  // chart catalogs; @trdrs/i18n is private and absent from the manifest.
  it('carries no @trdrs/i18n edge', () => {
    expect(shippedClosure('packages/chart').map((e) => e.id)).not.toContain('@trdrs/i18n')
    expect(directDependencies().dependencies).not.toContain('@trdrs/i18n')
  })

  // Whoever lands the last removal above also unskips the whole-set gate: no private workspace
  // package of any kind reaches the tarball, and the closure holds no forbidden name.
  it.skip('[W1-A unskips, after both blocks above] ships no private workspace package and no forbidden name', () => {
    const closure = shippedClosure('packages/chart')
    expect(closure.map((e) => e.id).filter((id) => FORBIDDEN.includes(id))).toEqual([])
    // chart-drawings is packed into the artifact under its drawing subpath, so once bundled it is
    // not a shipped edge either; until then it is the one workspace link a consumer may see.
    expect(closure.filter((e) => e.workspace && e.id !== '@trdrs/chart-drawings').map((e) => e.id)).toEqual([])
  })
})
