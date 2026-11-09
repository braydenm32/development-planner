import { afterEach, describe, expect, it } from 'vitest'
import { evaluateEarthworks, prepareEarthworks, volumesWithout } from '../../lib/earthworks'
import { parseDxf } from '../../lib/dxf'
import type { Vec2 } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain, Heightfield } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { parsePlanFile, usePlan } from '../../plan/store'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { applyStroke, areaCells, areaM2, areaOutline, gradePlatformId, gradingPlatforms, paintPlan, rowsOf, strokeCells, type Grading } from '../model'
import { addSuggestedWall, dismissSuggestion, planWallSuggestions } from '../walls'
import { addedText, addSuggestion } from '../actions'
import { ownVolumes } from '../ownVolumes'
import { retainingProfiles } from '../../plan/retaining'
import { useSafety } from '../../safety/store'

/** Squares covering easting e0 to e1 and northing n0 to n1 (whole squares of 0.5 m). */
function box(e0: number, n0: number, e1: number, n1: number): Set<string> {
  const out = new Set<string>()
  for (let j = Math.round(n0 / 0.5); j < Math.round(n1 / 0.5); j++) for (let i = Math.round(e0 / 0.5); i < Math.round(e1 / 0.5); i++) out.add(`${i},${j}`)
  return out
}

describe('painting with the grading brush', () => {
  it('covers the squares along a stroke, round at a dab', () => {
    const dab = strokeCells([[10, 10]], 1)
    // Squares whose middles are within 1 m: a 4 × 4 block less its corners.
    expect(dab.size).toBe(12)
    const line = strokeCells([[10, 10], [20, 10]], 1)
    expect(line.size).toBeGreaterThan(dab.size * 6)
    expect(line.has('30,20')).toBe(true) // the square from 15 m to 15.5 m east, 10 to 10.5 m north
    expect(line.has('30,22')).toBe(false) // 11 m north: out of reach
  })

  it('stores a stroke as runs along rows, and adds to the area at the same level', () => {
    let g = applyStroke(undefined, { mode: 'cut', rl: 44.2, cells: box(10, 10, 12, 11) })!
    expect(g.areas).toHaveLength(1)
    expect(g.areas[0]).toMatchObject({ mode: 'cut', rl: 44.2, rows: [[20, 20, 23], [21, 20, 23]] })
    expect(areaM2(g.areas[0])).toBe(2)
    g = applyStroke(g, { mode: 'cut', rl: 44.2, cells: box(12, 10, 13, 11) })!
    expect(g.areas).toHaveLength(1)
    expect(g.areas[0].rows).toEqual([[20, 20, 25], [21, 20, 25]])
    // Another level is another area, and takes the squares it covers.
    g = applyStroke(g, { mode: 'fill', rl: 43, cells: box(12, 10, 13, 11) })!
    expect(g.areas.map(a => [a.mode, a.rl, areaM2(a)])).toEqual([
      ['cut', 44.2, 2],
      ['fill', 43, 1],
    ])
    expect(areaOutline(g.areas[0])).toHaveLength(4)
    expect(rowsOf(areaCells(g.areas[0]))).toEqual(g.areas[0].rows)
  })

  it('rubs out with the eraser, and leaves nothing when it’s all gone', () => {
    const g = applyStroke(undefined, { mode: 'fill', rl: 40, cells: box(0, 0, 3, 1) })!
    const less = applyStroke(g, { mode: 'erase', cells: box(1, 0, 2, 1) })!
    expect(less.areas[0].rows).toEqual([
      [0, 0, 1],
      [0, 4, 5],
      [1, 0, 1],
      [1, 4, 5],
    ])
    expect(applyStroke(less, { mode: 'erase', cells: box(0, 0, 3, 1) })).toBeUndefined()
    // A stroke that changes nothing is the same grading.
    expect(applyStroke(g, { mode: 'fill', rl: 40, cells: box(0, 0, 1, 1) })).toBe(g)
    expect(applyStroke(undefined, { mode: 'erase', cells: box(0, 0, 1, 1) })).toBeUndefined()
  })
})

