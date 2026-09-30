// Who owns Escape when overlays nest. A menu, a dialog, a drawing popover and the color panel a
// row expands each bind Escape on the document in the capture phase, so without an order the
// outermost surface would win and a nested panel could never be dismissed on its own. Every
// surface that closes on Escape registers here on open and releases on close; only the surface at
// the top of the stack, the innermost one open, acts on the press. The stack is module state with
// no public API: it is the package's own overlay contract, not a host capability.

const stack: object[] = []

/** Register a surface as an Escape owner. Returns the release, which its close runs. */
export function pushEscapeOwner(): { token: object; release(): void } {
  const token = {}
  stack.push(token)
  return {
    token,
    release() {
      const at = stack.indexOf(token)
      if (at >= 0) stack.splice(at, 1)
    },
  }
}

/** Whether this token is the innermost open surface, and therefore the one Escape belongs to. */
export function ownsEscape(token: object): boolean {
  return stack.length === 0 || stack[stack.length - 1] === token
}
