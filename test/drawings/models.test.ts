// The drawing product models: the rail's shape, the eye, the pointer, the magnet, the locks, the
// favorites, and what copying and typing do. Every one of these was a condition inside a React
// component before; a test can reach them now, which is the point of moving them.
import { describe, expect, it } from 'vitest'
import {
  ARROW_TYPES,
  blanks,
  BRUSH_TYPES,
  buildRailGroups,
  cancelText,
  CARD_TYPES,
  chooseHideMode,
  chooseMagnetStrength,
  clampFavoritesPosition,
  CLONE_OFFSET_PX,
  commitText,
  cursorButtonArmed,
  CURSOR_LABELS,
  CURSOR_MODES,
  DEFAULT_FAVORITES,
  DEFAULT_HIDE_STATE,
  drawingTools,
  editRefused,
  favoritesBarShown,
  GLYPH_TYPES,
  groupOfTool,
  HIDE_LABELS,
  HIDE_ORDER,
  hideRowActive,
  isFavorite,
  isTransientTool,
  MAGNET_LABELS,
  MAGNET_STRENGTHS,
  magnetActive,
  MAX_FAVORITE_TOOLS,
  opensTextEditor,
  pruneFavorites,
  railFaceOf,
  RAIL_PLAN,
  rememberRailTool,
  removableDrawings,
  removeRows,
  toggleFavorite,
  toggleHide,
  toggleMagnet,
  toolAfterPlacement,
  TRANSIENT_LABELS,
  TRANSIENT_TOOLS,
  transientSurvives,
  type HideState,
} from '../../src/drawings/index'

describe('the rail', () => {
  const groups = buildRailGroups()

  it('has the seven groups the plan names, in order', () => {
    expect(groups.map((g) => g.id)).toEqual(['trend', 'fib-gann', 'patterns', 'forecast', 'shapes', 'annotation', 'glyphs'])
    expect(RAIL_PLAN).toHaveLength(7)
  })

  it('shows every catalog tool exactly once, apart from Measure, which is a pointer mode', () => {
    const shown = groups.flatMap((g) => g.sections.flatMap((s) => s.tools.map((t) => t.type)))
    expect(new Set(shown).size).toBe(shown.length)
    const catalog = drawingTools.all().map((t) => t.type)
    expect(catalog.filter((t) => !shown.includes(t)).sort()).toEqual(['measure'])
  })

  it('moves the arrow marks beside the arrow line, and out of the annotations', () => {
    const arrows = groups.find((g) => g.id === 'shapes')!.sections.find((s) => s.label === 'drawing.sectionArrows')!
    expect(arrows.tools.map((t) => t.type)).toEqual([...ARROW_TYPES])
    const notes = groups.find((g) => g.id === 'annotation')!.sections[0]!
    for (const type of ARROW_TYPES) expect(notes.tools.some((t) => t.type === type), type).toBe(false)
  })

  it('leads the shapes with the brushes and keeps them out of the shapes section', () => {
    const shapes = groups.find((g) => g.id === 'shapes')!
    expect(shapes.sections[0]!.tools.map((t) => t.type)).toEqual([...BRUSH_TYPES])
    const geometric = shapes.sections[2]!
    for (const type of BRUSH_TYPES) expect(geometric.tools.some((t) => t.type === type), type).toBe(false)
  })

  it('puts the image and content cards under Content, and the glyph marks in their own group', () => {
    const content = groups.find((g) => g.id === 'annotation')!.sections[1]!
    expect(content.tools.map((t) => t.type)).toEqual([...CARD_TYPES])
    expect(groups.find((g) => g.id === 'glyphs')!.sections[0]!.tools.map((t) => t.type)).toEqual([...GLYPH_TYPES])
  })

  it('names every heading with a catalog key, never a word', () => {
    for (const g of groups) {
      expect(g.label).toMatch(/^drawing\./)
      for (const s of g.sections) expect(s.label).toMatch(/^drawing\./)
    }
  })

  it('drops a section, and a group, that a trimmed catalog leaves empty', () => {
    const empty = buildRailGroups({ ...drawingTools, get: () => undefined, byCategory: () => [] })
    expect(empty).toEqual([])
  })

  it('finds the group an armed tool belongs to, and nothing for none', () => {
    expect(groupOfTool(groups, 'fib_retracement')).toBe('fib-gann')
    expect(groupOfTool(groups, null)).toBeNull()
    expect(groupOfTool(groups, 'measure')).toBeNull()
  })

  it('wears the last-picked tool per group, and the first tool before anything is picked', () => {
    const trend = groups[0]!
    expect(railFaceOf(trend, {})).toBe(trend.sections[0]!.tools[0]!.type)
    expect(railFaceOf(trend, { trend: 'ray' })).toBe('ray')
    // A remembered tool the group no longer shows falls back rather than leaving a blank button.
    expect(railFaceOf(trend, { trend: 'not_a_tool' })).toBe(trend.sections[0]!.tools[0]!.type)
  })

  it('remembers a pick against its own group and leaves the record it was handed alone', () => {
    const before = { shapes: 'rectangle' }
    const after = rememberRailTool(groups, before, 'ray')
    expect(after).toEqual({ shapes: 'rectangle', trend: 'ray' })
    expect(before).toEqual({ shapes: 'rectangle' })
    expect(rememberRailTool(groups, before, 'measure')).toEqual(before)
  })
})

