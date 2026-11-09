import { describe, expect, it } from 'vitest'
import type { PrintPart } from '../build'
import { CAVEAT_LINE } from '../../legal/caveat'
import { crc32, fileSafe, layOut, to3mf, toStl, toStlZip, zip } from '../export'

/** A w x d x h box with its lowest corner at (x, y, z). */
function box(id: string, [x, y, z]: number[], [w, d, h]: number[]): PrintPart {
  const v = [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]
  const tris = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return {
    id,
    name: id,
    kind: 'floor',
    positions: new Float32Array(v.flat()),
    indices: new Uint32Array(tris),
    min: [x, y, z],
    max: [x + w, y + d, z + h],
    volume: (w * d * h) / 1000,
  }
}

/** Read the files back out of a stored ZIP, checking each one's CRC on the way. */
function unzip(data: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const end = data.length - 22
  expect(dv.getUint32(end, true)).toBe(0x06054b50)
  const count = dv.getUint16(end + 10, true)
  let at = dv.getUint32(end + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(at, true)).toBe(0x02014b50)
    const crc = dv.getUint32(at + 16, true)
    const size = dv.getUint32(at + 20, true)
    const nameLen = dv.getUint16(at + 28, true)
    const local = dv.getUint32(at + 42, true)
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLen))
    expect(dv.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + dv.getUint16(local + 26, true)
    const body = data.subarray(start, start + size)
    expect(crc32(body)).toBe(crc)
    out.set(name, body)
    at += 46 + nameLen
  }
  return out
}

describe('print files', () => {
  it('works out the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes ZIPs that read back', () => {
    const enc = new TextEncoder()
    const files = unzip(zip([
      { name: 'a.txt', data: enc.encode('hello') },
      { name: 'dir/b.txt', data: enc.encode('world!') },
    ]))
    expect([...files.keys()]).toEqual(['a.txt', 'dir/b.txt'])
    expect(new TextDecoder().decode(files.get('dir/b.txt'))).toBe('world!')
  })

  it('writes a binary STL sitting on the bed', () => {
    const part = box('Box', [10, 20, 5], [30, 40, 6])
    const stl = toStl(part)
    expect(stl.length).toBe(84 + 12 * 50)
    const dv = new DataView(stl.buffer)
    expect(dv.getUint32(80, true)).toBe(12)
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t < 12; t++) {
      for (let v = 0; v < 3; v++) {
        const o = 84 + t * 50 + 12 + v * 12
        min = Math.min(min, dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true))
        max = Math.max(max, dv.getFloat32(o, true))
      }
    }
    expect(min).toBe(0)
    expect(max).toBe(30)
    // The first triangle is on the underside, so it faces down.
    expect(dv.getFloat32(84 + 8, true)).toBe(-1)
  })

  it('lays parts out in rows without overlapping', () => {
    const parts = [box('a', [0, 0, 0], [150, 60, 5]), box('b', [0, 0, 0], [100, 50, 5]), box('c', [0, 0, 0], [80, 30, 5])]
    const placed = layOut(parts, 240, 8)
    expect(placed.map(p => [p.x, p.y])).toEqual([
      [0, 0],
      [0, 68],
      [108, 68],
    ])
  })

  it('writes a 3MF holding every part, named and coloured', () => {
    const parts = [box('Ground floor', [0, 0, 3], [90, 80, 30]), { ...box('Roof & eaves', [0, 0, 33], [95, 85, 20]), kind: 'roof' as const }]
    const files = unzip(to3mf(parts, 'Our "house"'))
    expect([...files.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model'])
    const model = new TextDecoder().decode(files.get('3D/3dmodel.model'))
    expect(model).toContain('unit="millimeter"')
    expect(model).toContain('<metadata name="Title">Our &quot;house&quot;</metadata>')
    expect(model.match(/<object /g)).toHaveLength(2)
    expect(model.match(/<vertex /g)).toHaveLength(16)
    expect(model.match(/<triangle /g)).toHaveLength(24)
    expect(model).toContain('name="Roof &amp; eaves"')
    expect(model).toContain('<base name="floor" displaycolor="#EEE8DC"/><base name="roof" displaycolor="#6B7380"/>')
    expect(model.match(/<item /g)).toHaveLength(2)
    // The caveat travels in the file's own description.
    expect(model).toContain(`<metadata name="Description">${CAVEAT_LINE}</metadata>`)
  })

  it('puts the caveat in a README beside the STLs', () => {
    const files = unzip(toStlZip([box('Roof', [0, 0, 0], [1, 1, 1])]))
    expect(new TextDecoder().decode(files.get('README.txt'))).toContain(CAVEAT_LINE)
  })

  it('names STL files safely and uniquely', () => {
    expect(fileSafe('Roof over First floor')).toBe('roof-over-first-floor')
    expect(fileSafe("Sam's house")).toBe('sams-house')
    expect(fileSafe('***')).toBe('part')
    const files = unzip(toStlZip([box('Roof', [0, 0, 0], [1, 1, 1]), box('Roof', [0, 0, 0], [1, 1, 1])]))
    expect([...files.keys()]).toEqual(['roof.stl', 'roof-2.stl', 'README.txt'])
  })
})
