// Made-up EXIF for tests: a TIFF block written here byte by byte, wrapped as a JPEG, PNG or WebP
// would carry it. No real photo is used anywhere in the tests.

type Entry = { tag: number; type: 2; value: string } | { tag: number; type: 3 | 4; value: number[] } | { tag: number; type: 5; value: number[] }

export interface FakeExif {
  focal35?: number
  focal?: number
  taken?: string
  offset?: string
  lat?: number
  lon?: number
  facing?: number
  facingRef?: 'T' | 'M'
}

const rational = (x: number): [number, number] => [Math.round(x * 10000), 10000]
const dmsOf = (deg: number) => {
  const a = Math.abs(deg)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = (a - d - m / 60) * 3600
  return [d, m, s]
}

/** A TIFF block with IFD0, an Exif IFD and a GPS IFD. */
export function fakeTiff(f: FakeExif, littleEndian = true): Uint8Array {
  const exif: Entry[] = []
  if (f.focal !== undefined) exif.push({ tag: 0x920a, type: 5, value: [f.focal] })
  if (f.taken) exif.push({ tag: 0x9003, type: 2, value: f.taken })
  if (f.offset) exif.push({ tag: 0x9011, type: 2, value: f.offset })
  if (f.focal35 !== undefined) exif.push({ tag: 0xa405, type: 3, value: [f.focal35] })
  const gps: Entry[] = []
  if (f.lat !== undefined && f.lon !== undefined) {
    gps.push({ tag: 1, type: 2, value: f.lat < 0 ? 'S' : 'N' }, { tag: 2, type: 5, value: dmsOf(f.lat) })
    gps.push({ tag: 3, type: 2, value: f.lon < 0 ? 'W' : 'E' }, { tag: 4, type: 5, value: dmsOf(f.lon) })
  }
  if (f.facing !== undefined) gps.push({ tag: 0x10, type: 2, value: f.facingRef ?? 'T' }, { tag: 0x11, type: 5, value: [f.facing] })

  const buf = new Uint8Array(4096)
  const v = new DataView(buf.buffer)
  const le = littleEndian
  buf.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0)
  v.setUint16(2, 42, le)
  v.setUint32(4, 8, le)
  let free = 8
  const ifdSize = (n: number) => 2 + n * 12 + 4
  // IFD0 holds the two pointers; the sub-directories and their long values follow.
  const ifd0At = free
  free += ifdSize(2)
  const exifAt = free
  free += ifdSize(exif.length)
  const gpsAt = free
  free += ifdSize(gps.length)
  const write = (at: number, entries: Entry[]) => {
    v.setUint16(at, entries.length, le)
    entries.forEach((e, k) => {
      const p = at + 2 + k * 12
      v.setUint16(p, e.tag, le)
      v.setUint16(p + 2, e.type, le)
      let bytes: number[] = []
      let count = 0
      if (e.type === 2) {
        bytes = [...e.value].map(c => c.charCodeAt(0)).concat(0)
        count = bytes.length
      } else if (e.type === 3) {
        count = e.value.length
        const b = new DataView(new ArrayBuffer(count * 2))
        e.value.forEach((x, i) => b.setUint16(i * 2, x, le))
        bytes = [...new Uint8Array(b.buffer)]
      } else if (e.type === 4) {
        count = e.value.length
        const b = new DataView(new ArrayBuffer(count * 4))
        e.value.forEach((x, i) => b.setUint32(i * 4, x, le))
        bytes = [...new Uint8Array(b.buffer)]
      } else {
        count = e.value.length
        const b = new DataView(new ArrayBuffer(count * 8))
        e.value.forEach((x, i) => {
          const [n, d] = rational(x)
          b.setUint32(i * 8, n, le)
          b.setUint32(i * 8 + 4, d, le)
        })
        bytes = [...new Uint8Array(b.buffer)]
      }
      v.setUint32(p + 4, count, le)
      if (bytes.length <= 4) buf.set(bytes, p + 8)
      else {
        v.setUint32(p + 8, free, le)
        buf.set(bytes, free)
        free += bytes.length + (bytes.length & 1)
      }
    })
    v.setUint32(at + 2 + entries.length * 12, 0, le)
  }
  write(ifd0At, [
    { tag: 0x8769, type: 4, value: [exifAt] },
    { tag: 0x8825, type: 4, value: [gpsAt] },
  ])
  write(exifAt, exif)
  write(gpsAt, gps)
  return buf.slice(0, free)
}

/** The TIFF in a JPEG's APP1 block, after a JFIF block, then the start of (empty) picture data. */
export function fakeJpeg(f: FakeExif, littleEndian = true): Uint8Array {
  const tiff = fakeTiff(f, littleEndian)
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const len = tiff.length + 8
  const app1 = [0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...tiff, 0xff, 0xda, 0, 2, 0xff, 0xd9])
}

export function fakePng(f: FakeExif): Uint8Array {
  const tiff = fakeTiff(f)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const chunk = (type: string, body: Uint8Array) => {
    const n = body.length
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...[...type].map(c => c.charCodeAt(0)), ...body, 0, 0, 0, 0]
  }
  return new Uint8Array([...sig, ...chunk('IHDR', new Uint8Array(13)), ...chunk('eXIf', tiff), ...chunk('IEND', new Uint8Array(0))])
}

export function fakeWebp(f: FakeExif): Uint8Array {
  const tiff = fakeTiff(f)
  const body = [...[...'Exif'].map(c => c.charCodeAt(0)), 0, 0, ...tiff]
  const n = body.length
  const chunk = [...[...'EXIF'].map(c => c.charCodeAt(0)), n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff, ...body, ...(n & 1 ? [0] : [])]
  const total = 4 + chunk.length
  return new Uint8Array([...[...'RIFF'].map(c => c.charCodeAt(0)), total & 0xff, (total >> 8) & 0xff, (total >> 16) & 0xff, 0, ...[...'WEBP'].map(c => c.charCodeAt(0)), ...chunk])
}
