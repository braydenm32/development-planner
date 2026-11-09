// The live section strip under the plan, on the made-up sample block (samples/sample-block.dxf)
// with a made-up three-level split house (./fixtures): where its cut runs, how it lines up with
// the plan, what dragging a level band or a roof's eaves does, and what it remembers.

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { parseDxf } from '../../lib/dxf'
import { planTurn } from '../../lib/orientation'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { floorRL, fromSite, normalizePlan } from '../../plan/model'
import { ceilingRL, roofEavesRL } from '../../plan/roofline'
import { usePlan } from '../../plan/store'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { sectionDrawing } from '../../sections/section'
import { bearingToLineUp, defaultCut, draggedRL, heightRange, moveLevel, placeEaves, roofCuts, snapEaves, stairsOnLevel, stripFrame, topRL } from '../geometry'
import { SectionStrip } from '../SectionStrip'
import { clampHeight, DEFAULT_H, FOLDED_H, MAX_H, MIN_H, PHONE_H, readCuts, readPrefs, stripSpace, useStrip } from '../store'
import { steppedHouse } from './fixtures'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const house = () => normalizePlan(steppedHouse())
const boundaryOf = (plan = house()) => survey.boundary.map(p => fromSite(p, plan.placement, survey.origin))

/** A plan view square to the house: `k` px per m, the house frame's origin at (100, 300). */
const screen =
  (k: number) =>
  (p: Vec2): Vec2 => [100 + p[0] * k, 300 - p[1] * k]

describe('the cut the strip starts with', () => {
  it('runs through the middle of the house along its long side, past the boundary at both ends', () => {
    const plan = house()
    const b = boundaryOf(plan)
    const cut = defaultCut(plan, b)
    // The house is 20 m along x and 9 m across: the cut runs along x through y 4.5.
    expect(cut.a[1]).toBeCloseTo(4.5)
    expect(cut.b[1]).toBeCloseTo(4.5)
    expect(cut.a[0]).toBeLessThan(Math.min(...b.map(p => p[0])))
    expect(cut.b[0]).toBeGreaterThan(Math.max(...b.map(p => p[0])))
    // It passes through every level and both stairs.
    const d = sectionDrawing({ id: 's', label: 'S', ...cut }, { plan, survey, terrain })
    expect(d.floors.map(f => f.name).sort()).toEqual(['Bedrooms', 'Entry', 'Living'])
    expect(d.stairs.filter(s => s.cut).length).toBe(2)
    expect(d.retaining.length).toBeGreaterThan(0)
    expect(d.roofs.length).toBe(3)
  })

  it('runs up a house that is longer that way', () => {
    const plan = normalizePlan({ ...garageFloor(), placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 } })
    const cut = defaultCut(plan, boundaryOf(plan))
    expect(cut.a[0]).toBeCloseTo(cut.b[0])
    expect(Math.abs(cut.b[1] - cut.a[1])).toBeGreaterThan(14)
  })

  it('crosses the block when there is no house yet', () => {
    const plan = { ...house(), walls: [] }
    const b = boundaryOf(plan)
    const cut = defaultCut(plan, b)
    expect(Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1])).toBeGreaterThan(20)
  })
})

describe('lining the strip up with the plan', () => {
  it('puts each point of a level cut right under it on the plan, at the plan’s scale', () => {
    const S = screen(30)
    const f = stripFrame({ a: [-5, 4.5], b: [25, 4.5] }, S, 30)
    expect(f.linedUp).toBe(true)
    expect(f.x0).toBeCloseTo(S([-5, 4.5])[0])
    // 12 m along the cut is x 7 on the plan.
    expect(f.x0 + 12 * 30).toBeCloseTo(S([7, 4.5])[0])
  })

  it('reads left to right, whichever way the cut was drawn', () => {
    const S = screen(30)
    const f = stripFrame({ a: [25, 4.5], b: [-5, 4.5] }, S, 30)
    expect(f.cut.a).toEqual([-5, 4.5])
    expect(f.x0).toBeCloseTo(S([-5, 4.5])[0])
  })

  it('says when the cut runs at an angle, and the bearing that lines it up', () => {
    const f = stripFrame({ a: [0, 0], b: [10, 10] }, screen(30), 30)
    expect(f.linedUp).toBe(false)
    expect(f.tilt).toBeCloseTo(45)
    for (const rotation of [0, 17, -40]) {
      for (const cut of [
        { a: [0, 0] as Vec2, b: [0, 10] as Vec2 },
        { a: [0, 0] as Vec2, b: [3, 7] as Vec2 },
      ]) {
        const rho = planTurn(bearingToLineUp(cut, rotation), rotation)
        const d = [cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]]
        // Turned onto the page, the cut has no rise.
        expect(d[0] * Math.sin(rho) + d[1] * Math.cos(rho)).toBeCloseTo(0, 1)
      }
    }
  })

  it('keeps the whole house in view when it fits, and the level being drawn on when it doesn’t', () => {
    const range = { lo: 42, hi: 50 }
    // 8 m at 20 px/m is 160 px: it fits in 200, centred.
    expect(topRL(range, 44, 200, 20)).toBeCloseTo(46 + 5)
    // At 60 px/m it doesn't: the focus sits in the middle, kept inside the range.
    expect(topRL(range, 44, 200, 60)).toBeCloseTo(44 + 200 / 120)
    expect(topRL(range, 49.9, 200, 60)).toBeCloseTo(50)
    expect(topRL(range, 42, 200, 60)).toBeCloseTo(42 + 200 / 60)
  })

  it('takes its height range from the floors and roofs it cuts', () => {
    const plan = house()
    const d = sectionDrawing({ id: 's', label: 'S', ...defaultCut(plan, boundaryOf(plan)) }, { plan, survey, terrain })
    const r = heightRange(d)
    expect(r.lo).toBeCloseTo(floorRL(plan, 'living') - 1.2)
    expect(r.hi).toBeGreaterThan(ceilingRL(plan, 'bedrooms'))
  })
})

