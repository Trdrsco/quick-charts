// The persisted drawings STORE codec: one JSON document per surface holding every symbol's
// serialized drawings — `{ [symbol]: SerializedDrawing[] }`. This codec is the cross-surface
// compatibility contract: the trdrs app's chart panel and the @trdrs/chart widget host both
// persist through it, so a store written by one loads in the other and a saved store survives a
// host migration. Keep it boring and total: parsing tolerates anything (malformed JSON, a
// non-object root, a junk bucket → the empty store / a dropped bucket, never a throw), and
// serializing drops empty buckets so a store never accumulates dead symbol keys.
import { toolRegistry } from './registry'
import type { SerializedDrawing } from './core/types'
import type { AnyDrawing } from './core/drawing'

/** Parse a persisted store document. Total: malformed input is an EMPTY store, a non-array or
 *  empty bucket is dropped — a corrupt corner of the document never takes the healthy rest down. */
export function parseDrawingsStore(raw: string | null | undefined): Record<string, SerializedDrawing[]> {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, SerializedDrawing[]> = {}
    for (const [sym, bucket] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(bucket) && bucket.length > 0) out[sym] = bucket as SerializedDrawing[]
    }
    return out
  } catch {
    return {}
  }
}

/** Serialize a store document, dropping empty buckets. The inverse of {@link parseDrawingsStore}
 *  for every well-formed store: parse(serialize(m)) deep-equals m minus empty buckets. */
export function serializeDrawingsStore(map: Record<string, readonly SerializedDrawing[]>): string {
  const out: Record<string, readonly SerializedDrawing[]> = {}
  for (const [sym, bucket] of Object.entries(map)) {
    if (Array.isArray(bucket) && bucket.length > 0) out[sym] = bucket
  }
  return JSON.stringify(out)
}

/** Rebuild live drawings from one symbol's serialized bucket through the tool registry. A row the
 *  registry cannot restore (an unknown type, malformed anchors) is skipped, never a throw — the
 *  rest of the bucket still loads. */
export function restoreDrawings(list: readonly SerializedDrawing[]): AnyDrawing[] {
  const out: AnyDrawing[] = []
  for (const d of list) {
    const obj = toolRegistry.restore(d)
    if (obj) out.push(obj)
  }
  return out
}
