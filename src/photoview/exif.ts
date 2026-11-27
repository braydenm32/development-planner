// A small reader for what a photo says about itself (EXIF): the lens, the time it was taken, and
// where and which way the phone was pointing. Written by hand so nothing new is installed; it reads
// only the few tags the photo view uses and gives up quietly on anything it doesn't understand.
// JPEG keeps EXIF in an APP1 block, PNG in an eXIf chunk and WebP in an EXIF chunk; all three hold
// the same TIFF structure.

export interface PhotoFacts {
  /** The lens in 35 mm film terms (mm), when the photo says. */
  focal35: number | null
  /** The real focal length (mm); with no 35 mm figure it says little on its own. */
  focal: number | null
  /** When it was taken, as the camera's clock read it: "2026-11-27T14:05:09". */
  taken: string | null
  /** The camera's time zone then, in minutes ahead of UTC (+11:00 → 660), when the photo says. */
  offset: number | null
  /** Where it was taken (degrees, south and west negative). */
  gps: { lat: number; lon: number } | null
  /** Which way the camera faced, degrees clockwise from north, and from which north. */
  facing: { deg: number; north: 'true' | 'magnetic' } | null
}

export const NO_FACTS: PhotoFacts = { focal35: null, focal: null, taken: null, offset: null, gps: null, facing: null }

/** What kind of picture the bytes are, from their first few. */
export function pictureKind(b: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heic' | 'other' {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  // HEIC and HEIF: an ISO box "ftyp" with an HEIF brand.
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp' && /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif)$/.test(ascii(b, 8, 4))) return 'heic'
  return 'other'
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = ''
  for (let i = 0; i < n && at + i < b.length; i++) s += String.fromCharCode(b[at + i])
  return s
}

/** The TIFF block holding the EXIF, wherever the file format keeps it; null when there is none. */
export function findTiff(b: Uint8Array): Uint8Array | null {
  const kind = pictureKind(b)
  if (kind === 'jpeg') {
    let i = 2
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      // Start of the picture data: no more header blocks.
      if (marker === 0xda || marker === 0xd9) return null
      const len = (b[i + 2] << 8) | b[i + 3]
      if (len < 2) return null
      if (marker === 0xe1 && ascii(b, i + 4, 4) === 'Exif' && b[i + 8] === 0 && b[i + 9] === 0) return b.subarray(i + 10, Math.min(b.length, i + 2 + len))
      i += 2 + len
    }
    return null
  }
  if (kind === 'png') {
    let i = 8
    while (i + 12 <= b.length) {
      const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
      const type = ascii(b, i + 4, 4)
      if (type === 'eXIf') return b.subarray(i + 8, Math.min(b.length, i + 8 + len))
      if (type === 'IDAT' || type === 'IEND') return null
      i += 12 + len
    }
    return null
  }
  if (kind === 'webp') {
    let i = 12
    while (i + 8 <= b.length) {
      const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0
      if (ascii(b, i, 4) === 'EXIF') {
        const body = b.subarray(i + 8, Math.min(b.length, i + 8 + len))
        // Some writers keep JPEG's "Exif\0\0" in front.
        return ascii(body, 0, 4) === 'Exif' ? body.subarray(6) : body
      }
      i += 8 + len + (len & 1)
    }
  }
  return null
}

/** Byte sizes of the TIFF value types the reader knows. */
const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

type Value = number[] | string