describe('the eye', () => {
  it('offers drawings, indicators and all, and nothing about trading', () => {
    expect([...HIDE_ORDER]).toEqual(['drawings', 'indicators', 'all'])
    expect(Object.keys(HIDE_LABELS).sort()).toEqual(['all', 'drawings', 'indicators'])
    expect(JSON.stringify(HIDE_LABELS)).not.toMatch(/trade|position|order/i)
  })

  it('rests pointed at drawings, blanking nothing', () => {
    expect(DEFAULT_HIDE_STATE).toEqual({ mode: 'drawings', on: false })
  })

  it('blanks only the layer it is pointed at, and All covers both', () => {
    expect(blanks({ mode: 'drawings', on: true }, 'drawings')).toBe(true)
    expect(blanks({ mode: 'drawings', on: true }, 'indicators')).toBe(false)
    expect(blanks({ mode: 'all', on: true }, 'drawings')).toBe(true)
    expect(blanks({ mode: 'all', on: true }, 'indicators')).toBe(true)
    expect(blanks({ mode: 'all', on: false }, 'drawings')).toBe(false)
  })

  it('toggles its subject without changing it', () => {
    expect(toggleHide({ mode: 'indicators', on: false })).toEqual({ mode: 'indicators', on: true })
    expect(toggleHide({ mode: 'indicators', on: true })).toEqual({ mode: 'indicators', on: false })
  })

  it('picks a new subject AND blanks it in one gesture, and re-picking the blanked one releases it', () => {
    const state: HideState = { mode: 'drawings', on: true }
    expect(chooseHideMode(state, 'indicators')).toEqual({ mode: 'indicators', on: true })
    expect(chooseHideMode(state, 'drawings')).toEqual({ mode: 'drawings', on: false })
    expect(chooseHideMode({ mode: 'drawings', on: false }, 'drawings')).toEqual({ mode: 'drawings', on: true })
  })

  it('marks a menu row only when it is both the subject and blanked', () => {
    expect(hideRowActive({ mode: 'all', on: true }, 'all')).toBe(true)
    expect(hideRowActive({ mode: 'all', on: false }, 'all')).toBe(false)
    expect(hideRowActive({ mode: 'all', on: true }, 'drawings')).toBe(false)
  })
})

