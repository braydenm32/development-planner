import { describe, expect, it } from 'vitest'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { parseDxf } from '../../lib/dxf'
import { pointInPolygon } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { buildingOutline, planarFaces } from '../geometry'
import { earthworksOf, isRetaining, toSite, type Plan } from '../model'
import { earthworksBarriers, earthworksPlatforms } from '../platforms'
import { addEdgeWalls, edgeState, edgeWalls, houseEdgeWalls, removeEdgeWalls, slabEdgeWalls } from '../retainEdges'
import { garageFloor } from './fixtures'

describe('retaining the edges', () => {
  it('runs a wall along each side, just outside it', () => {
    const square: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]]
    for (const ring of [square, [...square].reverse()]) {
      const ws = edgeWalls(ring, 'L')
      expect(ws).toHaveLength(4)
      // centrelines 0.1 m outside, so the inner face is the edge
      for (const w of ws) {
        const mid: [number, number] = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
        expect(pointInPolygon(mid[0], mid[1], ring)).toBe(false)
        expect(Math.min(Math.abs(mid[0] + 0.1), Math.abs(mid[0] - 4.1), Math.abs(mid[1] + 0.1), Math.abs(mid[1] - 3.1))).toBeLessThan(1e-9)
      }
    }
  })

  it('adds, counts and removes the walls, with Undo-friendly plans', () => {
    const plan = garageFloor()
    const ws = houseEdgeWalls(plan)
    expect(ws.length).toBeGreaterThanOrEqual(4)
    expect(edgeState(plan, ws)).toEqual({ have: 0, missing: ws.length })
    const added = addEdgeWalls(plan, ws)
    expect(added.walls.filter(isRetaining)).toHaveLength(ws.length)
    expect(edgeState(added, ws)).toEqual({ have: ws.length, missing: 0 })
    expect(addEdgeWalls(added, ws)).toBe(added)
    expect(removeEdgeWalls(added, ws).walls).toHaveLength(plan.walls.length)
    // the house's rooms are as they were
    expect(buildingOutline(planarFaces(added.walls)).area).toBeCloseTo(buildingOutline(planarFaces(plan.walls)).area, 9)
    expect(slabEdgeWalls(plan, 'a1')).toHaveLength(4)
  })

  it('leaves no batters outside the house', () => {
    const doc = parseDxf(planeSurvey())
    const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
    const terrain = buildTerrain(survey)
    const base: Plan = { ...garageFloor(), areas: [], placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
    const run = (plan: Plan) =>
      evaluateEarthworks(prepareEarthworks(terrain.grid, survey.boundary, earthworksPlatforms(plan, survey.origin), earthworksOf(plan), earthworksBarriers(plan, survey.origin))).grid
    const open = run(base)
    const kept = run(addEdgeWalls(base, houseEdgeWalls(base)))
    // 1.5 m out from the house's east wall (outside face x 10.1): battered without, natural with.
    const s = toSite([11.6, 7], base.placement, survey.origin)
    const nat = terrain.grid.sample(s[0], s[1])
    expect(Math.abs(open.sample(s[0], s[1]) - nat)).toBeGreaterThan(0.05)
    expect(Math.abs(kept.sample(s[0], s[1]) - nat)).toBeLessThan(0.02)
  })
})
