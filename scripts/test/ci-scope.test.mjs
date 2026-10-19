import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordsOnly, changedPaths } from '../ci-scope.mjs'

test('only versioned release records skip product checks', () => {
  assert.equal(recordsOnly(['releases/5.0.1.json']), true)
  assert.equal(recordsOnly(['releases/5.0.1.json', 'releases/5.0.0.json']), true)
  for (const paths of [null, [], ['src/index.ts'], ['releases/README.md'], ['releases/x.json'], ['releases/5.0.1.json','package.json'], ['releases/5.0.1.json','.github/workflows/ci.yml'], ['releases/../package.json']]) assert.equal(recordsOnly(paths), false)
})

test('PR scope uses the whole base diff and missing history fails closed', () => {
  const dir=mkdtempSync(join(tmpdir(),'quickcharts-ci-event-'));const file=join(dir,'event.json');const sha='a'.repeat(40)
  try {
    writeFileSync(file,JSON.stringify({pull_request:{base:{sha}},before:'b'.repeat(40)}))
    const env={GITHUB_EVENT_PATH:file,GITHUB_EVENT_NAME:'pull_request'}
    assert.deepEqual(changedPaths(env,(base,head)=>{assert.equal(base,sha);assert.equal(head,'HEAD');return 'releases/5.0.1.json\0src/index.ts\0'}),['releases/5.0.1.json','src/index.ts'])
    assert.equal(changedPaths(env,()=>null),null)
    writeFileSync(file,JSON.stringify({before:'0'.repeat(40)}))
    assert.equal(changedPaths({...env,GITHUB_EVENT_NAME:'push'},()=>{throw Error('must not diff')}),null)
    writeFileSync(file,'invalid');assert.equal(changedPaths(env,()=>''),null)
  } finally { unlinkSync(file);rmdirSync(dir) }
})
