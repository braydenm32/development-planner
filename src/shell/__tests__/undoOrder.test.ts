// One undo order across the plan, the site features and the costs (LD-35, LF-19): the latest
// change anywhere is what Undo takes back, the buttons name the step, and a step taken back on
// another screen is said in a toast. Synthetic data only: the test garage.

import { beforeEach, describe, expect, it } from 'vitest'
import { useCosts } from '../../costs/store'
import { emptyCosts } from '../../costs/model'
import { areaRoute } from '../../nav/route'
import { useRouter } from '../../nav/router'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { useSafety } from '../../safety/store'
import { emptySiteData, useSiteStore, type SiteData } from '../../site/store'
import { undoTarget } from '../undoTarget'
import { nameCostsStep, namePlanStep, nameSiteStep, placeLabel } from '../undoSteps'

const plan = () => usePlan.getState().plan!
const ffl = (v: number) => usePlan.getState().commit(p => ({ ...p, placement: { ...p.placement, ffl: v } }))
const dropWall = () => usePlan.getState().commit(p => ({ ...p, walls: p.walls.slice(1) }))
const margin = (v: number) => useCosts.getState().commit(d => ({ ...d, margin: v }))
const tree = (id: string) =>
  useSiteStore.getState().commit(d => ({ ...d, features: [...d.features, { id, type: 'tree' as const, geom: { kind: 'point' as const, at: [1, 2] as [number, number] }, source: 'trace' as const }] }))
const toast = () => useSafety.getState().toast

beforeEach(() => {
  usePlan.getState().load(garageFloor())
  useSiteStore.setState({ data: emptySiteData(), past: [], future: [], focus: false })
  useCosts.getState().load(emptyCosts())
  useCosts.setState({ focus: false })
  useSafety.setState({ toast: null })
  useRouter.setState({ route: areaRoute('design', 'plan') })
})

describe('one undo order across the project', () => {
  it('takes back the latest change anywhere, whichever screen is open', () => {
    expect(undoTarget('undo').kind).toBeNull()
    expect(undoTarget('undo').past).toHaveLength(0)
    dropWall()
    margin(0.3)
    tree('t1')
    ffl(50)
    // Costs is open (it used to mean only cost changes could be undone there).
    useCosts.setState({ focus: true })
    useRouter.setState({ route: areaRoute('costs', 'estimate') })
    expect(undoTarget('undo').kind).toBe('plan')
    undoTarget('undo').undo()
    expect(plan().placement.ffl).not.toBe(50)
    expect(undoTarget('undo').kind).toBe('site')
    undoTarget('undo').undo()
    expect(useSiteStore.getState().data.features).toHaveLength(0)
    expect(undoTarget('undo').kind).toBe('costs')
    undoTarget('undo').undo()
    expect(useCosts.getState().data.margin).not.toBe(0.3)
    expect(undoTarget('undo').kind).toBe('plan')
    undoTarget('undo').undo()
    expect(plan().walls).toHaveLength(garageFloor().walls.length)
    expect(undoTarget('undo').kind).toBeNull()

    // Redo brings them back in the order they were made.
    for (const k of ['plan', 'costs', 'site', 'plan']) {
      expect(undoTarget('redo').kind).toBe(k)
      undoTarget('redo').redo()
    }
    expect(undoTarget('redo').kind).toBeNull()
    expect(plan().placement.ffl).toBe(50)
    expect(useSiteStore.getState().data.features).toHaveLength(1)
    expect(useCosts.getState().data.margin).toBe(0.3)
  })

  it('a new change ends Redo everywhere, not only in its own history', () => {
    tree('t1')
    dropWall()
    undoTarget('undo').undo()
    undoTarget('undo').undo()
    expect(undoTarget('redo').kind).toBe('site')
    margin(0.25)
    expect(undoTarget('redo').kind).toBeNull()
    expect(undoTarget('redo').future).toHaveLength(0)
    expect(useSiteStore.getState().future).toHaveLength(0)
    expect(usePlan.getState().future).toHaveLength(0)
    expect(undoTarget('undo').kind).toBe('costs')
  })

  it('follows steps undone straight on a history (the plan’s own keys)', () => {
    dropWall()
    tree('t1')
    useSiteStore.getState().undo()
    expect(undoTarget('undo').kind).toBe('plan')
    expect(undoTarget('redo').kind).toBe('site')
    useSiteStore.getState().redo()
    expect(undoTarget('undo').kind).toBe('site')
  })

  it('keeps a drag (one gesture) and a run of nudges as one step each', () => {
    const st = usePlan.getState()
    st.beginGesture()
    st.preview(p => ({ ...p, placement: { ...p.placement, e: p.placement.e + 1 } }))
    st.preview(p => ({ ...p, placement: { ...p.placement, e: p.placement.e + 1 } }))
    st.endGesture()
    margin(0.4)
    undoTarget('undo').undo()
    expect(undoTarget('undo').kind).toBe('plan')
    expect(undoTarget('undo').label).toBe('move the house')
    undoTarget('undo').undo()
    expect(plan().placement.e).toBe(garageFloor().placement.e)
    expect(undoTarget('undo').kind).toBeNull()
  })

  it('starts again when a project opens, and takes a saved plan history as it is put back', () => {
    dropWall()
    tree('t1')
    usePlan.getState().load(garageFloor())
    useSiteStore.setState({ data: emptySiteData(), past: [], future: [] })
    expect(undoTarget('undo').kind).toBeNull()
    // src/projects/undoHistory.ts puts the saved steps back behind the plan.
    const earlier: Plan = { ...garageFloor(), walls: garageFloor().walls.slice(1) }
    usePlan.setState({ past: [earlier, earlier], future: [earlier] })
    expect(undoTarget('undo').kind).toBe('plan')
    expect(undoTarget('redo').kind).toBe('plan')
    usePlan.getState().undo()
    usePlan.getState().undo()
    expect(undoTarget('undo').kind).toBeNull()
  })
})