describe('dragging a level band', () => {
  beforeEach(() => usePlan.getState().load(house()))

  it('moves the floor to the 10 mm', () => {
    expect(draggedRL(45.3, -22, 33)).toBe(45.97)
    expect(draggedRL(45.3, 10, 40)).toBe(45.05)
  })

  it('re-counts the stairs that join the level as it moves, as one Undo step', () => {
    const st = usePlan.getState()
    const start = st.plan!
    expect(stairsOnLevel(start, 'entry')).toEqual(['Living 43.80 → Entry 45.30 · 8 risers of 187.5 mm', 'Entry 45.30 → Bedrooms 46.80 · 8 risers of 187.5 mm'])
    st.beginGesture()
    st.preview(() => moveLevel(start, 'entry', 45.6))
    st.preview(() => moveLevel(start, 'entry', 45.9))
    st.endGesture()
    const now = usePlan.getState()
    expect(floorRL(now.plan!, 'entry')).toBeCloseTo(45.9)
    expect(now.plan!.stairs.find(s => s.id === 'stair_1')!.rise).toBeCloseTo(2.1)
    expect(now.plan!.stairs.find(s => s.id === 'stair_2')!.rise).toBeCloseTo(0.9)
    expect(stairsOnLevel(now.plan!, 'entry')[0]).toBe('Living 43.80 → Entry 45.90 · 12 risers of 175 mm')
    expect(now.past.length).toBe(1)
    now.undo()
    expect(floorRL(usePlan.getState().plan!, 'entry')).toBeCloseTo(45.3)
  })
})

describe('dragging a roof’s eaves', () => {
  const plan = house()
  const entry = plan.roofs.find(r => r.id === 'roof_entry')!
  const bedEaves = roofEavesRL(plan, plan.roofs.find(r => r.id === 'roof_bed')!)

  it('finds the roofs the cut passes through, with their eaves', () => {
    const cuts = roofCuts(plan, defaultCut(plan, boundaryOf(plan)))
    expect(cuts.map(c => c.name)).toEqual(['Roof over Living', 'Roof over Entry', 'Roof over Bedrooms'])
    expect(cuts[1].eaves).toBeCloseTo(ceilingRL(plan, 'entry'))
    // Bedrooms is west, at the start of a cut running east; the overhangs overlap by 0.9 m.
    expect(cuts[2].s0).toBeLessThan(cuts[1].s0)
    expect(cuts[2].s1 - cuts[1].s0).toBeCloseTo(0.9)
  })

  it('snaps to another roof’s roofline, taking its pitch, ahead of the ceiling at the same height', () => {
    // 5 px short of the Bedrooms roofline at 30 px/m.
    const landing = snapEaves(plan, entry, bedEaves - 5 / 30, 30)
    expect(landing.target?.key).toBe('roof:roof_bed')
    expect(landing.target?.label).toBe('Roof over Bedrooms roofline')
    expect(landing.rl).toBeCloseTo(bedEaves)
    const next = placeEaves(plan, 'roof_entry', landing)
    const r = next.roofs.find(x => x.id === 'roof_entry')!
    expect(r.eaves).toEqual({ roof: 'roof_bed' })
    expect(roofEavesRL(next, r)).toBeCloseTo(bedEaves)
  })

  it('snaps to a level’s ceiling where no roof sits', () => {
    const noBedRoof = { ...plan, roofs: plan.roofs.filter(r => r.id !== 'roof_bed') }
    const landing = snapEaves(noBedRoof, entry, ceilingRL(plan, 'bedrooms') + 0.1, 30)
    expect(landing.target?.key).toBe('level:bedrooms')
    expect(placeEaves(noBedRoof, 'roof_entry', landing).roofs.find(r => r.id === 'roof_entry')!.eaves).toEqual({ level: 'bedrooms' })
  })

  it('lands at an RL to the 10 mm in between, and back on its walls near them', () => {
    const own = ceilingRL(plan, 'entry')
    const free = snapEaves(plan, entry, own + 0.6137, 30)
    expect(free.target).toBeNull()
    expect(free.rl).toBeCloseTo(Math.round((own + 0.6137) * 100) / 100)
    expect(placeEaves(plan, 'roof_entry', free).roofs.find(r => r.id === 'roof_entry')!.eaves).toEqual({ rl: free.rl })
    const back = snapEaves(placeEaves(plan, 'roof_entry', free), entry, own + 0.05, 30)
    expect(back.own).toBe(true)
    expect(placeEaves(plan, 'roof_entry', back).roofs.find(r => r.id === 'roof_entry')!.eaves).toBeUndefined()
  })
})

