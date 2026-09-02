// The image rules behind the drawing asset port. They decide whether a picked file is USABLE, and
// the failure they replaced was a silent drop, so a refusal must carry a code a host can turn into
// a sentence a trader can act on.
import { describe, expect, it } from 'vitest'
import {
  checkImageFile,
  fitScale,
  fittedSize,
  IMAGE_ACCEPT,
  IMAGE_ERROR_MESSAGES,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_EDGE,
  IMAGE_TYPES,
} from '../../src/drawings/index'

const MB = 1024 * 1024

describe('what the Image tool accepts', () => {
  it('takes JPG and PNG', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 500_000 })).toBeNull()
    expect(checkImageFile({ type: 'image/png', size: 500_000 })).toBeNull()
  })

  it('refuses every other format, WEBP included', () => {
    for (const type of ['image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', ''])
      expect(checkImageFile({ type, size: 1000 })?.error, type).toBe('wrong-type')
    expect(IMAGE_ACCEPT).toBe('image/jpeg,image/png')
    expect([...IMAGE_TYPES]).toEqual(['image/jpeg', 'image/png'])
  })

  it('refuses over the byte cap and hands back the SIZE, because a silent drop reads as a broken tool', () => {
    const bad = checkImageFile({ type: 'image/png', size: 3 * MB })
    expect(bad?.error).toBe('too-large')
    expect(bad?.bytes).toBe(3 * MB)
  })

  it('accepts a file sitting exactly on the limit', () => {
    expect(checkImageFile({ type: 'image/png', size: IMAGE_MAX_BYTES })).toBeNull()
    expect(checkImageFile({ type: 'image/png', size: IMAGE_MAX_BYTES + 1 })).not.toBeNull()
  })

  it('names a catalog message for every code, so no host writes the sentence itself', () => {
    expect(Object.keys(IMAGE_ERROR_MESSAGES).sort()).toEqual(['too-large', 'undecodable', 'unreadable', 'wrong-type'])
    for (const key of Object.values(IMAGE_ERROR_MESSAGES)) expect(key).toMatch(/^drawing\./)
  })
})

describe('fitting inside the resolution cap', () => {
  it('leaves an image that already fits completely alone', () => {
    expect(fitScale(800, 600)).toBe(1)
    expect(fitScale(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE)).toBe(1)
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales by the LONGEST edge, so neither side can exceed the cap', () => {
    expect(fitScale(4000, 1000)).toBe(0.5)
    expect(fitScale(1000, 4000)).toBe(0.5)
    expect(fittedSize(6000, 3000)).toEqual({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE / 2 })
  })

  it('never rounds a side away to nothing', () => {
    expect(fittedSize(20000, 3).height).toBe(1)
  })
})