/** One directory's entries, by tag, read as numbers or text. */
function readIfd(t: DataView, at: number, le: boolean): { tags: Map<number, Value>; next: number } {
  const tags = new Map<number, Value>()
  if (at < 8 || at + 2 > t.byteLength) return { tags, next: 0 }
  const n = t.getUint16(at, le)
  for (let k = 0; k < n; k++) {
    const e = at + 2 + k * 12
    if (e + 12 > t.byteLength) break
    const tag = t.getUint16(e, le)
    const type = t.getUint16(e + 2, le)
    const count = t.getUint32(e + 4, le)
    const size = SIZE[type]
    if (!size || count > 1 << 16) continue
    const bytes = size * count
    const off = bytes <= 4 ? e + 8 : t.getUint32(e + 8, le)
    if (off + bytes > t.byteLength) continue
    if (type === 2) {
      let s = ''
      for (let i = 0; i < count; i++) {
        const c = t.getUint8(off + i)
        if (!c) break
        s += String.fromCharCode(c)
      }
      tags.set(tag, s)
      continue
    }
    const vals: number[] = []
    for (let i = 0; i < count && i < 16; i++) {
      const p = off + i * size
      if (type === 1 || type === 7) vals.push(t.getUint8(p))
      else if (type === 3) vals.push(t.getUint16(p, le))
      else if (type === 4) vals.push(t.getUint32(p, le))
      else if (type === 9) vals.push(t.getInt32(p, le))
      else if (type === 5) {
        const d = t.getUint32(p + 4, le)
        vals.push(d ? t.getUint32(p, le) / d : NaN)
      } else if (type === 10) {
        const d = t.getInt32(p + 4, le)
        vals.push(d ? t.getInt32(p, le) / d : NaN)
      }
    }
    tags.set(tag, vals)
  }
  const end = at + 2 + n * 12
  return { tags, next: end + 4 <= t.byteLength ? t.getUint32(end, le) : 0 }
}

const num = (v: Value | undefined, i = 0): number | null => (Array.isArray(v) && Number.isFinite(v[i]) ? v[i] : null)
const text = (v: Value | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** "2026:11:27 14:05:09" → "2026-11-27T14:05:09"; null for a blank or broken one. */
export function exifDate(s: string | null): string | null {
  const m = s?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m || m[1] === '0000') return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`
}

/** "+11:00" → 660, "-03:30" → -210. */
export function exifOffset(s: string | null): number | null {
  const m = s?.match(/^([+-])(\d{2}):(\d{2})$/)
  if (!m) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** Degrees, minutes and seconds to degrees, south or west negative. */
function dms(v: Value | undefined, ref: string | null, neg: string): number | null {
  const d = num(v, 0)
  const m = num(v, 1) ?? 0
  const s = num(v, 2) ?? 0
  if (d === null) return null
  const deg = d + m / 60 + s / 3600
  return ref?.toUpperCase().startsWith(neg) ? -deg : deg
}

/** What the photo says about itself; all null when it says nothing (or nothing that can be read). */
export function readPhotoFacts(bytes: Uint8Array): PhotoFacts {
  const tiff = findTiff(bytes)
  if (!tiff || tiff.length < 8) return NO_FACTS
  try {
    const t = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
    const order = ascii(tiff, 0, 2)
    if (order !== 'II' && order !== 'MM') return NO_FACTS
    const le = order === 'II'
    if (t.getUint16(2, le) !== 42) return NO_FACTS
    const ifd0 = readIfd(t, t.getUint32(4, le), le).tags
    const exifAt = num(ifd0.get(0x8769))
    const gpsAt = num(ifd0.get(0x8825))
    const exif = exifAt ? readIfd(t, exifAt, le).tags : new Map<number, Value>()
    const gps = gpsAt ? readIfd(t, gpsAt, le).tags : new Map<number, Value>()

    const focal35 = num(exif.get(0xa405))
    const focal = num(exif.get(0x920a))
    const taken = exifDate(text(exif.get(0x9003)) ?? text(ifd0.get(0x0132)))
    const offset = exifOffset(text(exif.get(0x9011)) ?? text(exif.get(0x9010)))
    const lat = dms(gps.get(2), text(gps.get(1)), 'S')
    const lon = dms(gps.get(4), text(gps.get(3)), 'W')
    const dir = num(gps.get(0x11))
    const dirRef = text(gps.get(0x10))
    return {
      focal35: focal35 && focal35 > 0 ? focal35 : null,
      focal: focal && focal > 0 ? focal : null,
      taken,
      offset,
      // 0, 0 is a phone that hadn't found itself yet.
      gps: lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { lat, lon } : null,
      facing: dir !== null && dir >= 0 && dir <= 360 ? { deg: dir % 360, north: dirRef?.toUpperCase() === 'M' ? 'magnetic' : 'true' } : null,
    }
  } catch {
    return NO_FACTS
  }
}
