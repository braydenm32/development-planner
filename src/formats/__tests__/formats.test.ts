import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { isLandXml, readLandXml } from '../../lib/landxml'
import { NeedColumns, guessColumns, readPointsCsv, readTable } from '../../lib/pointsCsv'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { detectFile } from '../../safety/files'
import type { SavedProject } from '../../lib/storage'

const sample = (n: string) => readFileSync(new URL(`../../../samples/${n}`, import.meta.url), 'utf8')

function site(s: SavedProject) {
  const survey = buildSurvey(parseDxf(s.dxfText), s.roles)
  return { survey, terrain: buildTerrain(survey) }
}

const dxf = (() => {
  const doc = parseDxf(sample('sample-block.dxf'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
})()

/** RL at an easting/northing in each import's own local frame. */
const rl = (s: ReturnType<typeof site>, e: number, n: number) => s.terrain.grid.sample(e - s.survey.origin[0], n - s.survey.origin[1])

// Points well inside the lot (east, north).
const CHECKS: [number, number][] = [
  [5004, 8006],
  [5012, 8010],
  [5018, 8020],
  [5008, 8026],
  [5015, 8030],
  [5020, 8014],
  [5006, 8018],
]

describe('LandXML', () => {
  const lx = site(readLandXml('sample-block.xml', sample('sample-block.xml')))
  it('is recognised by what is inside', () => {
    expect(isLandXml(sample('sample-block.xml'))).toBe(true)
    expect(isLandXml(sample('sample-block.dxf'))).toBe(false)
    expect(detectFile('survey.xml', sample('sample-block.xml')).kind).toBe('survey')
  })
  it('gives the ground the DXF gives, within 3 cm', () => {
    for (const [e, n] of CHECKS) expect(Math.abs(rl(lx, e, n) - rl(dxf, e, n))).toBeLessThan(0.03)
  })
  it('takes the boundary from the parcel', () => {
    expect(lx.survey.boundaryIsGuess).toBe(false)
    expect(lx.survey.boundary).toHaveLength(4)
    expect(lx.terrain.stats.area).toBeCloseTo(dxf.terrain.stats.area, 0)
    expect(lx.survey.origin).toEqual(dxf.survey.origin)
  })
  it('reads feet, arcs and CgPoints alone, and puts northing and easting the right way round', () => {
    const xml = `<?xml version="1.0"?><LandXML xmlns="x" version="1.2"><Units><Imperial linearUnit="foot"/></Units>
      <CgPoints><CgPoint name="1">100 200 10</CgPoint><CgPoint name="2">100 300 10</CgPoint><CgPoint name="3">200 250 20</CgPoint><CgPoint name="4">50 50</CgPoint></CgPoints>
      <Parcels><Parcel name="a"><CoordGeom>
        <Line><Start>100 200</Start><End>100 300</End></Line>
        <Curve rot="cw"><Start>100 300</Start><Center>150 300</Center><End>150 350</End></Curve>
        <Line><Start>150 350</Start><End>100 200</End></Line></CoordGeom></Parcel></Parcels></LandXML>`
    const s = readLandXml('f.xml', xml)
    const doc = parseDxf(s.dxfText)
    const pts = doc.entities.filter(e => e.kind === 'point')
    expect(pts).toHaveLength(3)
    expect(pts[0].kind === 'point' && pts[0].p[0]).toBeCloseTo(200 * 0.3048, 2) // easting first
    expect(pts[0].kind === 'point' && pts[0].p[1]).toBeCloseTo(100 * 0.3048, 2)
    const ring = doc.entities.find(e => e.kind === 'polyline')
    expect(ring?.kind === 'polyline' && ring.points.length).toBeGreaterThan(8) // the arc is chords
    expect(buildSurvey(doc, s.roles).boundaryIsGuess).toBe(false)
  })
  it('says plainly when it is not LandXML or has no levels', () => {
    expect(() => readLandXml('a.xml', '<html><body/></html>')).toThrow(/isn’t a LandXML survey/)
    expect(() => readLandXml('a.xml', '<LandXML><Parcels/></LandXML>')).toThrow(/no surface or points/)
    expect(() => readLandXml('a.xml', '<LandXML><CgPoints><CgPoint>1 2 3</CgPoint></CgPoints></LandXML>')).toThrow(/only 1 point/)
  })
})

describe('CSV spot levels', () => {
  const csv = site(readPointsCsv('sample-block.csv', sample('sample-block.csv')))
  it('gives the ground the DXF gives, within 3 cm, with the boundary from BDY codes', () => {
    for (const [e, n] of CHECKS) expect(Math.abs(rl(csv, e, n) - rl(dxf, e, n))).toBeLessThan(0.03)
    expect(csv.survey.boundaryIsGuess).toBe(false)
    expect(csv.survey.boundary).toHaveLength(4)
  })
  it('without a boundary says so and uses the outline of the points', () => {
    const body = sample('sample-block.csv').split('\n').filter(l => !l.includes('BDY')).join('\n')
    const s = site(readPointsCsv('p.csv', body))
    expect(s.survey.boundaryIsGuess).toBe(true)
    expect(s.survey.warnings.join(' ')).toMatch(/No site boundary/)
  })
  const rows = ['5001,8001,47.2', '5004,8001,46.7', '5007,8003,46.1', '5002,8008,46.9', '5006,8010,46.0']
  it('reads tab, space and semicolon separators, and headers, once the names say which is which', () => {
    for (const d of ['\t', ' ', ';', ',']) {
      const text = ['E N RL'.split(' ').join(d), ...rows.map(r => r.split(',').join(d))].join('\n')
      const s = readPointsCsv('p.txt', text)
      expect(parseDxf(s.dxfText).entities.filter(e => e.kind === 'point')).toHaveLength(5)
    }
  })
  it('recognises header names in any order and with other names', () => {
    const t = readTable('Pt,Elev,Northing,Easting,Desc\n1,46.7,8001,5004,SPOT\n2,46.1,8003,5007,SPOT\n3,46.9,8008,5002,SPOT')
    const g = guessColumns(t)
    expect(g.roles).toEqual(['id', 'rl', 'n', 'e', 'code'])
    expect(g.sure).toBe(true)
  })
  it('asks which column is which when there is no header, with a good guess ready', () => {
    const text = rows.join('\n')
    expect(() => readPointsCsv('p.csv', text)).toThrow(NeedColumns)
    try {
      readPointsCsv('p.csv', text)
    } catch (e) {
      expect((e as NeedColumns).guess).toEqual(['e', 'n', 'rl'])
    }
    const s = readPointsCsv('p.csv', text, { roles: ['e', 'n', 'rl'], header: false })
    expect(parseDxf(s.dxfText).entities.filter(e => e.kind === 'point')).toHaveLength(5)
    // A point number first, and a code after.
    const g = guessColumns(readTable(rows.map((r, i) => `${i + 1},${r},TOP`).join('\n')))
    expect(g.roles).toEqual(['id', 'e', 'n', 'rl', 'code'])
  })
  it('is sure without a header when northing is clearly the seven-digit number', () => {
    const g = guessColumns(readTable('1 345000.5 6250000.2 80.1\n2 345010.5 6250012.2 80.9\n3 345004 6250020 81.3'))
    expect(g.roles).toEqual(['id', 'e', 'n', 'rl'])
    expect(g.sure).toBe(true)
  })
  it('gives plain errors for bad files', () => {
    expect(() => readPointsCsv('a.csv', '')).toThrow(/empty/)
    expect(() => readPointsCsv('a.csv', 'a,b\n1,2')).toThrow(/at least three columns/)
    expect(() => readPointsCsv('a.csv', 'E,N,RL\n1,2,3\n4,5,6')).toThrow(/only 2 points/)
    expect(() => readPointsCsv('a.csv', 'E,N,RL\nx,y,z\nx,y,z\nx,y,z', { roles: ['e', 'n', 'rl'], header: true })).toThrow(/no points with a level/)
    expect(() => readPointsCsv('a.csv', 'E,N,RL\n1,2,3', { roles: ['e', 'e', 'skip'], header: true })).toThrow(/easting, a northing and an RL/)
  })
  it('detectFile hands csv and txt to the reader, and the DXF still wins', () => {
    expect(detectFile('s.csv', sample('sample-block.csv')).kind).toBe('survey')
    expect(detectFile('s.txt', sample('sample-block.dxf')).kind).toBe('survey')
    expect(() => detectFile('s.csv', 'Point,Easting,Northing,RL\n1,5,6,7')).toThrow(/at least 3|only 1 point/)
  })
})
