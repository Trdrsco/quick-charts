import { describe, expect, it } from 'vitest'
import { validateIdentity, verifyArtifact } from '../release-policy.mjs'

const digest = 'a'.repeat(64)
const valid = { ref: 'refs/tags/v1.0.0', version: '1.0.0', digest, evidence: 'https://example.com/accepted-run' }
describe('release policy', () => {
  it('accepts an exact stable tag and an identified first-host record', () => {
    expect(() => validateIdentity(valid)).not.toThrow()
  })
  it.each([
    { ref: 'refs/heads/main' }, { ref: 'refs/tags/v0.1.0' }, { version: '1.0.0-rc.1' },
    { digest: '' }, { digest: 'not-a-digest' }, { evidence: 'http://example.com/check' },
    { evidence: 'https://user:secret@example.com/check' },
  ])('refuses an invalid release identity: %j', (change) => {
    expect(() => validateIdentity({ ...valid, ...change })).toThrow()
  })
  it('refuses bytes different from the first-host candidate', () => {
    expect(() => verifyArtifact(Buffer.from('different'), digest)).toThrow(/differs/)
    expect(verifyArtifact(Buffer.from('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toHaveLength(64)
  })
})
