// The drawings STORE codec, as a consumer meets it.
//
// One JSON document per surface holding every symbol's serialized drawings. The codec is total in
// both directions: parsing tolerates anything (malformed JSON, a non-object root, a junk bucket
// reads as the empty store or a dropped bucket, never a throw) and serializing drops empty buckets
// so a document never accumulates dead symbol keys. That is what lets a host hand the chart
// whatever a backend returned without guarding it first.
//
// `restoreDrawings` is wrapped rather than re-exported so its result is typed as the public
// `IDrawing`, not the library's internal drawing class.
import {
  parseDrawingsStore as parseStore,
  restoreDrawings as restoreAll,
  serializeDrawingsStore as serializeStore,
  type IDrawing,
  type SerializedDrawing,
} from '@trdrs/chart-drawings'

export { parseStore as parseDrawingsStore, serializeStore as serializeDrawingsStore }

/** Rebuild live drawings from one symbol's serialized bucket. A row the catalog cannot restore (an
 *  unknown type, malformed anchors) is skipped, never a throw, so the rest of the bucket loads. */
export function restoreDrawings(list: readonly SerializedDrawing[]): IDrawing[] {
  return restoreAll(list)
}
