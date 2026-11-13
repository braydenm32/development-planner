import { describe, expect, it } from 'vitest'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import type { Vec2 } from '../../lib/geom'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { plane, planeSurvey } from '../../lib/__tests__/fixtures'
import { planarFaces, roomShape, wallPolygons } from '../geometry'
import { earthworksOf, FLOOR_STRUCTURE, houseWalls, toSite, type Plan, type Wall } from '../model'
import { addLevelAbove } from '../ops'
import { benchRing, earthworksBarriers, earthworksPlatforms, housePadRL, retainingBenches } from '../platforms'
import {
  ENGINEER_HEIGHT,
  exposedHeight,
  heightNote,
  highestOn,
  highSideBearing,
  houseCaps,
  houseGap,
  insideHouse,
  levelsForHeight,
  lowestOn,
  needsEngineer,
  retainDefaults,
  RETAINING_FREEBOARD,
  retainingProfile,
  retainingProfiles,
  retainingSection,
  retainingSolid,
  sideBearing,
  sideChange,
  type RetainingProfile,
} from '../retaining'
import {
  cancelNewRetaining,
  keepNewRetaining,
  leaveNewRetaining,
  newRetainingWall,
  placeRetainingWall,
  setEarthSide,
  SIDE_PICK_CLEAR,
  sideOfWall,
  useRetaining,
  waitingForSide,
} from '../retainingSession'
import { sideLabel } from '../../components/retainingWords'
import { usePlan } from '../store'
import { earthFrom, earthInputs } from '../useEarthworks'
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

  it('a height sets the earth side only: above the open side’s level when it has one, otherwise above the open ground', () => {
    const { plan, survey, terrain } = setup(false)
    const prof = retainingProfile(backWall, plan, survey.origin, terrain.grid)
    const pad = housePadRL(plan)
    expect(levelsForHeight({ high: 'left', lowLevel: 'pad' }, plan, prof, 1.2)).toEqual({
      high: 'left',
      lowLevel: 'pad',
      highLevel: Math.round((pad + 1.2) * 1000) / 1000,
      askedHeight: 1.2,
    })
    expect(levelsForHeight({ high: 'left', lowLevel: 82 }, plan, prof, 1.5)).toMatchObject({ highLevel: 83.5, lowLevel: 82 })
    const open = levelsForHeight({ high: 'left' }, plan, prof, 1.5)
    expect(open.lowLevel).toBeUndefined()
    expect(open.highLevel).toBeCloseTo(lowestOn(prof, 'right') + 1.5, 3)
    // An earth side already given a level moves; the open side is never cut or filled by the answer.
    expect(levelsForHeight({ high: 'left', highLevel: 87 }, plan, prof, 1.5).lowLevel).toBeUndefined()
    expect(highestOn(prof, 'left')).toBeGreaterThan(lowestOn(prof, 'right'))
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

// ---------------------------------------------------------------------------
// The one height question, and what a new wall starts with. The made-up house sits on a plane that
// rises north and east, so its south side is filled up to the pad and its north side cut down to it.

type Base = ReturnType<typeof setup>

/** The finished ground for a plan, as the app works it out. */
const finishedFor = (plan: Plan, base: Base) => earthFrom(base.terrain.grid, base.survey.boundary, earthInputs(plan, base.survey))

/** The plan with one retaining wall in it (in place of one with its id), and that wall measured on the finished ground. */
function measured(base: Base, w: Wall) {
  const plan: Plan = { ...base.plan, walls: [...base.plan.walls.filter(x => x.id !== w.id), w] }
  const earth = finishedFor(plan, base)
  return { plan, earth, prof: retainingProfile(w, plan, base.survey.origin, earth.result.grid) }
}

// South of the house's south wall, 2 m clear of it and running well past it, drawn west to east: the
// house (on its filled pad) is on its left.
const southWall: Wall = { id: 'rs', level: 'level_ground', a: [2.5, -2.1], b: [13, -2.1], thickness: 0.2, kind: 'retaining' }
// North of the house on bare ground, along the contours (level along its length), drawn so uphill is on its left.
const contourWall: Wall = { id: 'rn', level: 'level_ground', a: [0, 22], b: [10, 17], thickness: 0.2, kind: 'retaining' }

/** The same block with nothing on it but natural ground. */
const bare = (base: Base): Base => ({ ...base, plan: { ...base.plan, walls: [], rooms: [], areas: [], openings: [] } })

describe('the height question', () => {
  it('beside the filled house pad, holds the pad up and keeps the open side natural', () => {
    const base = setup(false)
    const r = retainDefaults(southWall, base.plan, base.survey.origin, base.terrain.grid)
    expect(r).toMatchObject({ high: 'left', highLevel: 'pad' })
    expect(r.lowLevel).toBeUndefined()
    expect(r.highBench).toBeCloseTo(2.0, 2)
    const before = measured(base, { ...southWall, retain: r })
    // Holding up the pad: level with it behind the wall, natural ground in front.
    const mid = before.prof.samples[Math.floor(before.prof.samples.length / 2)]
    expect(mid.left).toBeCloseTo(housePadRL(base.plan), 2)
    expect(before.prof.maxHeight).toBeGreaterThan(1.5)

    // Asking for 1.5 m changes the earth side only: nothing in front is dug out.
    const asked = levelsForHeight(r, before.plan, before.prof, 1.5)
    expect(asked.lowLevel).toBeUndefined()
    expect(asked.askedHeight).toBe(1.5)
    const after = measured(base, { ...southWall, retain: asked })
    expect(Math.abs(after.prof.maxHeight - 1.5)).toBeLessThan(0.1)
    expect(Math.abs(after.earth.result.cut - before.earth.result.cut)).toBeLessThan(1)
    const front = toSite([7.7, -3.5], base.plan.placement, base.survey.origin)
    expect(after.earth.result.grid.sample(front[0], front[1])).toBeCloseTo(base.terrain.grid.sample(front[0], front[1]), 3)

    // Asking for the pad's own height keeps following the floor.
    expect(levelsForHeight(r, before.plan, before.prof, before.prof.maxHeight).highLevel).toBe('pad')
  })

  it('a smaller answer gives a smaller wall, every time', () => {
    const base = setup(false)
    let w: Wall = { ...southWall, retain: retainDefaults(southWall, base.plan, base.survey.origin, base.terrain.grid) }
    const asked = [2.0, 1.0, 1.5, 1.2]
    const heights: number[] = []
    for (const h of asked) {
      const now = measured(base, w)
      w = { ...w, retain: levelsForHeight(w.retain!, now.plan, now.prof, h) }
      heights.push(measured(base, w).prof.maxHeight)
    }
    expect(heights[1]).toBeLessThan(heights[0])
    expect(heights[2]).toBeGreaterThan(heights[1])
    expect(heights[3]).toBeLessThan(heights[2])
    // Within a little of each answer: near the house its pad's batters have a say, and the panel says so.
    heights.forEach((h, i) => expect(Math.abs(h - asked[i])).toBeLessThan(0.2))
  })

  it('asked for more than the ground beside the house allows, says the most it allows', () => {
    const base = setup(false)
    const r = retainDefaults(southWall, base.plan, base.survey.origin, base.terrain.grid)
    const now = measured(base, { ...southWall, retain: r })
    const asked = levelsForHeight(r, now.plan, now.prof, 3)
    const after = measured(base, { ...southWall, retain: asked })
    // Next to the house the ground can't stand much above its pad: the pad's batters set it.
    expect(after.prof.maxHeight).toBeLessThan(2.95)
    expect(asked.askedHeight).toBe(3)
    expect(heightNote(asked, after.prof, after.plan)).toMatch(new RegExp(`^Most the ground allows here is ${after.prof.maxHeight.toFixed(2)} m: `))
  })

  it('says so when the ground gives another height, and why', () => {
    const plan = garageFloor()
    const w: Wall = { ...southWall, retain: { high: 'left', highLevel: 84.5, askedHeight: 2.5 } }
    const pad = housePadRL(plan)
    // The house pad (lower than the level asked for) meets the wall all along its earth side.
    const capped: RetainingProfile = {
      wall: w,
      length: 4,
      samples: [0, 1, 2, 3, 4].map(s => ({ s, left: pad, right: pad - 1.7 })),
      maxHeight: 1.7,
      faceArea: 6.8,
      top: [pad + 0.1, pad + 0.1],
      high: 'left',
    }
    expect(heightNote(w.retain, capped, plan)).toBe('Most the ground allows here is 1.70 m: the house pad meets the wall there.')
    expect(heightNote({ ...w.retain!, askedHeight: 1.7 }, capped, plan)).toBeNull()
    expect(heightNote({ high: 'left' }, capped, plan)).toBeNull()
  })

  it('a wall along the downhill house wall holds up the house pad, not nothing', () => {
    const base = setup(false)
    // On the south house wall's own line.
    const along: Wall = { id: 'ra', level: 'level_ground', a: [5.45, 0.15], b: [9.95, 0.15], thickness: 0.2, kind: 'retaining' }
    expect(houseGap(along, base.plan, 'left')).toBe(0)
    expect(houseGap(along, base.plan, 'right')).toBeNull()
    const r = retainDefaults(along, base.plan, base.survey.origin, base.terrain.grid)
    expect(r).toMatchObject({ high: 'left', highLevel: 'pad' })
    const { prof } = measured(base, { ...along, retain: r })
    const nat = retainingProfile(along, base.plan, base.survey.origin, base.terrain.grid)
    // The pad less the natural ground in front, give or take the pad's batter round the wall's ends.
    expect(prof.maxHeight).toBeGreaterThan(0.8)
    expect(prof.maxHeight).toBeLessThan(housePadRL(base.plan) - lowestOn(nat, 'right') + 0.05)
    expect(insideHouse(along, base.plan)).toBe(false)
  })

  it('a wall inside the house holds nothing and is not counted', () => {
    const base = setup(false)
    const inGarage: Wall = { id: 'ri', level: 'level_ground', a: [2, 6], b: [6, 6], thickness: 0.2, kind: 'retaining', retain: { high: 'left' } }
    expect(insideHouse(inGarage, base.plan)).toBe(true)
    const plan: Plan = { ...base.plan, walls: [...base.plan.walls, inGarage, { ...southWall, retain: { high: 'left', highLevel: 'pad' } }] }
    const earth = finishedFor(plan, base)
    expect(retainingProfiles(plan, base.survey.origin, earth.result.grid).map(p => p.wall.id)).toEqual(['rs'])
  })
})

describe('the earth side', () => {
  it('ignores a click on the wall line itself: the second click of a double-click', () => {
    const w = { a: [0, 0] as Vec2, b: [10, 0] as Vec2 }
    expect(sideOfWall(w, [10, 0.2], SIDE_PICK_CLEAR)).toBeNull()
    expect(sideOfWall(w, [5, -0.2], SIDE_PICK_CLEAR)).toBeNull()
    expect(sideOfWall(w, [5, 0.5], SIDE_PICK_CLEAR)).toBe('left')
    expect(sideOfWall(w, [5, -0.5], SIDE_PICK_CLEAR)).toBe('right')
  })

  it('picking the lower side fills it, so the earth does end up on that side', () => {
    const base = bare(setup(false))
    const w = contourWall
    const start = { ...w, retain: retainDefaults(w, base.plan, base.survey.origin, base.terrain.grid) }
    expect(start.retain).toEqual({ high: 'left' })
    usePlan.getState().load({ ...base.plan, walls: [...base.plan.walls, start] })
    setEarthSide('rn', 'right', base.survey.origin, base.terrain.grid, 0.8)
    const flipped = usePlan.getState().plan!.walls.find(x => x.id === 'rn')!
    expect(flipped.retain?.high).toBe('right')
    expect(flipped.retain?.lowLevel).toBeUndefined()
    expect(flipped.retain?.askedHeight).toBeUndefined()
    const { prof, earth, plan } = measured(base, flipped)
    // The earth side (right, downhill) now stands above the open side, clear of the wall's ends.
    for (const x of prof.samples.filter(x => x.s > 2 && x.s < prof.length - 2)) expect(x.right).toBeGreaterThan(x.left)
    expect(prof.maxHeight).toBeCloseTo(0.8, 1)
    // And the section draws the earth where its label says: higher, and filled.
    const sec = retainingSection(flipped, plan, base.survey.origin, base.terrain.grid, earth.result.grid)
    const earthSide = sec.xs.findIndex(x => x > 1)
    const openSide = sec.xs.findIndex(x => x > -1.25 && x < -1)
    expect(sec.finished[earthSide]).toBeGreaterThan(sec.finished[openSide])
    expect(sec.finished[earthSide]).toBeGreaterThan(sec.natural[earthSide])
    expect(sideChange(prof, retainingProfile({ ...w }, plan, base.survey.origin, base.terrain.grid), 'right').net).toBeGreaterThan(0)
  })

  it('keeps a typed height when the side changes', () => {
    const base = bare(setup(false))
    const w: Wall = { ...contourWall, retain: { high: 'left', highLevel: 87.5, askedHeight: 1.2 } }
    usePlan.getState().load({ ...base.plan, walls: [...base.plan.walls, w] })
    setEarthSide('rn', 'right', base.survey.origin, base.terrain.grid, 0.4)
    const flipped = usePlan.getState().plan!.walls.find(x => x.id === 'rn')!
    expect(flipped.retain?.askedHeight).toBe(1.2)
    expect(measured(base, flipped).prof.maxHeight).toBeCloseTo(1.2, 1)
  })
})

describe('a wall just drawn', () => {
  const draw = (base: Base) => {
    const w = newRetainingWall(base.plan, 'level_ground', contourWall.a, contourWall.b, 0.2, base.survey.origin, base.terrain.grid)
    placeRetainingWall(w, { pickSide: true })
    return w
  }
  const walls = () => usePlan.getState().plan!.walls.filter(w => w.kind === 'retaining')

  it('waits for its earth side: the tool starts no other wall meanwhile', () => {
    const base = setup(false)
    usePlan.getState().load(base.plan)
    const w = draw(base)
    expect(waitingForSide()).toBe(true)
    expect(useRetaining.getState().sidePick).toBe(w.id)
    // The double-click's second click, on the wall's end, is no answer.
    expect(sideOfWall(w, w.b, SIDE_PICK_CLEAR)).toBeNull()
    expect(walls()).toHaveLength(1)
  })

  it('goes again when it is left unanswered, and Undo brings it back asking', () => {
    const base = setup(false)
    usePlan.getState().load(base.plan)
    const w = draw(base)
    expect(walls()[0].retain?.draft).toBe(true)
    // Leaving it (for another tab, here) with no answer takes it off.
    leaveNewRetaining()
    expect(walls()).toHaveLength(0)
    expect(useRetaining.getState().newWall).toBeNull()
    usePlan.getState().undo()
    expect(walls().map(x => x.id)).toEqual([w.id])
    expect(useRetaining.getState().newWall).toBe(w.id)
    expect(usePlan.getState().selection).toEqual({ type: 'wall', id: w.id })
    // Selecting something else leaves it too.
    usePlan.getState().select({ type: 'room', id: 'r1' })
    expect(walls()).toHaveLength(0)
  })

  it('stays once it is kept or answered', () => {
    const base = setup(false)
    usePlan.getState().load(base.plan)
    const kept = draw(base)
    keepNewRetaining()
    expect(walls().map(x => x.id)).toEqual([kept.id])
    expect(walls()[0].retain?.draft).toBeUndefined()

    const answered = draw(base)
    usePlan.getState().commit(p => ({ ...p, walls: p.walls.map(x => (x.id === answered.id ? { ...x, retain: { high: 'left' as const, askedHeight: 1 } } : x)) }))
    usePlan.getState().setTool('select')
    expect(walls().map(x => x.id)).toEqual([kept.id, answered.id])
  })

  it('a draft saved and opened again is gone', () => {
    const base = setup(false)
    const draft: Wall = { ...southWall, retain: { high: 'left', highLevel: 'pad', draft: true } }
    usePlan.getState().load({ ...base.plan, walls: [...base.plan.walls, draft] })
    expect(walls()).toHaveLength(0)
  })
})

describe('the engineer figure', () => {
  it('is the 600 mm the checks use, from that height up', () => {
    expect(ENGINEER_HEIGHT).toBe(0.6)
    expect(needsEngineer(0.8)).toBe(true)
    expect(needsEngineer(0.6)).toBe(true)
    expect(needsEngineer(0.59)).toBe(false)
  })
})

describe('a side label under the section', () => {
  it('reads the finished ground: a filled side says filled, and a side the pad cuts is never kept natural', () => {
    expect(sideLabel({ slope: 'Uphill', level: 'RL 80.45', cut: 0.2, fill: 1.12, net: 0.6, by: null })).toEqual({ head: 'Uphill · RL 80.45', change: 'mostly fill, up to 1.12 m' })
    expect(sideLabel({ slope: 'Uphill', level: 'RL 80.45', cut: 0, fill: 1.12, net: 0.6, by: null }).change).toBe('filled 1.12 m')
    const padCut = sideLabel({ slope: 'Downhill', level: null, cut: 3.2, fill: 0, net: -2, by: 'house pad' })
    expect(padCut.change).toBe('cut 3.20 m by the house pad')
    expect(padCut.change).not.toContain('kept natural')
    expect(sideLabel({ slope: 'Downhill', level: null, cut: 0.01, fill: 0, net: 0, by: null }).change).toBe('kept natural')
  })
})

describe('a retaining wall against the house', () => {
  it('stops at the floor where the house wall holds the ground', () => {
    const doc = parseDxf(planeSurvey())
    const terrain = buildTerrain(buildSurvey(doc, guessRoles(analyzeLayers(doc))))
    const base = garageFloor()
    const plan: Plan = { ...base, placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
    // Along the outside of the east wall (centreline x 9.95, 0.3 thick), and on past its end.
    const kerb: Wall = { id: 'k', level: 'level_ground', a: [10.2, 0], b: [10.2, 20], thickness: 0.2, kind: 'retaining' }
    const prof = retainingProfile(kerb, { ...plan, walls: [...plan.walls, kerb] }, [1000, 1000], terrain.grid)
    const caps = houseCaps(prof, { ...plan, walls: [...plan.walls, kerb] })
    const at = (s: number) => caps[prof.samples.findIndex(x => x.s >= s)]
    expect(at(5)).toBeCloseTo(84, 9)
    expect(at(18)).toBeNull()
    const poly = wallPolygons([kerb]).get('k')!
    const solid = retainingSolid(poly, prof, 70, caps)
    const tops = solid.z.filter((_, i) => i % 2 === 1)
    caps.forEach((c, i) => {
      if (c !== null) expect(tops[i * 2]).toBeLessThanOrEqual(84 + 1e-9)
    })
    // a wall clear of the house isn't capped
    const clear = retainingProfile(backWall, { ...plan, walls: [...plan.walls, backWall] }, [1000, 1000], terrain.grid)
    expect(houseCaps(clear, plan).every(c => c === null)).toBe(true)
  })
})
