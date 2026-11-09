import { describe, expect, it } from 'vitest'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { plane, planeSurvey } from '../../lib/__tests__/fixtures'
import { planarFaces, roomShape, wallPolygons } from '../geometry'
import { earthworksOf, FLOOR_STRUCTURE, houseWalls, toSite, type Plan, type Wall } from '../model'
import { addLevelAbove } from '../ops'
import { benchRing, earthworksBarriers, earthworksPlatforms, housePadRL, retainingBenches } from '../platforms'
import {
  exposedHeight,
  highestOn,
  highSideBearing,
  houseGap,
  levelsForHeight,
  retainDefaults,
  RETAINING_FREEBOARD,
  retainingProfile,
  retainingSection,
  retainingSolid,
  sideBearing,
} from '../retaining'
import { cancelNewRetaining, keepNewRetaining, newRetainingWall, placeRetainingWall, useRetaining } from '../retainingSession'
import { usePlan } from '../store'
import { garageFloor } from './fixtures'

// A retaining wall 0.9 m north of the open area slab, across the back of the block.
const backWall: Wall = { id: 'rw', level: 'level_ground', a: [-1, 17], b: [10, 17], thickness: 0.2, kind: 'retaining' }

function setup(withWall: boolean) {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  const base = garageFloor()
  const plan: Plan = { ...base, placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 }, walls: withWall ? [...base.walls, backWall] : base.walls }
  const prep = prepareEarthworks(
    terrain.grid,
    survey.boundary,
    earthworksPlatforms(plan, survey.origin),
    earthworksOf(plan),
    earthworksBarriers(plan, survey.origin),
  )
  // Natural ground at a point on the plan.
  const natural = (p: [number, number]) => {
    const s = toSite(p, plan.placement, survey.origin)
    return plane(s[0] + survey.origin[0] - 1000, s[1] + survey.origin[1] - 1000)
  }
  return { plan, survey, terrain, natural, ground: evaluateEarthworks(prep).grid }
}

describe('retaining walls', () => {
  it("aren't part of the house", () => {
    const plan = garageFloor()
    const spur: Wall = { id: 'spur', level: 'level_ground', a: [9.059, 12.921], b: [13, 12.921], thickness: 0.2, kind: 'retaining' }
    const across: Wall = { id: 'across', level: 'level_ground', a: [3, 5], b: [3, 9], thickness: 0.2, kind: 'retaining' }
    const before = planarFaces(plan.walls)
    const after = planarFaces([...plan.walls, spur, across])
    for (const r of plan.rooms) expect(roomShape(r, after)?.area).toBeCloseTo(roomShape(r, before)!.area, 9)
    expect(houseWalls([...plan.walls, spur])).toHaveLength(plan.walls.length)
    // A retaining wall meeting a house wall isn't mitred into it, and the house wall is unchanged.
    expect(wallPolygons([...plan.walls, spur]).get('east')).toEqual(wallPolygons(plan.walls).get('east'))
    // A new level copies the house's external walls, not retaining walls.
    const { plan: two, id } = addLevelAbove({ ...plan, walls: [...plan.walls, spur] })
    expect(two.walls.filter(w => w.level === id).some(w => w.kind === 'retaining')).toBe(false)
  })

  it('holds back the natural ground behind it', () => {
    const open = setup(false)
    const walled = setup(true)
    const behind = toSite([4, 18], walled.plan.placement, walled.survey.origin)
    // Without the wall the cut batter reaches back past it; with it, the ground behind is untouched.
    expect(open.ground.sample(behind[0], behind[1])).toBeLessThan(walled.natural([4, 18]) - 0.05)
    expect(walled.ground.sample(behind[0], behind[1])).toBeCloseTo(walled.terrain.grid.sample(behind[0], behind[1]), 6)
  })

  it('measures how much it holds back', () => {
    const { plan, survey, ground, natural } = setup(true)
    const p = retainingProfile(backWall, plan, survey.origin, ground)
    expect(p.length).toBeCloseTo(11, 9)
    // Drawn west to east, so north (uphill) is on its left.
    expect(p.high).toBe('left')
    // Natural ground behind is about RL 85.4 to 86.5; in front the cut is near the slab's level.
    expect(p.maxHeight).toBeGreaterThan(1)
    expect(p.maxHeight).toBeLessThan(3)
    expect(p.faceArea).toBeGreaterThan(p.length * 1)
    expect(p.faceArea).toBeLessThan(p.length * p.maxHeight)
    // Mid-wall the ground behind is natural (near the ends the batter wraps round), and the top stands just above it.
    const mid = p.samples.find(x => Math.abs(x.s - 5.5) < 0.01)!
    expect(mid.left).toBeCloseTo(natural([4.5, 17.45]), 1)
    expect(p.top[0]).toBeLessThan(mid.left + RETAINING_FREEBOARD)
    expect(p.top[1]).toBeGreaterThan(mid.left + RETAINING_FREEBOARD)
    // Drawn on the house square to north, so the high side is due north.
    expect(highSideBearing(p, plan)).toBeCloseTo(0, 6)
  })

  it('makes a closed solid whose top follows the ground', () => {
    const { plan, survey, ground } = setup(true)
    const p = retainingProfile(backWall, plan, survey.origin, ground)
    const poly = wallPolygons([backWall]).get('rw')!
    const solid = retainingSolid(poly, p, 80)
    // Every edge is used once in each direction, so the mesh is closed and consistently wound.
    const edges = new Map<string, number>()
    for (let t = 0; t < solid.tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = solid.tris[t + e]
        const b = solid.tris[t + ((e + 1) % 3)]
        edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1)
      }
    }
    for (const [k, n] of edges) {
      expect(n).toBe(1)
      const [a, b] = k.split('>')
      expect(edges.get(`${b}>${a}`)).toBe(1)
    }
    // Volume by the divergence theorem: positive when the faces point out.
    let vol = 0
    for (let t = 0; t < solid.tris.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(e => [...solid.pts[solid.tris[t + e]], solid.z[solid.tris[t + e]]])
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
    const meanTop = p.samples.reduce((t, x) => t + Math.max(x.left, x.right), 0) / p.samples.length + RETAINING_FREEBOARD
    expect(vol).toBeCloseTo(11 * 0.2 * (meanTop - 80), 0)
  })
})