describe('painted grading in the earthworks', () => {
  /** A 40 m square block on a 0.25 m grid, its ground rising 1 in 10 to the east. */
  function block(z: (x: number, y: number) => number) {
    const n = 161
    const h = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = z(i * 0.25, j * 0.25)
    const boundary: Vec2[] = [
      [0.1, 0.1],
      [39.9, 0.1],
      [39.9, 39.9],
      [0.1, 39.9],
    ]
    return { grid: new Heightfield(0, 0, 0.25, n, n, h), boundary }
  }
  const run = (g: Grading, z: (x: number, y: number) => number = x => 10 + 0.1 * x, batter = 2) => {
    const { grid, boundary } = block(z)
    return evaluateEarthworks(prepareEarthworks(grid, boundary, gradingPlatforms({ grading: g }, [0, 0]), { margin: 0.5, cutBatter: batter, fillBatter: batter }))
  }

  it('cut only lowers ground above the level, and fill only raises ground below it', () => {
    // A band right across the block, to RL 11, where the ground runs from 10.5 to 12.5.
    const cut = run(applyStroke(undefined, { mode: 'cut', rl: 11, cells: box(5, 15, 25, 25) })!)
    expect(cut.fill).toBe(0)
    expect(cut.grid.sample(7, 20)).toBeCloseTo(10.7, 4) // lower ground left alone
    expect(cut.grid.sample(20, 20)).toBeCloseTo(11, 4)
    const fill = run(applyStroke(undefined, { mode: 'fill', rl: 11, cells: box(5, 15, 25, 25) })!)
    expect(fill.cut).toBe(0)
    expect(fill.grid.sample(7, 20)).toBeCloseTo(11, 4)
    expect(fill.grid.sample(20, 20)).toBeCloseTo(12, 4) // higher ground left alone
  })

  it('batters back from the painted edge at the project’s slopes', () => {
    const g = applyStroke(undefined, { mode: 'cut', rl: 9, cells: box(15, 15, 25, 25) })!
    const r = run(g, () => 10, 2)
    // 1 m out from the east edge, half way up a 1 in 2 batter.
    expect(r.grid.sample(26, 20)).toBeGreaterThan(9.4)
    expect(r.grid.sample(26, 20)).toBeLessThan(9.6)
    expect(r.grid.sample(28, 20)).toBeCloseTo(10, 4)
    // 100 m³ under the area, plus the batter's wedge round it: 1 m² across, 40 m round, and the corners.
    expect(r.cut).toBeGreaterThan(138)
    expect(r.cut).toBeLessThan(150)
  })
})