describe('the step’s name', () => {
  it('is on Undo and Redo, for the tip and the button’s name', () => {
    ffl(50)
    expect(undoTarget('undo').label).toBe('change floor level')
    undoTarget('undo').undo()
    expect(undoTarget('redo').label).toBe('change floor level')
    tree('t1')
    expect(undoTarget('undo').label).toBe('add tree')
    margin(0.3)
    expect(undoTarget('undo').label).toBe('change builder’s margin')
  })

  it('says what a plan step did', () => {
    const a = garageFloor()
    const wall = a.walls[0]
    const name = (b: Plan) => namePlanStep(a, b).what
    expect(name({ ...a, walls: [...a.walls, { ...wall, id: 'w_new' }] })).toBe('draw wall')
    expect(name({ ...a, walls: a.walls.slice(1), openings: a.openings.filter(o => o.wall !== wall.id) })).toBe('delete wall')
    expect(name({ ...a, walls: a.walls.slice(2) })).toBe('delete 2 walls')
    expect(name({ ...a, walls: a.walls.map(w => (w === wall ? { ...w, a: [w.a[0] + 1, w.a[1]] as [number, number] } : w)) })).toBe('move wall')
    expect(name({ ...a, walls: a.walls.map(w => (w === wall ? { ...w, thickness: 0.11 } : w)) })).toBe('change wall')
    expect(name({ ...a, walls: [...a.walls, { ...wall, id: 'w_new' }], rooms: [...a.rooms, { ...a.rooms[0], id: 'r_new' }] })).toBe('add room')
    expect(name({ ...a, rooms: a.rooms.map((r, i) => (i ? r : { ...r, name: 'Workshop' })) })).toBe('rename room')
    expect(name({ ...a, walls: [], openings: [], rooms: [], roofs: [] })).toMatch(/^delete \d+ things$/)
    expect(name({ ...a, levels: a.levels.map((l, i) => (i ? l : { ...l, height: l.height + 0.3 })) })).toBe('change ceiling height')
    expect(name({ ...a, placement: { ...a.placement, ffl: a.placement.ffl + 0.44 } })).toBe('change floor level')
    expect(name({ ...a, placement: { ...a.placement, e: a.placement.e + 2 } })).toBe('move the house')
    expect(name({ ...a })).toBe('change to the plan')
    const door = a.openings.find(o => o.kind === 'door') ?? a.openings[0]
    if (door) {
      const noun = door.kind === 'garage' ? 'garage door' : door.kind
      expect(name({ ...a, openings: a.openings.filter(o => o !== door) })).toBe(`delete ${noun}`)
      expect(name({ ...a, openings: a.openings.map(o => (o === door ? { ...o, offset: o.offset + 0.2 } : o)) })).toBe(`move ${noun}`)
    }
  })

  it('says where each kind of step shows', () => {
    const a = garageFloor()
    expect(placeLabel(namePlanStep(a, { ...a, walls: a.walls.slice(1) }))).toBe('Design › Plan')
    expect(placeLabel(namePlanStep(a, { ...a, placement: { ...a.placement, ffl: 1 } }))).toBe('Earthworks › Place')
    const s: SiteData = emptySiteData()
    expect(placeLabel(nameSiteStep(s, { ...s, hidden: ['tree'] }))).toBe('Site › Features')
    expect(placeLabel(nameCostsStep(emptyCosts(), { ...emptyCosts(), margin: 0.5 }))).toBe('Costs › Estimate')
  })
})

describe('a step taken back on another screen', () => {
  it('is said in a toast, with where it was and the way there', () => {
    ffl(50)
    // LF-19: on Costs, the floor level change that just moved the estimate.
    useRouter.setState({ route: areaRoute('costs', 'estimate') })
    undoTarget('undo').undo()
    expect(plan().placement.ffl).not.toBe(50)
    expect(toast()?.text).toBe('Undone: change floor level, in Earthworks › Place.')
    expect(toast()?.link?.label).toBe('Show')
    undoTarget('redo').redo()
    expect(toast()?.text).toBe('Redone: change floor level, in Earthworks › Place.')
  })

  it('covers a plan edit undone from Site (LD-35) and a cost change undone from Design', () => {
    dropWall()
    useRouter.setState({ route: areaRoute('site', 'block') })
    undoTarget('undo').undo()
    expect(toast()?.text).toBe('Undone: delete wall, in Design › Plan.')
    useSafety.setState({ toast: null })
    margin(0.3)
    useRouter.setState({ route: areaRoute('design', 'plan') })
    undoTarget('undo').undo()
    expect(toast()?.text).toBe('Undone: change builder’s margin, in Costs › Estimate.')
  })

  it('says nothing when the change shows on the screen that’s open', () => {
    dropWall()
    undoTarget('undo').undo()
    expect(toast()).toBeNull()
    // The plan is drawn in Earthworks too.
    dropWall()
    useRouter.setState({ route: areaRoute('earthworks', 'place') })
    undoTarget('undo').undo()
    expect(toast()).toBeNull()
    margin(0.3)
    useRouter.setState({ route: areaRoute('costs', 'estimate') })
    undoTarget('undo').undo()
    expect(toast()).toBeNull()
  })
})
