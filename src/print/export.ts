import { CAVEAT_LINE } from '../legal/caveat'
import type { PrintPart } from './build'

// ---- ZIP (stored, no compression; 3MF files are ZIP packages too) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, 0, true) // time
    lv.setUint16(12, 0x21, true) // date: 1980-01-01
    lv.setUint32(14, crc, true)
    lv.setUint32(18, f.data.length, true)
    lv.setUint32(22, f.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, f.data)

    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, f.data.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)
    offset += local.length + f.data.length
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of all) {
    out.set(c, at)
    at += c.length
  }
  return out
}

// ---- Laying parts out on the bed ----

export interface PlacedPart {
  part: PrintPart
  /** Where the part's lowest corner goes on the bed (mm). */
  x: number
  y: number
}

/** Parts side by side in rows, each sitting on the bed, for slicers to rearrange. */
export function layOut(parts: PrintPart[], rowWidth = 240, gap = 8): PlacedPart[] {
  const out: PlacedPart[] = []
  let x = 0
  let y = 0
  let rowDepth = 0
  for (const part of parts) {
    const w = part.max[0] - part.min[0]
    const d = part.max[1] - part.min[1]
    if (x > 0 && x + w > rowWidth) {
      x = 0
      y += rowDepth + gap
      rowDepth = 0
    }
    out.push({ part, x, y })
    x += w + gap
    rowDepth = Math.max(rowDepth, d)
  }
  return out
}

const num = (v: number) => {
  const s = v.toFixed(3)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const COLORS: Record<PrintPart['kind'], string> = { terrain: '#8FB07A', floor: '#EEE8DC', roof: '#6B7380' }

// ---- 3MF ----

/** One 3MF file holding every part as its own named object, laid out on the bed. */
export function to3mf(parts: PrintPart[], title: string): Uint8Array {
  const placed = layOut(parts)
  const objects: string[] = []
  const items: string[] = []
  const kinds = [...new Set(parts.map(p => p.kind))]
  placed.forEach(({ part, x, y }, i) => {
    const id = i + 2
    const p = part.positions
    const verts: string[] = []
    for (let v = 0; v < p.length; v += 3) {
      verts.push(`<vertex x="${num(p[v] - part.min[0])}" y="${num(p[v + 1] - part.min[1])}" z="${num(p[v + 2] - part.min[2])}"/>`)
    }
    const tris: string[] = []
    const t = part.indices
    for (let k = 0; k < t.length; k += 3) tris.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>`)
    objects.push(
      `<object id="${id}" name="${escapeXml(part.name)}" type="model" pid="1" pindex="${kinds.indexOf(part.kind)}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`,
    )
    items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${num(x)} ${num(y)} 0"/>`)
  })
  const materials = `<basematerials id="1">${kinds.map(k => `<base name="${k}" displaycolor="${COLORS[k]}"/>`).join('')}</basematerials>`
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${escapeXml(title)}</metadata>
<metadata name="Application">Contour and Gable</metadata>
<metadata name="Description">${escapeXml(CAVEAT_LINE)}</metadata>
<resources>${materials}${objects.join('\n')}</resources>
<build>${items.join('')}</build>
</model>`
  const enc = new TextEncoder()
  return zip([
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
    },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ])
}

// ---- STL ----

/** Binary STL of one part, sitting on the bed with its corner at the origin. */
export function toStl(part: PrintPart): Uint8Array {
  const t = part.indices
  const p = part.positions
  const n = t.length / 3
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const header = new TextEncoder().encode(`Contour and Gable: ${part.name}`.slice(0, 80))
  new Uint8Array(buf, 0, 80).set(header)
  dv.setUint32(80, n, true)
  let o = 84
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3
    const b = t[k + 1] * 3
    const c = t[k + 2] * 3
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    dv.setFloat32(o, nx, true)
    dv.setFloat32(o + 4, ny, true)
    dv.setFloat32(o + 8, nz, true)
    o += 12
    for (const v of [a, b, c]) {
      dv.setFloat32(o, p[v] - part.min[0], true)
      dv.setFloat32(o + 4, p[v + 1] - part.min[1], true)
      dv.setFloat32(o + 8, p[v + 2] - part.min[2], true)
      o += 12
    }
    o += 2
  }
  return new Uint8Array(buf)
}

export const fileSafe = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'part'

/** A ZIP of one STL per part. */
export function toStlZip(parts: PrintPart[]): Uint8Array {
  const used = new Set<string>()
  return zip(
    [
      ...parts.map(p => {
        let name = fileSafe(p.name)
        for (let i = 2; used.has(name); i++) name = `${fileSafe(p.name)}-${i}`
        used.add(name)
        return { name: `${name}.stl`, data: toStl(p) }
      }),
      // STL has nowhere to say it, so the caveat travels as a note beside the parts.
      { name: 'README.txt', data: new TextEncoder().encode(`Made with Contour and Gable.\r\n\r\n${CAVEAT_LINE}\r\n`) },
    ],
  )
}
