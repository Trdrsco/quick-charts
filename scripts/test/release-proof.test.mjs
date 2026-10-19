import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { producerRunId, verifyProducer, candidateArtifact, verifyCandidate } from '../release-proof.mjs'

const repository = 'example/charts'
const record = { releaseCommit: 'a'.repeat(40) }
const base = () => ({ repository, record, paths: ['releases/5.0.1.json'], workflow: { id: 1, path: '.github/workflows/ci.yml' }, run: { status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', head_sha: record.releaseCommit, head_repository: { full_name: repository }, workflow_id: 1 }, jobs: ['checks','tests (1)','tests (2)','tests (3)','browser','gate'].map(name => ({ name, status: 'completed', conclusion: 'success' })) })

test('producer identity refuses foreign runs and malformed URLs', () => {
  assert.equal(producerRunId('https://github.com/example/charts/actions/runs/123', repository), '123')
  for (const url of ['https://github.com/other/charts/actions/runs/123','https://github.com/example/charts/actions/runs/123?x=1','https://github.com/example/charts/actions/runs/../123',null]) assert.throws(() => producerRunId(url, repository))
})
test('only complete main CI on unchanged accepted source can be reused', () => {
  assert.doesNotThrow(() => verifyProducer(base()))
  assert.doesNotThrow(() => verifyProducer({ ...base(), paths: [] }))
  for (const patch of [{ conclusion:'failure' },{ status:'in_progress' },{ event:'pull_request' },{ head_branch:'feature' },{ head_sha:'b'.repeat(40) },{ workflow_id:2 },{ head_repository:{ full_name:'other/charts' } }]) assert.throws(() => verifyProducer({ ...base(), run:{ ...base().run,...patch } }))
  for (const path of ['src/index.ts','package.json','pnpm-lock.yaml','test/example.test.ts','.github/workflows/ci.yml','scripts/release-proof.mjs','README.md']) assert.throws(() => verifyProducer({ ...base(), paths:[path] }))
  assert.throws(() => verifyProducer({ ...base(), paths:null }))
  assert.throws(() => verifyProducer({ ...base(), workflow:{ id:1,path:'.github/workflows/other.yml' } }))
  for (const job of base().jobs) {
    assert.throws(() => verifyProducer({ ...base(), jobs:base().jobs.filter(j => j.name!==job.name) }))
    for (const conclusion of ['failure','skipped','cancelled']) assert.throws(() => verifyProducer({ ...base(), jobs:base().jobs.map(j => j.name===job.name ? {...j,conclusion} :j) }))
  }
})
test('candidate must belong to the proven run and remain available', () => {
  const artifact = { id:2,name:'quickcharts-candidate',expired:false,workflow_run:{id:123,head_sha:record.releaseCommit} }
  assert.equal(candidateArtifact([artifact], '123',record.releaseCommit),artifact)
  for (const artifacts of [[],[{...artifact,expired:true}],[{...artifact,workflow_run:{id:124,head_sha:record.releaseCommit}}],[{...artifact,workflow_run:{id:123,head_sha:'b'.repeat(40)}}],[artifact,artifact]]) assert.throws(() => candidateArtifact(artifacts,'123',record.releaseCommit))
})
test('accepted digest binds the downloaded bytes and manifest', () => {
  const bytes=Buffer.from('accepted candidate');const sha256=createHash('sha256').update(bytes).digest('hex');const record={tarballSha256:sha256,tarStreamSha256:'b'.repeat(64)};const manifest={tarball:{sha256,tarSha256:record.tarStreamSha256}}
  assert.doesNotThrow(() => verifyCandidate({bytes,record,manifest}))
  assert.throws(() => verifyCandidate({bytes:Buffer.from('different'),record,manifest}))
  assert.throws(() => verifyCandidate({bytes,record,manifest:{tarball:{...manifest.tarball,sha256:'c'.repeat(64)}}}))
  assert.throws(() => verifyCandidate({bytes,record,manifest:{tarball:{...manifest.tarball,tarSha256:'c'.repeat(64)}}}))
})
