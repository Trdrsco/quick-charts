// A drawing restored from a format-2 save whose tool's present design cannot paint that save's look
// carries the save's settings as `savedLook`, and paints them as format 2 did until its settings
// change: a change through its pages or its bar gives it the present design, with the present props
// it was restored with as the closest look.

/** The settings a format-2 save painted with, held by a tool whose present design cannot paint them,
 *  or null for a drawing in its present design. */
export type SavedLook = Readonly<Record<string, unknown>> | null

/** A props patch to a drawing that may hold a saved look: a change to its settings ends the look; a
 *  patch that carries the look itself, as a cancelled edit's snapshot does, keeps it. */
export function endSavedLook<P extends Record<string, unknown>>(patch: Partial<P>): Partial<P> {
  return 'savedLook' in patch || Object.keys(patch).length === 0 ? patch : { ...patch, savedLook: null }
}

/** A saved look's levels: the ones it carries, each a value and whether it shows, with the color
 *  it carries where it carries one. */
export function savedLevels(look: NonNullable<SavedLook>, key = 'levels'): { value: number; visible: boolean; color?: string; text?: string }[] {
  const levels = look[key]
  if (!Array.isArray(levels)) return []
  return levels
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && typeof (l as Record<string, unknown>).value === 'number')
    .map((l) => ({
      value: l.value as number,
      visible: l.visible !== false,
      ...(typeof l.color === 'string' ? { color: l.color } : {}),
      ...(typeof l.text === 'string' ? { text: l.text } : {}),
    }))
}
