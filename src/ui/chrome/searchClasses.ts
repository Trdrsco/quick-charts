// The symbol search's class filter as a model, apart from the chips that draw it: the two levels of
// classes a strip offers, which of them the viewer has selected, and the filter the feed is searched
// with. One class at a time or several, the feed always hears the most specific classes selected: a
// child where one is picked, its parent where none is.
import type { SearchClassNode } from '../../datafeed'
import type { SearchClassFilter } from '../../search'

/** One top-level class and the narrower classes offered beneath it once it is selected. */
export interface ClassBranch {
  readonly id: string
  readonly children: readonly string[]
}

const tokenOf = (entry: string | SearchClassNode): string => (typeof entry === 'string' ? entry : entry.id)

/** Each token once, first place kept, and never the empty token, which is every class. */
function tokens(entries: readonly (string | SearchClassNode)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of entries) {
    const id = tokenOf(entry)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** The two levels a strip renders from a feed's declared classes. A child's own children are not
 *  offered: the child narrows by its token alone. */
export function classBranches(classes: readonly (string | SearchClassNode)[]): ClassBranch[] {
  const ids = tokens(classes)
  return ids.map((id) => {
    const node = classes.find((entry) => tokenOf(entry) === id)
    return { id, children: node && typeof node !== 'string' ? tokens(node.children ?? []) : [] }
  })
}

export interface ClassSelection {
  /** No class is selected: the search covers every class. */
  isAll(): boolean
  /** The top-level class is selected. */
  has(id: string): boolean
  /** A child of the top-level class is picked. */
  hasChild(top: string, child: string): boolean
  /** Some child of the top-level class is picked. */
  narrowed(top: string): boolean
  /** The All chip: every class. */
  clear(): void
  /** A top-level chip. One at a time it selects the class, keeping a class already selected as it
   *  is; several at a time it toggles the class, and a class turned off drops its children. */
  pickTop(id: string): void
  /** A class's own all chip: the whole class, no child picked. */
  clearChildren(top: string): void
  /** A child chip. One at a time it narrows the class to that child; several at a time it toggles
   *  the child. */
  pickChild(top: string, child: string): void
  /** What the feed is searched with: the most specific classes selected, in declared order. */
  filter(): SearchClassFilter
}

/** Whether a row whose class is `type` belongs under a filter, for the rows the dialog lists without
 *  asking the feed, such as recent picks. Every class admits any row. Otherwise the row's class is
 *  one the filter names, or a narrower class offered beneath a top-level class it names. A row whose
 *  class is the parent of a child the filter names stays out: its class does not say it is the child. */
export function classAdmits(branches: readonly ClassBranch[], filter: SearchClassFilter, type: string): boolean {
  const named = typeof filter === 'string' ? (filter ? [filter] : []) : filter
  if (named.length === 0) return true
  return named.some((id) => id === type || (branches.find((b) => b.id === id)?.children.includes(type) ?? false))
}

/** The selection over a strip's branches. One class at a time with no All chip starts on the first
 *  class, because a choice of one with nothing to stand for every class always holds one. */
export function classSelection(branches: readonly ClassBranch[], options: { multiple: boolean; all: boolean }): ClassSelection {
  const tops = new Set<string>()
  const picked = new Map<string, Set<string>>()
  const known = new Set(branches.map((b) => b.id))
  if (!options.multiple && !options.all && branches[0]) tops.add(branches[0].id)
  const branchOf = (id: string): ClassBranch | undefined => branches.find((b) => b.id === id)
  return {
    isAll: () => tops.size === 0,
    has: (id) => tops.has(id),
    hasChild: (top, child) => picked.get(top)?.has(child) ?? false,
    narrowed: (top) => (picked.get(top)?.size ?? 0) > 0,
    clear() {
      tops.clear()
      picked.clear()
    },
    pickTop(id) {
      if (!known.has(id)) return
      if (options.multiple) {
        if (tops.has(id)) {
          tops.delete(id)
          picked.delete(id)
        } else tops.add(id)
      } else if (!tops.has(id)) {
        tops.clear()
        picked.clear()
        tops.add(id)
      }
    },
    clearChildren(top) {
      picked.delete(top)
    },
    pickChild(top, child) {
      if (!tops.has(top) || !branchOf(top)?.children.includes(child)) return
      if (!options.multiple) {
        picked.set(top, new Set([child]))
        return
      }
      const set = picked.get(top) ?? new Set<string>()
      if (set.has(child)) set.delete(child)
      else set.add(child)
      if (set.size > 0) picked.set(top, set)
      else picked.delete(top)
    },
    filter() {
      const out: string[] = []
      for (const branch of branches) {
        if (!tops.has(branch.id)) continue
        const children = picked.get(branch.id)
        if (children && children.size > 0) out.push(...branch.children.filter((c) => children.has(c)))
        else out.push(branch.id)
      }
      return options.multiple ? out : (out[0] ?? '')
    },
  }
}
