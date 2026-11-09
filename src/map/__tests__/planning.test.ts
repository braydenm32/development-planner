import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../../lib/geom'
import { mapChecks } from '../checks'
import { fromMga, toMga, type LonLat } from '../geo'
import { EDGE_GAP, factsFrom, samplePoints, type PlanningFacts } from '../planning'
import { BUSHFIRE_ROWS, FSR_ROW, HEIGHT_ROW, HERITAGE_ROW, LEP_ROW, LOT_SIZE_ROW, ZONE_ROWS } from './replies'

// A made-up battle-axe lot in MGA zone 56: a 20 × 30 m body and a 3.5 m handle.
const E = 305000
const N = 6188000
const lotMga: [number, number][] = [
  [0, 0],
  [20, 0],
  [20, 30],
  [3.5, 30],
  [3.5, 60],
  [0, 60],
]
const ring: LonLat[] = lotMga.map(([x, y]) => fromMga([E + x, N + y], 56))

describe('where the layers are asked', () => {
  it('picks a middle and points inside the lot, clear of its lines', () => {
    const { middle, inside } = samplePoints(ring)
    const poly = lotMga.map(([x, y]) => [E + x, N + y] as [number, number])
    const m = toMga(middle, 56)
    expect(pointInPolygon(m[0], m[1], poly)).toBe(true)
    expect(inside.length).toBeGreaterThanOrEqual(4)
    expect(inside.length).toBeLessThanOrEqual(40)
    for (const p of inside) {
      const [x, y] = toMga(p, 56)
      expect(pointInPolygon(x, y, poly)).toBe(true)
      // Not within the gap of the lot's outer lines.
      expect(x - E).toBeGreaterThanOrEqual(EDGE_GAP - 1e-6)
      expect(y - N).toBeGreaterThanOrEqual(EDGE_GAP - 1e-6)
    }
  })
})

const clean = (): PlanningFacts =>
  factsFrom(
    {
      lep: { middle: [LEP_ROW], inside: [] },
      zone: { middle: ZONE_ROWS.mangerton, inside: ZONE_ROWS.mangerton },
      height: { middle: [HEIGHT_ROW], inside: [] },
      fsr: { middle: [FSR_ROW], inside: [] },
      lotSize: { middle: [LOT_SIZE_ROW], inside: [] },
      heritage: { middle: [], inside: [] },
      bushfire: { middle: [], inside: [] },
      flood: { middle: [], inside: [] },
      landslide: { middle: [], inside: [] },
    },
    '2026-11-09T05:00:00Z',
  )

describe('reading the replies', () => {
  it('gives the council, zone and map values', () => {
    const f = clean()
    expect(f.lga).toBe('WOLLONGONG')
    expect(f.lep).toBe('Wollongong Local Environmental Plan 2009')
    expect(f.zones).toEqual([{ name: 'R2 Low Density Residential', code: 'R2', middle: true }])
    expect(f.height).toBe(9)
    expect(f.fsr).toBe(0.5)
    expect(f.lotSize).toBe('449 m²')
    expect(f.failed).toEqual([])
  })

  it('marks what only reaches part of the lot, and layers that failed', () => {
    const f = factsFrom({
      zone: { middle: ZONE_ROWS.mangerton, inside: [...ZONE_ROWS.mangerton, ...ZONE_ROWS.mangertonEdge] },
      heritage: { middle: [HERITAGE_ROW], inside: [HERITAGE_ROW] },
      bushfire: { middle: [], inside: BUSHFIRE_ROWS },
      flood: null,
    })
    expect(f.zones.map(z => [z.code, z.middle])).toEqual([
      ['R2', true],
      ['C2', false],
    ])
    expect(f.heritage[0]).toMatchObject({ name: 'Row Of Shops', kind: 'Item - General', item: '6240', middle: true })
    expect(f.bushfire.map(b => b.name)).toEqual(['Vegetation Category 1', 'Vegetation Buffer'])
    expect(f.bushfire.every(b => !b.middle)).toBe(true)
    expect(f.failed).toEqual(['flood'])
  })
})

describe('checks from the maps', () => {
  const byId = (rows: ReturnType<typeof mapChecks>) => Object.fromEntries(rows.map(r => [r.id, r]))

  it('passes a clear R2 lot for a CDC, but asks about flood in Wollongong', () => {
    const r = byId(mapChecks(clean(), 'cdc'))
    expect(r['map:zone'].status).toBe('pass')
    expect(r['map:heritage'].status).toBe('pass')
    expect(r['map:bushfire'].status).toBe('pass')
    expect(r['map:landslide'].status).toBe('pass')
    expect(r['map:flood'].status).toBe('unknown')
    expect(r['map:flood'].note).toMatch(/flood studies/)
    expect(r['map:zone'].source.asAt).toMatch(/9 Nov 2026/)
  })

  it('says a flood map is clear elsewhere', () => {
    const f = { ...clean(), lga: 'SHELLHARBOUR' }
    expect(byId(mapChecks(f, 'cdc'))['map:flood'].status).toBe('pass')
  })

  it('fails a CDC on a heritage item or landslide land, and flags bushfire', () => {
    const f: PlanningFacts = {
      ...clean(),
      heritage: [{ name: 'Row Of Shops', kind: 'Item - General', item: '6240', middle: true }],
      landslide: [{ name: 'Landslide risk land', middle: false }],
      bushfire: [{ name: 'Vegetation Buffer', middle: false }],
    }
    const cdc = byId(mapChecks(f, 'cdc'))
    expect(cdc['map:heritage'].status).toBe('fail')
    expect(cdc['map:heritage'].value).toBe('Row Of Shops (item 6240)')
    expect(cdc['map:landslide'].status).toBe('fail')
    expect(cdc['map:landslide'].value).toMatch(/part of the lot/)
    expect(cdc['map:bushfire'].status).toBe('warn')
    expect(cdc['map:bushfire'].note).toMatch(/BAL-40/)
    const da = byId(mapChecks(f, 'da'))
    expect(da['map:heritage'].status).toBe('warn')
    expect(da['map:landslide'].status).toBe('warn')
  })

  it('warns when the Housing Code doesn’t cover the zone, or the lot is split', () => {
    const f = factsFrom({ zone: { middle: ZONE_ROWS.mangertonEdge, inside: [...ZONE_ROWS.mangertonEdge, ...ZONE_ROWS.mangerton] } })
    const r = byId(mapChecks(f, 'cdc'))['map:zone']
    expect(r.status).toBe('warn')
    expect(r.value).toBe('C2 Environmental Conservation')
    expect(r.note).toMatch(/also in R2/)
  })

  it('says when a layer didn’t answer rather than reading it as clear', () => {
    const f = factsFrom({ zone: { middle: ZONE_ROWS.mangerton, inside: [] }, bushfire: null })
    expect(byId(mapChecks(f, 'cdc'))['map:bushfire'].status).toBe('unknown')
  })
})
