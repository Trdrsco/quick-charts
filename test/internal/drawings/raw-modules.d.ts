/** Vite's `?raw` suffix imports a file's contents as a string, and `import.meta.glob` is Vite's
 *  own build-time glob. Declared here because this package is browser-typed (no node types), and
 *  the seam-boundary sweep reads sources through Vite rather than fs. */
declare module '*?raw' {
  const contents: string
  export default contents
}

interface ImportMeta {
  glob(pattern: string, options: { query: string; import: string; eager: true }): Record<string, string>
}
