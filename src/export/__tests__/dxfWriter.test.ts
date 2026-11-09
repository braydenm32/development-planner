import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { asciiText, DxfWriter, layerName } from '../dxfWriter'

describe('DXF writer', () => {
  it('writes plain ASCII with an R12 header, a layer table and an EOF', () => {
    const w = new DxfWriter()
    w.addLayer('Boundary', 1)
    w.polyline('Boundary', [[0, 0], [10, 0], [10, 5]], { closed: true })
    w.text('NOTES', [1, 2], 'Café – “quote”', 0.5)
    const s = w.toString()
    expect(s).toMatch(/^[\x20-\x7e\r\n]*$/)
    expect(s).toContain('AC1009')
    expect(s).toContain('\r\n2\r\nLAYER\r\n70\r\n2\r\n')
    expect(s).toContain('\r\n2\r\nLTYPE\r\n')
    expect(s.trimEnd().endsWith('EOF')).toBe(true)
    expect(s).toContain('Cafe - "quote"')
  })

  it('reads back with the app reader: closed polylines, elevations, text', () => {
    const w = new DxfWriter()
    w.polyline('BOUNDARY', [[5000.5, 8000], [5030, 8000], [5030, 8040]], { closed: true })
    w.polyline('CONTOURS-EXISTING', [[5001, 8001], [5002, 8003]], { z: 45.25 })
    w.text('NOTES', [5001, 8001], 'Hello')
    const doc = parseDxf(w.toString())
    const b = doc.entities.find(e => e.layer === 'BOUNDARY')
    expect(b?.kind === 'polyline' && b.closed && b.points.map(p => [p[0], p[1]])).toEqual([[5000.5, 8000], [5030, 8000], [5030, 8040]])
    const c = doc.entities.find(e => e.layer === 'CONTOURS-EXISTING')
    expect(c?.kind === 'polyline' && c.points.map(p => p[2])).toEqual([45.25, 45.25])
    expect(doc.entities.find(e => e.kind === 'text')).toMatchObject({ layer: 'NOTES', text: 'Hello', p: [5001, 8001, 0] })
  })

  it('skips a polyline with fewer than two points and an empty label', () => {
    const w = new DxfWriter()
    w.polyline('A', [[0, 0]])
    w.text('A', [0, 0], '')
    expect(parseDxf(w.toString()).entities).toHaveLength(0)
  })

  it('keeps layer names plain', () => {
    expect(layerName('walls ground')).toBe('WALLS-GROUND')
    expect(layerName('')).toBe('0')
    expect(asciiText('a\nb')).toBe('a b')
  })
})
