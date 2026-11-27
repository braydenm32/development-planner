// The site plan (PDF and DA pack) and the plan's setback lines draw the whole building footprint:
// every level that sits on the ground, not the lowest level alone, and measure to the boundary
// from the same outlines Earthworks › Place and Approvals › Checks use. A made-up split level on
// the tilted-plane test block.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { measure } from '../../checks/measure'
import { PlanEditor } from '../../components/PlanEditor'
import { houseOutline } from '../../components/planNumbers'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { placementInfo } from '../../plan/keyNumbers'
import { emptyPlan, type Plan } from '../../plan/model'
import { addWall } from '../../plan/ops'
import { setbackDims, setbackText } from '../../plan/setbacks'
import { usePlan } from '../../plan/store'
import { readSite } from '../../safety/files'
import { planSetPdf, type PlanSetInput } from '../plans'
import { houseOnSite } from '../siteHouse'

const site = () => {
  const dxfText = planeSurvey()
  return readSite({ fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) })
}

function walled(plan: Plan, level: string, x0: number, y0: number, x1: number, y1: number): Plan {
  const c: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  let p = plan
  for (let i = 0; i < 4; i++) p = addWall(p, level, c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  return p
}

/**
 * A 6 x 6 m ground floor with a split level 3 m wide beside it on the west, 1.2 m up, and a first
 * floor over the ground floor's east half. Only the first floor is an upper storey.
 */
function splitBeside(): Plan {
  let p = emptyPlan({ e: 1010, n: 1009, rotation: 0, ffl: 83 })
  p = {
    ...p,
    levels: [
      ...p.levels,
      { id: 'level_split', name: 'Split level', elevation: 1.2, height: 2.7 },
      { id: 'level_first', name: 'First floor', elevation: 3, height: 2.7 },
    ],
  }
  p = walled(p, 'level_ground', 0, 0, 6, 6)
  p = walled(p, 'level_split', -3, 0, 0, 6)
  return walled(p, 'level_first', 3, 0, 6, 6)
}

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('a split level beside the lowest level', () => {
  const { survey, terrain } = site()
  const plan = splitBeside()
  const input: PlanSetInput = { plan, survey, siteArea: terrain.stats.area, earthworks: null, up: 'house', paper: 'A3', title: 'Split', date: '27 November 2026' }

  // Earthworks › Place: each side from the nearest level.
  const house = houseOutline(plan)
  const place = placementInfo(house.rings, plan.placement, survey, terrain, house.names)!
  const placeWest = place.sides.find(s => s.name === 'west')!
  // Approvals › Checks.
  const checks = measure({ plan, survey, terrain, earth: null })
  // What the lowest level alone would give: 3 m more.
  const lowestOnly = setbackDims(house.rings.slice(0, 1), plan.placement, survey).find(d => d.name === 'west')!

  it('is the nearest level to the west side in Place, 3 m nearer than the lowest level', () => {
    expect(placeWest.level).toBe('Split level')
    expect(lowestOnly.dist - placeWest.dist).toBeGreaterThan(2.5)
  })

  it('gives the same west setback in Place, in Checks and on the PDF site plan', () => {
    const west = survey.boundary.findIndex((_, i) => place.sides[i] === placeWest)
    const pdfDim = setbackDims(houseOnSite(plan).rings, plan.placement, survey).find(d => d.side === west)!
    expect(pdfDim.dist).toBeCloseTo(placeWest.dist, 9)
    expect(checks.edges[west].clearance).toBeCloseTo(placeWest.dist, 9)
    // The figure printed on the sheet is the one Place's box shows, in mm.
    const pdf = text(planSetPdf(input))
    expect(pdf).toContain(`(${setbackText(placeWest.dist)}) Tj`)
    expect(pdf).not.toContain(`(${setbackText(lowestOnly.dist)}) Tj`)
  })

  it('fills every level on the ground, each with its floor level, and dashes only the upper storey', () => {
    const h = houseOnSite(plan)
    expect(h.ground.map(g => g.level.name)).toEqual(['Ground floor', 'Split level'])
    expect(h.ground.map(g => g.rl)).toEqual([83, 84.2])
    expect(h.upper).toHaveLength(1)
    // Every ring, lowest level first: what Place measures from.
    expect(h.rings).toEqual(house.rings)
    const pdf = text(planSetPdf({ ...input, leaveOut: ['roof', 'floor:level_ground', 'floor:level_split', 'floor:level_first'] }))
    expect(pdf).toContain('(Ground floor) Tj')
    expect(pdf).toContain('(FFL RL 83.00) Tj')
    expect(pdf).toContain('(Split level) Tj')
    expect(pdf).toContain('(FFL RL 84.20) Tj')
    // The first floor is over the ground floor: no label of its own on the site plan.
    expect(pdf).not.toContain('(First floor) Tj')
  })

  it('keeps one house, one label on a single level', () => {
    const one = walled(emptyPlan({ e: 1010, n: 1009, rotation: 0, ffl: 83 }), 'level_ground', 0, 0, 6, 6)
    const pdf = text(planSetPdf({ ...input, plan: one }))
    expect(pdf).toContain('(House) Tj')
    expect(pdf).toContain('(FFL RL 83.00) Tj')
  })

  it('draws the same setback on the plan when Setbacks is switched on', () => {
    usePlan.getState().load(plan)
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const html = renderToStaticMarkup(
      <PlanEditor survey={survey} terrain={terrain} up="house" onUpChange={() => {}} showGround={false} onShowGroundChange={() => {}} earth={null} viewKey={null} showSetbacks />,
    )
    const labels = [...html.matchAll(/class="setback-label"[^>]*>([^<]*)</g)].map(m => m[1])
    expect(labels).toContain(setbackText(placeWest.dist))
    expect(labels).not.toContain(setbackText(lowestOnly.dist))
  })
})
