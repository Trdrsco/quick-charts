#!/usr/bin/env node
// The REST wire contract as a published document.
//
//   dist/rest-openapi.json   the schema a service author implements so that
//                            `createRestSaveLoadAdapter` from `quickcharts/adapters/rest` can drive
//                            it: the four collections, their payloads, the `If-Match` rule and the
//                            three refusals
//
// It runs from `pnpm --filter quickcharts build:rest-openapi`, and `postbuild` runs it for every
// build, so the packed artifact never carries a schema older than the adapter beside it. The
// document is RENDERED from the typed contract in src/adapters/rest/wire.ts rather than written by
// hand, which is what makes it impossible to document a path, a status or a field the adapter does
// not use;
// test/adapters/openapi.test.ts compares the committed artifact with the same rendering and fails
// on drift.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { restOpenApiDocument } from '../src/adapters/rest/openapi.ts'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(pkgRoot, 'dist', 'rest-openapi.json')

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(restOpenApiDocument(), null, 2)}\n`)

console.log(`quickcharts: wrote ${out.replace(pkgRoot, '.')}`)