describe('the pointer', () => {
  it('names three cursor glyphs and three transient tools', () => {
    expect([...CURSOR_MODES]).toEqual(['cross', 'dot', 'arrow'])
    expect(Object.keys(CURSOR_LABELS).sort()).toEqual(['arrow', 'cross', 'dot'])
    expect([...TRANSIENT_TOOLS]).toEqual(['eraser', 'measure', 'zoom'])
    expect(Object.keys(TRANSIENT_LABELS).sort()).toEqual(['eraser', 'measure', 'zoom'])
  })

  it('tells a transient from a catalog tool', () => {
    expect(isTransientTool('measure')).toBe(true)
    expect(isTransientTool('trend_line')).toBe(false)
    expect(isTransientTool(null)).toBe(false)
  })

  it('keeps a measure readout alive only under measure and zoom', () => {
    expect(transientSurvives('measure')).toBe(true)
    expect(transientSurvives('zoom')).toBe(true)
    expect(transientSurvives('eraser')).toBe(false)
    expect(transientSurvives(null)).toBe(false)
  })

  it('releases a placed tool unless stay-in-drawing-mode holds it, and never releases a transient', () => {
    expect(toolAfterPlacement('trend_line', false)).toBeNull()
    expect(toolAfterPlacement('trend_line', true)).toBe('trend_line')
    expect(toolAfterPlacement('eraser', false)).toBe('eraser')
    expect(toolAfterPlacement('measure', false)).toBe('measure')
  })

  it('lights the cursor button at rest and while the eraser is armed', () => {
    expect(cursorButtonArmed(null)).toBe(true)
    expect(cursorButtonArmed('eraser')).toBe(true)
    expect(cursorButtonArmed('trend_line')).toBe(false)
  })
})

describe('the magnet', () => {
  it('offers two strengths; off is reached by toggling, never by picking', () => {
    expect([...MAGNET_STRENGTHS]).toEqual(['weak', 'strong'])
    expect(Object.keys(MAGNET_LABELS).sort()).toEqual(['strong', 'weak'])
  })

  it('toggles back to the last strength chosen rather than always to weak', () => {
    expect(toggleMagnet('off')).toBe('weak')
    expect(toggleMagnet('off', 'strong')).toBe('strong')
    expect(toggleMagnet('strong')).toBe('off')
  })

  it('latches a menu row: picking the active strength releases, picking the other switches', () => {
    expect(chooseMagnetStrength('weak', 'weak')).toBe('off')
    expect(chooseMagnetStrength('weak', 'strong')).toBe('strong')
    expect(chooseMagnetStrength('off', 'strong')).toBe('strong')
  })

  it('is pulling in either strength', () => {
    expect(magnetActive('off')).toBe(false)
    expect(magnetActive('weak')).toBe(true)
    expect(magnetActive('strong')).toBe(true)
  })
})

describe('locks and sweeps', () => {
  const locked = { locked: true }
  const free = { locked: false }

  it('lets a locked drawing still be selected, so it can be unlocked', () => {
    expect(editRefused('select', locked, false)).toBe(false)
    expect(editRefused('move', locked, false)).toBe(true)
    expect(editRefused('delete', locked, false)).toBe(true)
    expect(editRefused('editText', locked, false)).toBe(true)
    expect(editRefused('clone', locked, false)).toBe(true)
  })

  it('leaves an unlocked drawing alone', () => {
    for (const edit of ['select', 'move', 'resize', 'delete', 'editText', 'clone'] as const)
      expect(editRefused(edit, free, false), edit).toBe(false)
  })

  it('refuses everything under lock-all, new drawings included', () => {
    expect(editRefused('place', null, true)).toBe(true)
    expect(editRefused('paste', null, true)).toBe(true)
    expect(editRefused('select', free, true)).toBe(true)
    expect(editRefused('place', null, false)).toBe(false)
  })

  it('counts what a sweep would actually take', () => {
    expect(removableDrawings({ total: 5, locked: 2 }, false)).toBe(3)
    expect(removableDrawings({ total: 5, locked: 2 }, true)).toBe(5)
  })

  it('never offers a remove row that would do nothing', () => {
    expect(removeRows({ total: 0, locked: 0 }, 0, false)).toEqual([])
    expect(removeRows({ total: 2, locked: 2 }, 0, false)).toEqual([])
    expect(removeRows({ total: 2, locked: 0 }, 0, false).map((r) => r.id)).toEqual(['drawings'])
    expect(removeRows({ total: 0, locked: 0 }, 3, false).map((r) => r.id)).toEqual(['indicators'])
    expect(removeRows({ total: 2, locked: 0 }, 3, false).map((r) => r.id)).toEqual(['drawings', 'indicators', 'both'])
  })

  it('counts locked drawings into the row when the standing preference says so', () => {
    expect(removeRows({ total: 2, locked: 2 }, 0, true).map((r) => r.drawings)).toEqual([2])
  })
})

