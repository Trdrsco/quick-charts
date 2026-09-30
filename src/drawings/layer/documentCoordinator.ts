import { drawingContextKey, type DrawingResourceContext, type DrawingsBody } from '../document'

type Listener = (document: DrawingsBody) => void
const peers = new Map<string, Map<object, Listener>>()

/** Package-private live fanout for mounted layers sharing one exact drawing-resource context. */
export const drawingDocumentCoordinator = {
  join(context: DrawingResourceContext, owner: object, listener: Listener): () => void {
    const key = drawingContextKey(context)
    const group = peers.get(key) ?? new Map<object, Listener>()
    group.set(owner, listener)
    peers.set(key, group)
    return () => {
      const current = peers.get(key)
      current?.delete(owner)
      if (current?.size === 0) peers.delete(key)
    }
  },
  publish(context: DrawingResourceContext, owner: object, document: DrawingsBody): void {
    const group = peers.get(drawingContextKey(context))
    if (!group) return
    for (const [peer, receive] of group) if (peer !== owner) receive(document)
  },
}
