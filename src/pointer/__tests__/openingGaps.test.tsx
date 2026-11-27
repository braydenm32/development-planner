import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SelectionPanel } from '../../components/PlanSections'
import { normalizePlan, wallLength } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { wallClear } from '../../plan/openingFit'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { offsetForGap, openingGapDims, openingGaps } from '../openingGaps'

describe('a door’s gap to each corner of its wall (CB-16)', () => {
  const plan = garageFloor()
  const door = plan.openings.find(o => o.id === 'office_door')!
  const wall = plan.walls.find(w => w.id === door.wall)!

  it('measures from each edge to the inside corner at that end', () => {
    const g = openingGaps(plan.walls, wall, door)
    const run = wallClear(plan.walls, wall)
    // The wall runs corner to corner, so each corner takes half the return wall's thickness.
    expect(run.from).toBeGreaterThan(0)
    expect(g.a.gap).toBeCloseTo(door.offset - door.width / 2 - run.from, 6)
    expect(g.b.gap).toBeCloseTo(run.to - door.offset - door.width / 2, 6)
    // The two gaps and the door fill the clear run.
    expect(g.a.gap + door.width + g.b.gap).toBeCloseTo(run.to - run.from, 6)
    expect(g.max).toBeCloseTo(g.a.gap + g.b.gap, 6)
    expect(run.to).toBeLessThan(wallLength(wall))
  })

  it('draws each gap from the corner to the door’s edge along the wall', () => {
    const g = openingGaps(plan.walls, wall, door)
    expect(Math.hypot(g.a.to[0] - g.a.from[0], g.a.to[1] - g.a.from[1])).toBeCloseTo(g.a.gap, 6)
    expect(Math.hypot(g.b.to[0] - g.b.from[0], g.b.to[1] - g.b.from[1])).toBeCloseTo(g.b.gap, 6)
  })

  it('puts the door where a typed gap says, from either end', () => {
    const fromA = offsetForGap(plan.walls, wall, door, 'a', 0.6)
    expect(openingGaps(plan.walls, wall, { ...door, offset: fromA }).a.gap).toBeCloseTo(0.6, 6)
    const fromB = offsetForGap(plan.walls, wall, door, 'b', 0.45)
    expect(openingGaps(plan.walls, wall, { ...door, offset: fromB }).b.gap).toBeCloseTo(0.45, 6)
  })

  it('writes both gaps on the plan beside the door, and none where it sits hard in a corner', () => {
    const drawn: number[] = []
    const dim = (a: [number, number], b: [number, number]) => drawn.push(Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000))
    const g = openingGaps(plan.walls, wall, door)
    openingGapDims(plan.walls, wall, door, dim, 'k')
    expect(drawn).toEqual([Math.round(g.a.gap * 1000), Math.round(g.b.gap * 1000)])
    drawn.length = 0
    openingGapDims(plan.walls, wall, { ...door, offset: offsetForGap(plan.walls, wall, door, 'a', 0) }, dim, 'k')
    expect(drawn.length).toBe(1)
  })

  it('gives the door’s card a box for each end, named by the compass, in place of one "wall start"', () => {
    const st = usePlan.getState()
    st.load(normalizePlan({ ...garageFloor(), name: 'Sample house' }))
    st.select({ type: 'opening', id: door.id })
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const loaded = usePlan.getState().plan!
    const html = renderToStaticMarkup(<SelectionPanel plan={loaded} survey={{ origin: [0, 0] } as never} terrain={{} as never} earth={null} />)
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    // office_n runs west to east with the house square to north.
    expect(text).toContain('From the west end')
    expect(text).toContain('From the east end')
    expect(text).not.toContain('wall start')
    const g = openingGaps(loaded.walls, loaded.walls.find(w => w.id === door.wall)!, door)
    expect(html).toContain(`value="${Math.round(g.a.gap * 1000)}"`)
    expect(html).toContain(`value="${Math.round(g.b.gap * 1000)}"`)
  })
})
