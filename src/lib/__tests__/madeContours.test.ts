// Spot levels alone (the made-up sample block as CSV and LandXML) get contours drawn from the
// ground they make, every 0.5 m with the whole metres major; a DXF with its own keeps those.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../geom'
import { contoursFromGrid, MADE_LAYER, madeInterval } from '../madeContours'
import { readLandXml } from '../landxml'
import { readPointsCsv } from '../pointsCsv'
import { foundText } from '../../safety/readBack'
import { readSite, readSurvey } from '../../safety/files'

const sample = (ext: string) => readFileSync(new URL(`../../../samples/sample-block.${ext}`, import.meta.url), 'utf8')

describe('contours made from spot levels', () => {
  const csv = readSite(readPointsCsv('sample-block.csv', sample('csv')))

  it('draws them every 0.5 m over the block, the whole metres major', () => {
    const { survey, terrain } = csv
    expect(survey.madeContours).toBe(true)
    expect(survey.contours.length).toBeGreaterThan(5)
    for (const c of survey.contours) {
      expect(c.layer).toBe(MADE_LAYER)
      expect(Math.abs(c.z * 2 - Math.round(c.z * 2))).toBeLessThan(1e-9)
      expect(c.major).toBe(Number.isInteger(c.z))
      expect(c.pts.every(p => p[2] === c.z)).toBe(true)
    }
    const zs = new Set(survey.contours.map(c => c.z))
    // Every half metre between the lowest and highest ground on the block.
    for (let z = Math.ceil(terrain.stats.minRL * 2) / 2; z <= terrain.stats.maxRL - 0.1; z += 0.5) expect(zs.has(z), `RL ${z}`).toBe(true)
    // Each line lies at its level on the ground it was drawn from.
    for (const c of survey.contours)
      for (const [x, y] of c.pts.filter(([x, y]) => pointInPolygon(x, y, survey.boundary))) expect(terrain.grid.sample(x, y)).toBeCloseTo(c.z, 1)
  })

  it('says they were drawn here, not found in the file', () => {
    expect(foundText(csv.survey)).toMatch(/spot levels and the boundary \(contours drawn from the levels\)$/)
    expect(foundText(csv.survey)).not.toMatch(/\d+ contours/)
  })

  it('does the same for LandXML points', () => {
    const xml = readSite(readLandXml('sample-block.xml', sample('xml')))
    expect(xml.survey.madeContours).toBe(true)
    expect(xml.survey.contours.length).toBeGreaterThan(5)
    expect(xml.survey.contours.some(c => c.major)).toBe(true)
  })

  it('leaves a DXF with contours of its own as it is', () => {
    const dxf = readSite(readSurvey('sample-block.dxf', sample('dxf')))
    expect(dxf.survey.madeContours).toBeUndefined()
    expect(dxf.survey.contours.every(c => c.layer !== MADE_LAYER)).toBe(true)
  })

  it('spaces them out on a steep block', () => {
    expect(madeInterval(5)).toEqual({ minor: 0.5, major: 1 })
    expect(madeInterval(30)).toEqual({ minor: 1, major: 5 })
    expect(madeInterval(60)).toEqual({ minor: 2, major: 10 })
  })

  it('makes none on dead level ground', () => {
    const flat = { ...csv.terrain.grid, z: new Float32Array(csv.terrain.grid.z.length).fill(10) } as typeof csv.terrain.grid
    expect(contoursFromGrid(flat, csv.survey.boundary)).toEqual([])
  })
})
