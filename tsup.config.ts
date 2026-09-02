// The quickcharts build. One ESM artifact with declarations and source maps; lightweight-charts
// stays the consumer's peer, and the two internal source seams (drawings, indicators) are bundled
// INTO the artifact rather than shipped as dependencies: a consumer installs quickcharts and
// nothing else of ours. `entry` is keyed so a further entrypoint (the drawings subpath) is one
// more key, not a second config.
import { defineConfig } from 'tsup'

/** The internal seams: bundled into the JavaScript (`noExternal`) and into the declarations,
 *  so neither name survives in what a consumer installs. The declaration build reaches each seam
 *  through a `paths` mapping to its source rather than through node_modules: a workspace link
 *  found under node_modules reads as an external library to the declaration bundler, and its
 *  name would survive as an import in dist/index.d.ts. */
const SEAMS = ['@trdrs/chart-drawings', '@trdrs/chart-indicators']
const SEAM_SOURCES = Object.fromEntries(SEAMS.map((name) => [name, [`../${name.slice('@trdrs/'.length)}/src/index.ts`]]))

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: { compilerOptions: { paths: SEAM_SOURCES } },
  sourcemap: true,
  clean: true,
  external: ['lightweight-charts'],
  noExternal: SEAMS,
})
