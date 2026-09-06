import { defineConfig } from 'vitest/config'

// Unit tests live in `test/` beside the source they cover, and the repository checks under
// `scripts/` prove themselves in `scripts/test/`.
export default defineConfig({
  test: { include: ['test/**/*.test.ts', 'scripts/test/**/*.test.ts'] },
})
