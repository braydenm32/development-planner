import { describe, expect, it } from 'vitest'
import { exifDate, exifOffset, pictureKind, readPhotoFacts } from '../exif'
import { fakeJpeg, fakePng, fakeWebp, type FakeExif } from './exifFixture'

// Made-up numbers: a place in the ocean off the coast, not anyone's block.
const FACTS: FakeExif = { focal35: 26, focal: 5.1, taken: '2026:03:14 15:30:12', offset: '+11:00', lat: -34.5, lon: 151.25, facing: 212.5 }

describe('reading what a photo says about itself', () => {
  it('reads the lens, the time and where it pointed from a JPEG, either byte order', () => {
    for (const le of [true, false]) {
      const f = readPhotoFacts(fakeJpeg(FACTS, le))
      expect(f.focal35).toBe(26)
      expect(f.focal).toBeCloseTo(5.1, 3)
      expect(f.taken).toBe('2026-03-14T15:30:12')
      expect(f.offset).toBe(660)
      expect(f.gps!.lat).toBeCloseTo(-34.5, 5)
      expect(f.gps!.lon).toBeCloseTo(151.25, 5)
      expect(f.facing).toEqual({ deg: 212.5, north: 'true' })
    }
  })

  it('reads the same from a PNG and a WebP', () => {
    for (const bytes of [fakePng(FACTS), fakeWebp(FACTS)]) {
      const f = readPhotoFacts(bytes)
      expect(f.focal35).toBe(26)
      expect(f.taken).toBe('2026-03-14T15:30:12')
    }
  })

  it('says nothing for a photo with no details, or broken ones', () => {
    expect(readPhotoFacts(fakeJpeg({}))).toMatchObject({ focal35: null, taken: null, gps: null, facing: null })
    expect(readPhotoFacts(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2]))).toMatchObject({ focal35: null })
    expect(readPhotoFacts(new Uint8Array(0)).gps).toBeNull()
    // Junk after a good start is ignored, never thrown.
    const junk = fakeJpeg(FACTS)
    junk.fill(0xee, 40, 80)
    expect(() => readPhotoFacts(junk)).not.toThrow()
  })

  it('leaves out a position of 0, 0 (a phone that had not found itself) and keeps magnetic north as such', () => {
    const f = readPhotoFacts(fakeJpeg({ lat: 0, lon: 0, facing: 90, facingRef: 'M' }))
    expect(f.gps).toBeNull()
    expect(f.facing).toEqual({ deg: 90, north: 'magnetic' })
  })

  it('knows a HEIC photo from its first bytes', () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map(c => c.charCodeAt(0)), 0, 0, 0, 0])
    expect(pictureKind(heic)).toBe('heic')
    expect(pictureKind(fakeJpeg({}))).toBe('jpeg')
    expect(pictureKind(fakePng({}))).toBe('png')
    expect(pictureKind(fakeWebp({}))).toBe('webp')
  })

  it('reads dates and time zones as written', () => {
    expect(exifDate('2026:11:27 07:05:00')).toBe('2026-11-27T07:05:00')
    expect(exifDate('0000:00:00 00:00:00')).toBeNull()
    expect(exifOffset('-03:30')).toBe(-210)
    expect(exifOffset('bad')).toBeNull()
  })
})