describe('what the strip remembers', () => {
  it('reads its settings, falling back when they’re missing or broken', () => {
    expect(readPrefs(null)).toEqual({ open: true, height: DEFAULT_H })
    expect(readPrefs('{oops')).toEqual({ open: true, height: DEFAULT_H })
    expect(readPrefs('{"open":false,"height":9999}')).toEqual({ open: false, height: MAX_H })
    expect(clampHeight(10)).toBe(MIN_H)
  })

  it('keeps only cuts that are cuts', () => {
    expect(readCuts('{"p1":{"a":[0,1],"b":[2,3]},"p2":{"a":[0],"b":[1,1]},"p3":null}')).toEqual({ p1: { a: [0, 1], b: [2, 3] } })
    expect(readCuts('[')).toEqual({})
  })

  it('takes room at the foot of the plan only where it shows', () => {
    expect(stripSpace(false, true, 300, false)).toBe(0)
    expect(stripSpace(true, true, 320, false)).toBe(320)
    expect(stripSpace(true, false, 320, false)).toBe(FOLDED_H)
    expect(stripSpace(true, true, 320, true)).toBe(PHONE_H)
  })
})

describe('the strip', () => {
  const render = (editable: boolean, phone = false, from?: number) => {
    const plan = house()
    usePlan.getState().load(plan)
    usePlan.getState().setActiveLevel('entry')
    // A static render reads the stores' server snapshots, their initial state: put the plan there.
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    Object.assign(useStrip.getInitialState(), { open: true, height: 300 })
    const cut = defaultCut(plan, boundaryOf(plan))
    return renderToStaticMarkup(
      <SectionStrip plan={plan} survey={survey} terrain={terrain} S={screen(30)} k={30} width={1200} left={80} right={20} cut={cut} alongHouse onReset={() => {}} onLineUp={() => {}} editable={editable} phone={phone} from={from} />,
    )
  }

  it('has a band for every level with its floor RL, the one drawn on pressed', () => {
    const html = render(true)
    for (const [name, rl] of [
      ['Living', '43.80'],
      ['Entry', '45.30'],
      ['Bedrooms', '46.80'],
    ])
      expect(html).toMatch(new RegExp(`<span class="name">${name}</span><span class="rl">${rl}</span>`))
    expect(html).toMatch(/class="sstrip-band on drags"[^>]*aria-pressed="true"/)
    expect(html).toContain('west → east')
    expect(html).toContain('Fold away')
  })

  it('draws the floors, the stairs and the roofs, with an eave to drag on each roof', () => {
    const html = render(true)
    expect(html).toContain('sec-stair-cut')
    expect(html).toContain('sec-roof-cut')
    expect(html).toContain('sec-slab')
    expect(html.match(/class="sstrip-eaves"/g)?.length).toBe(3)
    expect(html).toContain('drag an eave to snap')
  })

  it('starts right of the plan’s tool rail, its drawing still lined up under the plan', () => {
    const under = render(true)
    const beside = render(true, false, 80)
    expect(under).toMatch(/<section[^>]*style="height:300px;left:0"/)
    expect(beside).toMatch(/<section[^>]*style="height:300px;left:80px"/)
    // The drawing is 80 px narrower and moved 80 px left in the strip's own box, so it lands where it did on the screen.
    expect(beside).toContain('width="1120"')
    const xs = (html: string) => [...html.matchAll(/class="sstrip-on" x="([-\d.]+)"/g)].map(m => Number(m[1]))
    expect(xs(beside).length).toBeGreaterThan(0)
    expect(xs(beside)).toEqual(xs(under).map(x => x - 80))
    // The level bands keep clear of the panel at the same place on the screen.
    expect(under).toContain('left:88px')
    expect(beside).toContain('left:8px')
  })

  it('is a viewer on a phone: nothing to drag or resize', () => {
    const html = render(false, true)
    expect(html).not.toContain('sstrip-eaves')
    expect(html).not.toContain('sstrip-grab')
    expect(html).not.toContain('drags')
    expect(html).toContain('sec-roof-cut')
  })
})
