import { describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { buildingOutline, planarFaces } from '../../plan/geometry'
import { floorRL, type Plan } from '../../plan/model'
import { addLevelAbove } from '../../plan/ops'
import { ARCHIVED_PROJECTS, formatHash, NEW_PROJECT, parseHash, PROJECTS, resumeRoute } from '../../nav/route'
import { projectNumbers, projectThumbnail, totalFloorArea } from '../summary'

function site() {
  const survey = buildSurvey(parseDxf(planeSurvey()), guessRoles(analyzeLayers(parseDxf(planeSurvey()))))
  const terrain = buildTerrain(survey)
  return { survey, terrain, summary: { boundary: survey.boundary, origin: survey.origin, area: terrain.stats.area } }
}

const placed = (p: Plan): Plan => ({ ...p, placement: { e: 1008, n: 1010, rotation: 10, ffl: 83.4 } })

describe('the numbers on a project card', () => {
  it('match the numbers the app shows', () => {
    const { terrain, summary } = site()
    const plan = placed(garageFloor())
    const n = projectNumbers(summary, plan)
    // Site area: the Site panel's figure.
    expect(n.siteArea).toBe(terrain.stats.area)
    // Floor area: the Areas panel's "Floor area (outside of walls)" for the one floor.
    expect(n.floorArea).toBe(buildingOutline(planarFaces(plan.walls)).area)
    // FFL: the one floor-level helper everything else uses.
    expect(n.ffl).toBe(floorRL(plan))
  })

  it('hand check: a 10 m × 8 m box on centreline with 0.3 m walls is 10.3 × 8.3 = 85.49 m² outside', () => {
    const plan = garageFloor()
    const corners: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ]
    plan.walls = corners.map((a, i) => ({ id: `w${i}`, level: 'level_ground', a, b: corners[(i + 1) % 4], thickness: 0.3, kind: 'external' as const }))
    plan.openings = []
    expect(totalFloorArea(plan)).toBeCloseTo(85.49, 9)
  })

  it('adds the floors up, each as the Areas panel works it out', () => {
    const { plan } = addLevelAbove(placed(garageFloor()))
    const perLevel = plan.levels.map(l => buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).area)
    expect(perLevel).toHaveLength(2)
    expect(totalFloorArea(plan)).toBeCloseTo(perLevel[0] + perLevel[1], 9)
  })

  it('leave out what isn’t known yet', () => {
    expect(projectNumbers(null, null)).toEqual({ siteArea: null, floorArea: null, ffl: null })
  })
})

describe('the card thumbnail', () => {
  it('draws the block and the house, north up, inside a 100-unit box', () => {
    const { summary } = site()
    const t = projectThumbnail(summary, placed(garageFloor()))!
    const [, , w, h] = t.viewBox.split(' ').map(Number)
    expect(Math.max(w, h)).toBeCloseTo(100, 0)
    const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    for (const v of [...nums(t.block), ...nums(t.house)]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(t.block.startsWith('M')).toBe(true)
    expect(t.block.endsWith('Z')).toBe(true)
    expect(t.house.match(/M/g)).toHaveLength(1)
    // Small enough to sit in the project index.
    expect(JSON.stringify(t).length).toBeLessThan(2000)
  })

  it('draws the block alone before there is a plan, and nothing without a survey', () => {
    const { summary } = site()
    expect(projectThumbnail(summary, null)?.house).toBe('')
    expect(projectThumbnail(null, null)).toBeNull()
  })
})

describe('Projects addresses', () => {
  it('reads back the home, its archived filter and the new-project screen as they are written', () => {
    for (const [r, show] of [[PROJECTS, undefined], [ARCHIVED_PROJECTS, 'archived'], [NEW_PROJECT, 'new']] as const) {
      expect(parseHash(formatHash(r))).toEqual(r)
      expect(r.kind === 'projects' && r.show).toBe(show)
    }
    expect(formatHash(PROJECTS)).toBe('#/projects')
    expect(formatHash(ARCHIVED_PROJECTS)).toBe('#/projects/archived')
    expect(formatHash(NEW_PROJECT)).toBe('#/projects/new')
  })

  it('opens a project where it was left, or on Design › Plan', () => {
    expect(resumeRoute(undefined)).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    expect(resumeRoute('#/earthworks/cut-fill?view=3d&level=level_ground')).toEqual({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: '3d', level: 'level_ground' })
    // a place the menu no longer has, or the home itself, falls back
    expect(resumeRoute('#/gone/away')).toEqual(resumeRoute(undefined))
    expect(resumeRoute('#/projects')).toEqual(resumeRoute(undefined))
  })
})
