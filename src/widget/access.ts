// The access policy, read in one place: whether the host permits a command, a drawing tool or an
// indicator, and whether the chart's own controls draw what it refuses.
//
// Permission and presentation are separate questions. Every door asks permission (a menu row, a
// shortcut, the public API, a restore), and a refusal there is the same whatever the controls look
// like. Presentation is asked only by the chart's own controls: with `refused: 'hide'` a control
// whose command, tool or indicator the policy refuses is not drawn, where by default it is drawn
// disabled. Neither answer is stored. Each is asked again whenever a control is drawn or synced, so
// a policy that follows the host's session moves the controls with it, and nothing the viewer saved
// (a favorite, a drawing, an indicator) is rewritten because a control is not drawn.
import type { AccessPolicy, IndicatorDefinition } from './options'

/** The values `AccessPolicy.refused` takes. */
const REFUSED_PRESENTATIONS = ['disable', 'hide'] as const

/** A setup error for a `refused` the chart does not take, thrown before anything mounts. */
export function validateAccess(access: AccessPolicy | undefined): void {
  if (access === undefined || access === null || typeof access !== 'object') return
  const refused: unknown = (access as { refused?: unknown }).refused
  if (refused === undefined) return
  if (typeof refused !== 'string' || !(REFUSED_PRESENTATIONS as readonly string[]).includes(refused)) {
    throw new TypeError(`access.refused ${JSON.stringify(refused) ?? String(refused)} is not one of ${REFUSED_PRESENTATIONS.join(', ')}`)
  }
}

/** Whether the chart's own controls leave out what the policy refuses, rather than drawing it
 *  disabled. Read live, as the predicates are. */
function hidesRefused(access: AccessPolicy | undefined): boolean {
  return access?.refused === 'hide'
}

/** Whether the policy permits a command id. A predicate that throws refuses: the chart never
 *  resolves an error in the host's favor. */
export function commandPermitted(access: AccessPolicy | undefined, id: string): boolean {
  const allow = access?.command
  if (!allow) return true
  try {
    return allow.call(access, id) !== false
  } catch {
    return false
  }
}

/** Whether the policy permits arming a drawing tool. Null is the cursor, which is never refused. */
export function drawingToolPermitted(access: AccessPolicy | undefined, tool: string | null): boolean {
  const allow = access?.drawingTool
  if (tool === null || !allow) return true
  try {
    return allow.call(access, tool) !== false
  } catch {
    return false
  }
}

/** Whether the policy permits a definition. The predicate is asked ONE id from every door, the
 *  definition's own (`manifest.id`; a built-in's is the catalog id the picker lists), never the
 *  instance id a host or the picker minted. A definition that declares no id cannot be refused by
 *  name and is permitted. */
export function indicatorPermitted(access: AccessPolicy | undefined, definition: IndicatorDefinition): boolean {
  const id = definition.manifest.id
  const allow = access?.indicator
  if (!allow || id === undefined) return true
  try {
    return allow.call(access, id) !== false
  } catch {
    return false
  }
}

/** Whether the chart's own controls draw a control for this command: always, unless the policy
 *  refuses the command and the host hides what it refuses. A command that is permitted but cannot
 *  run now (nothing to undo, no bars loaded) is drawn, disabled. */
export function commandShown(access: AccessPolicy | undefined, id: string): boolean {
  return !hidesRefused(access) || commandPermitted(access, id)
}

/** Whether the chart's own controls draw a drawing tool: in the rail's flyouts, as a group's face,
 *  on the favorites bar and in the glyph picker. */
export function drawingToolShown(access: AccessPolicy | undefined, tool: string): boolean {
  return !hidesRefused(access) || drawingToolPermitted(access, tool)
}

/** Whether the indicator picker lists a definition. */
export function indicatorShown(access: AccessPolicy | undefined, definition: IndicatorDefinition): boolean {
  return !hidesRefused(access) || indicatorPermitted(access, definition)
}
