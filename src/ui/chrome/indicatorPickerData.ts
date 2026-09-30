// Snapshot and validate the small data contract at the UI boundary. Never retain host-owned rows:
// a later mutation must not change the action attached to an already rendered button.
import { BUILT_IN_INDICATORS } from '../../builtInIndicators'
import type { IndicatorPickerAction, IndicatorPickerBuiltInState, IndicatorPickerCollection, IndicatorPickerItem } from '../../widget/indicatorPicker'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const builtinIds = new Set(BUILT_IN_INDICATORS.map((d) => d.id))
const optionalText = (value: unknown): boolean => value === undefined || typeof value === 'string'
const count = (value: unknown): boolean => value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length

function actions(value: unknown): IndicatorPickerAction[] | null {
  if (!Array.isArray(value) || value.length > 2) return null
  const result: IndicatorPickerAction[] = []
  for (const action of value) {
    if (!record(action) || !text(action.id) || ['add', 'favorite'].includes(action.id) || !text(action.label)
      || (action.disabled !== undefined && typeof action.disabled !== 'boolean')) return null
    result.push({ id: action.id, label: action.label, ...(action.icon !== undefined ? { icon: action.icon as IndicatorPickerAction['icon'] } : {}), ...(action.disabled !== undefined ? { disabled: action.disabled } : {}) })
  }
  return unique(result.map((a) => a.id)) ? result : null
}

export function pickerCollections(value: unknown): IndicatorPickerCollection[] | null {
  try {
    if (!Array.isArray(value)) return null
    const result: IndicatorPickerCollection[] = []
    for (const row of value) {
      if (!record(row) || !text(row.id) || ['builtin', 'favorites'].includes(row.id) || !text(row.label) || !optionalText(row.group)
        || (row.layout !== undefined && row.layout !== 'list' && row.layout !== 'table')) return null
      result.push({ id: row.id, label: row.label, ...(row.icon !== undefined ? { icon: row.icon as IndicatorPickerCollection['icon'] } : {}), ...(row.group !== undefined ? { group: row.group as string } : {}), ...(row.layout !== undefined ? { layout: row.layout } : {}) })
    }
    return unique(result.map((row) => row.id)) ? result : null
  } catch { return null }
}

export interface PickerRows { items: IndicatorPickerItem[]; builtIns: IndicatorPickerBuiltInState[] }
export function pickerRows(value: unknown): PickerRows | null {
  try {
    if (!record(value) || value.kind !== 'ok' || !Array.isArray(value.items) || (value.builtIns !== undefined && !Array.isArray(value.builtIns))) return null
    const items: IndicatorPickerItem[] = []
    for (const row of value.items) {
      if (!record(row) || !text(row.id) || builtinIds.has(row.id) || ['builtin', 'favorites', 'add', 'favorite'].includes(row.id) || !text(row.title)
        || !optionalText(row.description) || !optionalText(row.author) || !count(row.favoriteCount)
        || (row.favorite !== undefined && typeof row.favorite !== 'boolean')) return null
      const verbs = actions(row.actions)
      if (!verbs || !text(row.primaryAction) || !verbs.some((a) => a.id === row.primaryAction)) return null
      items.push({ id: row.id, title: row.title, primaryAction: row.primaryAction, actions: verbs,
        ...(row.description !== undefined ? { description: row.description as string } : {}), ...(row.author !== undefined ? { author: row.author as string } : {}),
        ...(row.favorite !== undefined ? { favorite: row.favorite } : {}), ...(row.favoriteCount !== undefined ? { favoriteCount: row.favoriteCount as number } : {}) })
    }
    const builtIns: IndicatorPickerBuiltInState[] = []
    for (const row of value.builtIns ?? []) {
      if (!record(row) || !text(row.id) || !builtinIds.has(row.id) || !count(row.favoriteCount) || (row.favorite !== undefined && typeof row.favorite !== 'boolean')) return null
      const verbs = actions(row.actions ?? [])
      if (!verbs || verbs.length > 1) return null
      builtIns.push({ id: row.id, actions: verbs, ...(row.favorite !== undefined ? { favorite: row.favorite } : {}), ...(row.favoriteCount !== undefined ? { favoriteCount: row.favoriteCount as number } : {}) })
    }
    return unique(items.map((row) => row.id)) && unique(builtIns.map((row) => row.id)) ? { items, builtIns } : null
  } catch { return null }
}
