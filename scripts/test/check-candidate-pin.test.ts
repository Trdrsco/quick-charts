// The candidate pin's decision: which change is held to the pin and which reports its drift and
// passes. The comparison itself is comparePin, proven beside the release rehearsal.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PIN_PATH, changeBase, pinRequired } from '../check-candidate-pin.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

describe('which change is held to the pin', () => {
  it('holds a change that sets a new version', () => {
    expect(pinRequired({ baseVersion: '5.4.0', version: '5.5.0', paths: ['package.json', 'src/index.ts'] })).toBe(true)
  })

  it('holds a change that writes the pin', () => {
    expect(pinRequired({ baseVersion: '5.4.0', version: '5.4.0', paths: [PIN_PATH] })).toBe(true)
  })

  it('passes any other change, whatever bytes it packs', () => {
    expect(pinRequired({ baseVersion: '5.4.0', version: '5.4.0', paths: ['src/index.ts', 'package.json', 'README.md'] })).toBe(false)
    expect(pinRequired({ baseVersion: '5.4.0', version: '5.4.0', paths: [] })).toBe(false)
  })

  it('holds a change whose base version or changed paths are unknown', () => {
    expect(pinRequired({ baseVersion: null, version: '5.4.0', paths: [] })).toBe(true)
    expect(pinRequired({ baseVersion: '5.4.0', version: '5.4.0', paths: null })).toBe(true)
  })
})

describe('the base a change is measured from', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  const eventFile = (event: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'quickcharts-pin-event-'))
    dirs.push(dir)
    const file = join(dir, 'event.json')
    writeFileSync(file, typeof event === 'string' ? event : JSON.stringify(event))
    return file
  }
  const noGit = () => {
    throw new Error('CI reads its base from the event')
  }

  it('reads a pull request from its base and a push from its previous head', () => {
    const file = eventFile({ pull_request: { base: { sha: A } }, before: B })
    expect(changeBase({ GITHUB_EVENT_PATH: file, GITHUB_EVENT_NAME: 'pull_request' }, noGit)).toBe(A)
    expect(changeBase({ GITHUB_EVENT_PATH: file, GITHUB_EVENT_NAME: 'push' }, noGit)).toBe(B)
  })

  it('has no base for a new branch, a dispatched run or an unreadable event', () => {
    expect(changeBase({ GITHUB_EVENT_PATH: eventFile({ before: '0'.repeat(40) }), GITHUB_EVENT_NAME: 'push' }, noGit)).toBe(null)
    expect(changeBase({ GITHUB_EVENT_PATH: eventFile({ inputs: {} }), GITHUB_EVENT_NAME: 'workflow_dispatch' }, noGit)).toBe(null)
    expect(changeBase({ GITHUB_EVENT_PATH: eventFile('not json'), GITHUB_EVENT_NAME: 'push' }, noGit)).toBe(null)
  })

  it('measures a checkout off CI from its merge base with origin/main', () => {
    expect(changeBase({}, (...args: string[]) => (args.join(' ') === 'merge-base HEAD origin/main' ? `${A}\n` : null))).toBe(A)
    expect(changeBase({}, () => null)).toBe(null)
  })
})