describe('grading with a plan', () => {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  // The made-up garage floor, out of the way, and the block bare: the painting on its own.
  const bare: Plan = { ...garageFloor(), walls: [], areas: [], rooms: [], openings: [], placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
  const earthOf = (p: Plan) => earthFrom(terrain.grid, survey.boundary, earthInputs(p, survey))
  const natural = (e: number, n: number) => terrain.grid.sample(e - survey.origin[0], n - survey.origin[1])

  afterEach(() => usePlan.getState().load(null))

  it('works out the painted area’s own cut on the test plane survey', () => {
    // 6 m by 4 m cut to RL 85 where the plane is at 86.5 in the middle.
    const plan = paintPlan(bare, { mode: 'cut', rl: 85, cells: box(1010, 1024, 1016, 1028) })
    const earth = earthOf(plan)
    expect(earth.platforms.map(p => p.id)).toEqual([gradePlatformId(plan.grading!.areas[0].id)])
    const without = volumesWithout(earth.prep, p => p.id === earth.platforms[0].id)
    expect(without).toEqual({ cut: 0, fill: 0 })
    // 24 m² at 1.5 m deep on average under the painted squares...
    const g = earth.result.grid
    let under = 0
    for (let j = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++) {
        const e = g.x0 + i * g.cell + survey.origin[0]
        const n = g.y0 + j * g.cell + survey.origin[1]
        if (e >= 1010 && e < 1016 && n >= 1024 && n < 1028) under += (terrain.grid.z[j * g.nx + i] - g.z[j * g.nx + i]) * g.cell * g.cell
      }
    }
    expect(under).toBeGreaterThan(35)
    expect(under).toBeLessThan(37)
    // ...and its batters, wider on the uphill side, about as much again.
    expect(earth.result.cut).toBeGreaterThan(80)
    expect(earth.result.cut).toBeLessThan(105)
    expect(earth.result.fill).toBe(0)
    expect(g.sample(1013 - survey.origin[0], 1026 - survey.origin[1])).toBeCloseTo(85, 3)
  })

  it('makes one undo step per stroke', () => {
    const st = usePlan.getState()
    st.load(bare)
    st.commit(p => paintPlan(p, { mode: 'fill', rl: 84, cells: box(1010, 1010, 1012, 1012) }))
    st.commit(p => paintPlan(p, { mode: 'fill', rl: 84, cells: box(1012, 1010, 1014, 1012) }))
    expect(usePlan.getState().past).toHaveLength(2)
    // A stroke over what's already painted changes nothing, so the brush has nothing to commit.
    const now = usePlan.getState().plan!
    expect(paintPlan(now, { mode: 'fill', rl: 84, cells: box(1010, 1010, 1011, 1011) })).toBe(now)
    usePlan.getState().undo()
    expect(areaM2(usePlan.getState().plan!.grading!.areas[0])).toBe(4)
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.grading).toBeUndefined()
  })

  it('leaves an older plan as it was', () => {
    const old = garageFloor()
    const loaded = parsePlanFile(JSON.stringify(old))
    expect('grading' in loaded).toBe(false)
    expect(normalizePlan(loaded)).toEqual(loaded)
    expect(gradingPlatforms(loaded, survey.origin)).toEqual([])
    // Painted grading saves and loads back.
    const painted = paintPlan(old, { mode: 'cut', rl: 85, cells: box(1010, 1024, 1012, 1025) })
    expect(parsePlanFile(JSON.stringify(painted)).grading).toEqual(painted.grading)
    // And something broken in a file is left out rather than breaking the plan.
    expect(normalizePlan({ ...old, grading: { cell: 0.5, areas: [{ id: 'x', mode: 'up', rl: 1, rows: [] }] } as never }).grading).toBeUndefined()
  })

  it('suggests a wall below a tall fill, and Add makes a real one the batter stops at', () => {
    // Fill to RL 84.5 on ground falling 1 in 5 to the south: 1.3 m deep at its south edge.
    const plan = paintPlan(bare, { mode: 'fill', rl: 84.5, cells: box(1012, 1010, 1018, 1016) })
    const before = earthOf(plan)
    const south = planWallSuggestions(plan, survey, before).find(s => s.rule === 'tall' && Math.abs(s.a[1] - s.b[1]) < 0.1)!
    expect(south).toBeDefined()
    expect(south.kind).toBe('fill')
    expect(south.why).toMatch(/^Fill batter would be \d\.\d m high, more than the 1 m a batter alone should be: a 1\.[34] m wall holds it$/)
    expect(south.engineer).toBe(true)
    const y = (south.a[1] + south.b[1]) / 2 + survey.origin[1]
    expect(y).toBeGreaterThan(1009.6)
    expect(y).toBeLessThan(1010.2)
    // A metre below it the batter's fill stands well above the natural ground...
    const ground = (e: { result: { grid: Heightfield } }, n: number) => e.result.grid.sample(1015 - survey.origin[0], n - survey.origin[1])
    expect(ground(before, 1009) - natural(1015, 1009)).toBeGreaterThan(0.4)

    const st = usePlan.getState()
    st.load(plan)
    st.commit(p => addSuggestedWall(p, south, survey.origin).plan)
    expect(usePlan.getState().past).toHaveLength(1)
    const after = usePlan.getState().plan!
    expect(after.walls.length).toBe(south.path.length - 1)
    for (const wall of after.walls) expect(wall).toMatchObject({ kind: 'retaining', thickness: 0.2, level: 'level_ground', retain: { high: 'left' } })
    // ...and with the wall there it's natural ground again, and the suggestion has gone.
    const held = earthOf(after)
    expect(held.strips).toHaveLength(south.path.length - 1)
    expect(ground(held, 1009)).toBeCloseTo(natural(1015, 1009), 2)
    expect(ground(held, 1012)).toBeCloseTo(84.5, 2)
    expect(planWallSuggestions(after, survey, held).some(s => Math.abs(s.a[1] - s.b[1]) < 0.1 && Math.abs((s.a[1] + s.b[1]) / 2 + survey.origin[1] - y) < 1)).toBe(false)
  })

  it('remembers a dismissed suggestion', () => {
    const plan = paintPlan(bare, { mode: 'fill', rl: 84.5, cells: box(1012, 1010, 1018, 1016) })
    const all = planWallSuggestions(plan, survey, earthOf(plan))
    const gone = dismissSuggestion(plan, all[0], survey.origin)
    const left = planWallSuggestions(gone, survey, earthOf(gone))
    expect(left).toHaveLength(all.length - 1)
    expect(left.some(s => s.key === all[0].key)).toBe(false)
    expect(normalizePlan(JSON.parse(JSON.stringify(gone))).grading!.dismissed).toHaveLength(1)
  })

  it('says the height the added walls really hold, measured on the finished ground, and their return walls', () => {
    const plan = paintPlan(bare, { mode: 'fill', rl: 84.5, cells: box(1012, 1010, 1018, 1016) })
    const before = earthOf(plan)
    const south = planWallSuggestions(plan, survey, before).find(s => s.rule === 'tall' && Math.abs(s.a[1] - s.b[1]) < 0.1)!
    const st = usePlan.getState()
    st.load(plan)
    addSuggestion(south, survey, terrain.grid)
    const after = usePlan.getState().plan!
    const held = retainingProfiles(after, survey.origin, earthOf(after).result.grid)
    const most = Math.max(...held.map(p => p.maxHeight))
    const text = useSafety.getState().toast!.text
    expect(text).toContain(`holding back up to ${most.toFixed(2)} m`)
    expect(text).toMatch(after.walls.length > 1 ? /plus (a [\d.]+ m return|returns of )/ : /^Retaining wall added there, holding/)
    // A suggestion of two runs is a wall and its return, and says so.
    const w0 = after.walls[0]
    const main = { ...w0, id: 'main', a: [w0.a[0], w0.a[1]] as Vec2, b: [w0.a[0] + 8, w0.a[1]] as Vec2 }
    const walls = [main, { ...w0, id: 'ret', a: main.b, b: [main.b[0], main.b[1] + 4.6] as Vec2 }]
    expect(addedText({ ...after, walls }, walls, survey, terrain.grid)).toMatch(/^Retaining wall added there, plus a 4\.6 m return, holding back up to \d\.\d\d m\./)
  })

  it('never gives painted ground a share of cut or fill below nothing', () => {
    // Cut painted right up against the house, whose fill batter overlaps it, and a fill area overlapping the cut's batter.
    const house: Plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
    let plan = paintPlan(house, { mode: 'cut', rl: 81.3, cells: box(1004, 1003, 1018, 1006) })
    plan = paintPlan(plan, { mode: 'fill', rl: 83.5, cells: box(1018, 1003, 1022, 1008) })
    const earth = earthOf(plan)
    const own = ownVolumes(earth, plan.grading!.areas)
    expect(own.size).toBe(3)
    for (const v of own.values()) {
      expect(v.cut).toBeGreaterThanOrEqual(0)
      expect(v.fill).toBeGreaterThanOrEqual(0)
    }
  })
})
