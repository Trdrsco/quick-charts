/** The boundary fixtures run exactly one subprocess: `npm pack --dry-run --json`, the file list a
 *  registry would receive. This package is browser-typed on purpose (no node types reach its
 *  surface), so the one node builtin the fixtures call is declared here, as narrowly as the call,
 *  rather than by widening the package's type environment. Vitest runs on node, where it is real. */
declare module 'node:child_process' {
  export function execSync(command: string, options: { cwd: string; encoding: 'utf8'; stdio: readonly ['ignore', 'pipe', 'ignore'] }): string
}
