// The one line ending the bundler reads.
//
// Git hands a Windows checkout CRLF source files and a Linux checkout LF ones, and esbuild names
// every shared and dynamic chunk after a hash of the bytes it read. One commit therefore built two
// different dists: the locale chunk was `ar-XYEYU6VD.js` on one machine and `ar-FHCG6QP4.js` on the
// other, the three shared chunks were renamed the same way, and every entry that imports them
// carried the other machine's specifiers. Only the names moved, which is why the source maps, whose
// sources the pack already normalizes, matched byte for byte while the JavaScript beside them did
// not.
//
// Reading every TypeScript source through this loader strips the checkout's carriage returns before
// the bundler hashes anything, so the chunk names and the JavaScript are the same on either
// platform. Nothing else in the bundle carries a checkout's line endings: the sources are
// TypeScript alone, and node_modules is written by the package manager from published tarballs.
// Stripping is safe to do this late because a carriage return only ever reaches the output inside a
// template literal, where the language already reads CRLF as a single line feed.
import { readFile } from 'node:fs/promises'

/** @type {import('esbuild').Plugin} */
export const lfSources = {
  name: 'lf-sources',
  setup(build) {
    build.onLoad({ filter: /\.[cm]?tsx?$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace(/\r\n/g, '\n'),
      loader: path.endsWith('.tsx') ? 'tsx' : 'ts',
    }))
  },
}
