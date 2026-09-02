/** Vite's `?raw` suffix imports a file's contents as a string. Declared here because this package
 *  is browser-typed (no node types), and the README doctest reads the README through Vite rather
 *  than fs. */
declare module '*?raw' {
  const contents: string
  export default contents
}
