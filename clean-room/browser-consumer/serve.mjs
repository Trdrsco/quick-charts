import { build, preview } from 'vite'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
await build({ root, configFile: false, logLevel: 'warn', build: { emptyOutDir: true } })
await preview({ root, configFile: false, preview: { host: '127.0.0.1', port: 5298, strictPort: true } })
