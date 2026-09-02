/** Two fixtures read files as bytes: the theme fixtures read the authored and generated
 *  stylesheets, and the boundary reader reads the packed stylesheet. Vitest does not process CSS,
 *  so a `?raw` import of a stylesheet arrives empty and the file has to be read directly. This
 *  package is browser-typed on purpose (no node types reach its surface), so the two node builtins
 *  the fixtures call are declared here, as narrowly as the calls, rather than by widening the
 *  package's type environment. Vitest runs on node, where they are real. */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function existsSync(path: string): boolean
}