describe('favorites', () => {
  it('starts empty, shown, and undragged', () => {
    expect(DEFAULT_FAVORITES).toEqual({ tools: [], visible: true, position: null })
  })

  it('appends in the order the trader starred them and never re-sorts', () => {
    let state = DEFAULT_FAVORITES
    state = toggleFavorite(state, 'ray')
    state = toggleFavorite(state, 'brush')
    state = toggleFavorite(state, 'text')
    expect(state.tools).toEqual(['ray', 'brush', 'text'])
    state = toggleFavorite(state, 'brush')
    expect(state.tools).toEqual(['ray', 'text'])
    expect(isFavorite(state, 'brush')).toBe(false)
  })

  it('refuses past the cap rather than quietly evicting an existing star', () => {
    let state = DEFAULT_FAVORITES
    for (let i = 0; i < MAX_FAVORITE_TOOLS; i++) state = toggleFavorite(state, `t${i}`)
    expect(state.tools).toHaveLength(MAX_FAVORITE_TOOLS)
    expect(toggleFavorite(state, 'one_more')).toBe(state)
  })

  it('hides an empty bar even when it is switched on', () => {
    expect(favoritesBarShown({ tools: [], visible: true, position: null })).toBe(false)
    expect(favoritesBarShown({ tools: ['ray'], visible: true, position: null })).toBe(true)
    expect(favoritesBarShown({ tools: ['ray'], visible: false, position: null })).toBe(false)
  })

  it('drops stars the catalog no longer registers', () => {
    const state = { tools: ['ray', 'gone'], visible: true, position: null }
    expect(pruneFavorites(state, (t) => t === 'ray').tools).toEqual(['ray'])
    expect(pruneFavorites(state, () => true)).toBe(state)
  })

  it('keeps a dragged bar reachable when the chart shrinks under it', () => {
    const bar = { width: 200, height: 40 }
    expect(clampFavoritesPosition({ x: 900, y: 900 }, bar, { width: 500, height: 300 })).toEqual({ x: 300, y: 260 })
    expect(clampFavoritesPosition({ x: -20, y: -20 }, bar, { width: 500, height: 300 })).toEqual({ x: 0, y: 0 })
    // A chart narrower than the bar pins it to the left rather than to a negative offset.
    expect(clampFavoritesPosition({ x: 50, y: 0 }, bar, { width: 100, height: 300 })).toEqual({ x: 0, y: 0 })
  })
})

describe('copying and typing', () => {
  it('lands a copy beside its source, never under it', () => {
    expect(CLONE_OFFSET_PX).toBeGreaterThan(0)
  })

  it('undoes a FRESH placement committed empty, and clears an existing drawing text', () => {
    expect(commitText({ id: 'a', fresh: true }, '   ')).toEqual({ kind: 'discard' })
    expect(commitText({ id: 'a', fresh: false }, '   ')).toEqual({ kind: 'apply', text: '' })
    expect(commitText({ id: 'a', fresh: false }, '  hi ')).toEqual({ kind: 'apply', text: 'hi' })
  })

  it('treats a table cell as its own edit, fresh or not', () => {
    expect(commitText({ id: 'a', fresh: true, cell: { row: 1, col: 2 } }, ' x ')).toEqual({
      kind: 'apply-cell',
      row: 1,
      col: 2,
      text: 'x',
    })
  })

  it('cancels a fresh placement away and leaves an existing drawing standing', () => {
    expect(cancelText({ id: 'a', fresh: true })).toEqual({ kind: 'remove' })
    expect(cancelText({ id: 'a', fresh: false })).toEqual({ kind: 'keep' })
  })

  it('opens the editor for the tools that render text', () => {
    expect(opensTextEditor(drawingTools.get('text'))).toBe(true)
    expect(opensTextEditor(drawingTools.get('trend_line'))).toBe(false)
    expect(opensTextEditor(undefined)).toBe(false)
  })
})