describe('retaining walls told what to hold', () => {
  it('a new wall holds back the uphill side, and cuts the house side to the house pad out to the house', () => {
    const { plan, survey, terrain } = setup(false)
    const r = retainDefaults(backWall, plan, survey.origin, terrain.grid)
    // Drawn west to east with the ground rising north: its left side is uphill.
    expect(r.high).toBe('left')
    expect(r.lowLevel).toBe('pad')
    // From the wall's south face (y 16.9) to the entry hall's north face (13.85 + 0.3 / 2).
    expect(r.lowBench).toBeCloseTo(16.9 - (13.85 + 0.3 / 2), 3)
    expect(houseGap(backWall, plan, 'left')).toBeNull()
    expect(r.highLevel).toBeUndefined()
    expect(r.top).toBeUndefined()
    // The pad is the slab's underside: FFL less the floor structure.
    expect(housePadRL(plan)).toBeCloseTo(84 - FLOOR_STRUCTURE, 9)
  })

  it('a wall away from the house keeps both sides natural until asked', () => {
    const { plan, survey, terrain } = setup(false)
    const far: Wall = { ...backWall, id: 'far', a: [2, 22.5], b: [9, 22.5] }
    expect(retainDefaults(far, plan, survey.origin, terrain.grid)).toEqual({ high: 'left' })
    expect(retainingBenches({ ...plan, walls: [...plan.walls, { ...far, retain: { high: 'left' } }] }, survey.origin)).toEqual([])
  })

  it('makes level ground beside the wall on each side with a level, square off its face', () => {
    const ring = benchRing({ a: [0, 0], b: [10, 0], thickness: 0.2 }, 'right', 2)
    expect(ring.map(p => p.map(v => Math.round(v * 1000) / 1000))).toEqual([
      [0, -2.1],
      [10, -2.1],
      [10, 0],
      [0, 0],
    ])
    const left = benchRing({ a: [0, 0], b: [10, 0], thickness: 0.2 }, 'left', 2)
    expect(left).toEqual([
      [0, 0],
      [10, 0],
      [10, 2.1],
      [0, 2.1],
    ])
  })

  it('a height sets the levels: above the low side when it has one, otherwise cut below the high ground', () => {
    const { plan, survey, terrain } = setup(false)
    const prof = retainingProfile(backWall, plan, survey.origin, terrain.grid)
    const pad = housePadRL(plan)
    expect(levelsForHeight({ high: 'left', lowLevel: 'pad' }, plan, prof, 1.2)).toEqual({ high: 'left', lowLevel: 'pad', highLevel: Math.round((pad + 1.2) * 1000) / 1000 })
    expect(levelsForHeight({ high: 'left', lowLevel: 82 }, plan, prof, 1.5)).toMatchObject({ highLevel: 83.5 })
    const cut = levelsForHeight({ high: 'left' }, plan, prof, 1.5)
    expect(cut.lowLevel).toBeCloseTo(highestOn(prof, 'left') - 1.5, 3)
    expect(levelsForHeight({ high: 'left', highLevel: 87 }, plan, prof, 1.5).lowLevel).toBe(85.5)
  })

  it('cuts the house side to the pad: the wall then holds back the natural ground less the pad', () => {
    const { plan, survey, terrain } = setup(false)
    const w: Wall = { ...backWall, retain: retainDefaults(backWall, plan, survey.origin, terrain.grid) }
    const p: Plan = { ...plan, walls: [...plan.walls, w] }
    const prep = prepareEarthworks(terrain.grid, survey.boundary, earthworksPlatforms(p, survey.origin), { ...earthworksOf(p), cutBatter: 0, fillBatter: 0 }, earthworksBarriers(p, survey.origin))
    const ground = evaluateEarthworks(prep).grid
    const prof = retainingProfile(w, p, survey.origin, ground)
    const pad = housePadRL(p)
    // Past the open area's slab (which is higher, and wins where it is level): natural ground 0.45 m behind, the pad in front.
    const mid = prof.samples.find(x => Math.abs(x.s - 9.5) < 0.01)!
    const behind = toSite([8.5, 17.45], p.placement, survey.origin)
    expect(mid.right).toBeCloseTo(pad, 4)
    expect(mid.left).toBeCloseTo(terrain.grid.sample(behind[0], behind[1]), 4)
    expect(prof.high).toBe('left')
    expect(exposedHeight(prof)).toBeCloseTo(prof.maxHeight + RETAINING_FREEBOARD, 6)
    // The section through it shows the cut: finished ground at the pad in front, natural ground above it.
    const sec = retainingSection(w, p, survey.origin, terrain.grid, ground)
    const front = sec.xs.findIndex(x => x < -1 && x > -1.2)
    expect(sec.finished[front]).toBeCloseTo(pad, 3)
    expect(sec.natural[front]).toBeGreaterThan(pad + 0.5)
  })

  it('level ground at the pad follows the floor when it is balanced; level ground at an RL stays', () => {
    const { plan, survey, terrain } = setup(false)
    const at = (lowLevel: 'pad' | number) => {
      const w: Wall = { ...backWall, retain: { high: 'left', lowLevel, lowBench: 3.8 } }
      const p: Plan = { ...plan, walls: [...plan.walls, w] }
      const prep = prepareEarthworks(terrain.grid, survey.boundary, earthworksPlatforms(p, survey.origin), earthworksOf(p), earthworksBarriers(p, survey.origin))
      const q = toSite([8.5, 16], p.placement, survey.origin)
      return (shift: number) => evaluateEarthworks(prep, shift).grid.sample(q[0], q[1])
    }
    const pad = housePadRL(plan)
    expect(at('pad')(0)).toBeCloseTo(pad, 4)
    expect(at('pad')(0.5)).toBeCloseTo(pad + 0.5, 4)
    expect(at(pad)(0.5)).toBeCloseTo(pad, 4)
  })

  it('names each side by compass: the same bearing as the high side', () => {
    const { plan, survey, ground } = setup(true)
    const p = retainingProfile(backWall, plan, survey.origin, ground)
    expect(sideBearing(backWall, 'left', plan)).toBeCloseTo(highSideBearing(p, plan)!, 9)
    expect(sideBearing(backWall, 'right', plan)).toBeCloseTo(180, 6)
    // A wall told its side keeps it, whatever the ground says.
    expect(retainingProfile({ ...backWall, retain: { high: 'right' } }, plan, survey.origin, ground).high).toBe('right')
  })

  it('a wall just drawn can be placed, or cancelled; Undo brings a cancelled one back', () => {
    const { plan, survey, terrain } = setup(false)
    const st = usePlan.getState()
    st.load(plan)
    const w = newRetainingWall(plan, 'level_ground', [-1, 17], [10, 17], 0.2, survey.origin, terrain.grid)
    expect(w.kind).toBe('retaining')
    expect(w.retain?.high).toBe('left')
    placeRetainingWall(w)
    expect(usePlan.getState().plan!.walls.some(x => x.id === w.id)).toBe(true)
    expect(usePlan.getState().selection).toEqual({ type: 'wall', id: w.id })
    expect(useRetaining.getState().newWall).toBe(w.id)
    cancelNewRetaining()
    expect(usePlan.getState().plan!.walls.some(x => x.id === w.id)).toBe(false)
    expect(useRetaining.getState().newWall).toBeNull()
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.walls.some(x => x.id === w.id)).toBe(true)
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.walls.some(x => x.id === w.id)).toBe(false)

    const again = newRetainingWall(plan, 'level_ground', [-1, 17], [10, 17], 0.2, survey.origin, terrain.grid)
    placeRetainingWall(again)
    keepNewRetaining()
    expect(useRetaining.getState().newWall).toBeNull()
    expect(usePlan.getState().plan!.walls.some(x => x.id === again.id)).toBe(true)
    // Selecting something else also stops asking about it.
    const third = newRetainingWall(plan, 'level_ground', [-1, 18], [10, 18], 0.2, survey.origin, terrain.grid)
    placeRetainingWall(third)
    usePlan.getState().select({ type: 'room', id: 'r1' })
    expect(useRetaining.getState().newWall).toBeNull()
  })

  it('keeps its levels through saving and loading', async () => {
    const { parsePlanFile } = await import('../store')
    const w: Wall = { ...backWall, retain: { high: 'left', lowLevel: 'pad', lowBench: 3.8, highLevel: 86.2, top: 86.4 } }
    const back = parsePlanFile(JSON.stringify({ ...garageFloor(), walls: [...garageFloor().walls, w] }))
    expect(back.walls.find(x => x.id === 'rw')?.retain).toEqual(w.retain)
  })
})
