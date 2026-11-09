import { describe, expect, it } from 'vitest'
import { parseProjectFile, projectFileText } from '../../share/project'
import { normalizePlan } from '../../plan/model'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { MAP_KIND, normalizeMapPlace, type MapPlace } from '../model'
import { mapFromRecords } from '../store'
import { fitWords } from '../words'

const place = (patch: Partial<MapPlace> = {}): MapPlace => ({
  version: 1,
  zone: 56,
  fit: { from: [5000, 8000], at: [305000, 6188000], rotation: 1.2 },
  rms: 0.12,
  worst: 0.3,
  areaRatio: 1,
  onGrid: false,
  adjusted: false,
  lot: {
    id: '12//DP1000001',
    label: 'Lot 12 DP1000001',
    ring: [
      [150.87, -34.4],
      [150.8703, -34.4],
      [150.8703, -34.4003],
    ],
  },
  aerial: true,
  opacity: 0.8,
  include: false,
  planning: null,
  placedAt: '2026-11-09T05:00:00Z',
  ...patch,
})

describe('the map record', () => {
  it('keeps a whole placement and fills in what older ones lack', () => {
    const { aerial: _a, opacity: _o, include: _i, ...old } = place()
    const p = normalizeMapPlace(old)!
    expect(p.aerial).toBe(true)
    expect(p.opacity).toBe(0.8)
    expect(p.include).toBe(false)
    expect(p.fit).toEqual(place().fit)
  })

  it('keeps the street address a lot was found by, for the DA pack, and nothing for a blank one', () => {
    const lot = place().lot
    expect(normalizeMapPlace(place({ lot: { ...lot, address: ' 1 Example Street Sampleton 2000 ' } }))!.lot.address).toBe('1 Example Street Sampleton 2000')
    expect(normalizeMapPlace(place({ lot: { ...lot, address: '  ' } }))!.lot).not.toHaveProperty('address')
    expect(normalizeMapPlace(place())!.lot).not.toHaveProperty('address')
  })

  it('drops what isn’t a placement', () => {
    expect(normalizeMapPlace(null)).toBeNull()
    expect(normalizeMapPlace({ fit: { from: [1, 2], at: [3, 'x'], rotation: 0 }, lot: place().lot })).toBeNull()
    expect(normalizeMapPlace({ fit: place().fit, lot: { id: 'x', ring: [[1, 2]] } })).toBeNull()
  })

  it('goes in a project file only when the owner says so', () => {
    const survey = { fileName: 'sample.dxf', dxfText: '0\nEOF', roles: {} }
    const plan = normalizePlan(garageFloor())
    expect(parseProjectFile(projectFileText(survey, plan)).map).toBeNull()
    const withMap = parseProjectFile(projectFileText(survey, plan, undefined, undefined, undefined, place({ include: true })))
    expect(withMap.map?.lot.id).toBe('12//DP1000001')
    expect(mapFromRecords({ [MAP_KIND]: place() })).toBeUndefined()
    expect(mapFromRecords({ [MAP_KIND]: place({ include: true }) })?.lot.label).toBe('Lot 12 DP1000001')
  })
})

describe('how well it fits, in words', () => {
  it('says centimetres for a close fit and asks for a check on a loose one', () => {
    expect(fitWords(place()).text).toMatch(/within about 12 cm/)
    expect(fitWords(place()).loose).toBe(false)
    const loose = fitWords(place({ rms: 3.2 }))
    expect(loose.loose).toBe(true)
    expect(loose.text).toMatch(/3\.2 m.*right lot/)
    expect(fitWords(place({ onGrid: true })).text).toMatch(/already on the state’s grid/)
  })
})
