// The drawing preference record. It is the one document a chart must never fail to open on, so
// every assertion here is about what a BAD document does rather than a good one.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWING_PREFERENCES,
  DRAWING_PREFERENCES_KEY,
  parseDrawingPreferences,
  serializeDrawingPreferences,
  MAX_FAVORITE_TOOLS,
} from '../../src/drawings/index'

describe('the drawing preference record', () => {
  it('round-trips', () => {
    const wanted = {
      ...DEFAULT_DRAWING_PREFERENCES,
      cursor: 'dot' as const,
      magnet: 'strong' as const,
      magnetStrength: 'strong' as const,
      stayInDrawingMode: true,
      removeLocked: true,
      syncAcrossPanes: false,
      railTools: { trend: 'ray' },
      favorites: { tools: ['ray'], visible: false, position: { x: 4, y: 8 } },
    }
    expect(parseDrawingPreferences(serializeDrawingPreferences(wanted))).toEqual(wanted)
  })

  it('reads a missing, empty or malformed document as the defaults, never a throw', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '"a string"', '42'])
      expect(parseDrawingPreferences(raw), String(raw)).toEqual(DEFAULT_DRAWING_PREFERENCES)
  })

  it('falls back per FIELD, so one bad value does not cost the rest', () => {
    const parsed = parseDrawingPreferences(JSON.stringify({ cursor: 'spiral', magnet: 'weak', stayInDrawingMode: 'yes' }))
    expect(parsed.cursor).toBe(DEFAULT_DRAWING_PREFERENCES.cursor)
    expect(parsed.magnet).toBe('weak')
    expect(parsed.stayInDrawingMode).toBe(DEFAULT_DRAWING_PREFERENCES.stayInDrawingMode)
  })

  it('keeps only string entries out of a rail-tool record written by something else', () => {
    expect(parseDrawingPreferences(JSON.stringify({ railTools: { trend: 'ray', shapes: 7, glyphs: null } })).railTools).toEqual({
      trend: 'ray',
    })
  })

  it('holds a stored favorites list to the cap and drops non-string entries', () => {
    const tools = Array.from({ length: MAX_FAVORITE_TOOLS + 5 }, (_, i) => `t${i}`)
    const parsed = parseDrawingPreferences(JSON.stringify({ favorites: { tools: [...tools, 3, null] } }))
    expect(parsed.favorites.tools).toHaveLength(MAX_FAVORITE_TOOLS)
    expect(parsed.favorites.visible).toBe(true)
  })

  it('reads a half-written position as no position rather than as NaN pixels', () => {
    expect(parseDrawingPreferences(JSON.stringify({ favorites: { position: { x: 4 } } })).favorites.position).toBeNull()
  })

  it('persists in the widget storage namespace, beside its other viewer keys', () => {
    expect(DRAWING_PREFERENCES_KEY).toMatch(/^trdrs\.chart\.widget\./)
  })
})
