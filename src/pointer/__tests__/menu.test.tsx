// The plan's right-click menu, a wall's length typed on its label, the grid and the drag hint.
// Uses the made-up garage plan only.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetCopied } from '../../plan/editActions'
import { normalizePlan, wallLength } from '../../plan/model'
import { usePlan, type Selection } from '../../plan/store'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { useSafety } from '../../safety/store'
import { DimBox } from '../DimBox'
import { useDimEdit } from '../dimStore'
import { dragHint, isDragHint } from '../dragHint'
import { gridSteps } from '../grid'
import { menuItems } from '../menuItems'
import { PlanGrid, SnapKey } from '../PlanGrid'
import { openPlanMenu, usePlanMenu } from '../planMenuStore'
import { snapFree, snapSquare, useSnapping } from '../snapping'

const st = () => usePlan.getState()
const plan = () => st().plan!
const ids = (sels: Selection[], tool = st().tool) => menuItems({ plan: plan(), sels, tool, at: [1, 1] }).map(i => i.id)
const item = (sels: Selection[], id: string) => menuItems({ plan: plan(), sels, tool: 'select', at: [1, 1] }).find(i => i.id === id)!
/** Switch the grid on as a server render sees it (zustand renders its first state there). */
const gridOn = () => {
  useSnapping.setState({ grid: true })
  Object.assign(useSnapping.getInitialState(), useSnapping.getState())
}
/** How many undo steps a function adds. */
const steps = (fn: () => void) => {
  const before = st().past.length
  fn()
  return st().past.length - before
}

beforeEach(() => {
  st().load(normalizePlan({ ...garageFloor(), name: 'Sample house' }))
  st().setTool('select')
  forgetCopied()
  useSafety.setState({ review: null, toast: null, busy: false })
  useSnapping.setState({ on: true, grid: false })
  Object.assign(useSnapping.getInitialState(), useSnapping.getState())
  usePlanMenu.setState({ open: null })
  useDimEdit.setState({ open: null })
})

describe('the right-click menu (CB-09)', () => {
  it('offers a wall its length, its kind, and duplicate, copy, cut, delete', () => {
    expect(ids([{ type: 'wall', id: 'south' }])).toEqual(['length', 'kind', 'duplicate', 'copy', 'cut', 'delete'])
    expect(item([{ type: 'wall', id: 'south' }], 'kind').label).toBe('Make it an internal wall')
    expect(item([{ type: 'wall', id: 'hall_w' }], 'kind').label).toBe('Make it an external wall')
  })

  it('offers a door its flips, and a door or window its own copy, cut and delete', () => {
    const edit = ['duplicate', 'copy', 'cut', 'delete']
    expect(ids([{ type: 'opening', id: 'entry' }])).toEqual(['flip-hinge', 'flip-swing', ...edit])
    expect(ids([{ type: 'opening', id: 'office_window' }])).toEqual(edit)
  })

  it('offers a room Rename, and furniture a quarter turn', () => {
    const room = plan().rooms[0]
    expect(ids([{ type: 'room', id: room.id }])[0]).toBe('rename')
    const f = plan().furniture[0]
    if (f) expect(ids([{ type: 'furniture', id: f.id }])[0]).toBe('turn')
  })

  it('acts on everything picked when several things are', () => {
    const sels: Selection[] = [
      { type: 'wall', id: 'south' },
      { type: 'wall', id: 'east' },
    ]
    expect(ids(sels)).toEqual(['duplicate', 'copy', 'cut', 'delete'])
    expect(item(sels, 'delete').label).toBe('Delete 2 items')
  })

  it('offers bare ground select all, snapping, the grid and fit; Paste only once something is copied', () => {
    expect(ids([])).toEqual(['select-all', 'snap', 'grid', 'fit'])
    st().select({ type: 'wall', id: 'south' })
    item([{ type: 'wall', id: 'south' }], 'copy').run()
    expect(ids([])[0]).toBe('paste')
  })

  it('under a drawing tool offers the way back to Select, not the thing under the pointer', () => {
    expect(ids([], 'wall')).toEqual(['select-tool', 'snap', 'grid', 'fit'])
  })

  it('makes each action one undo step, the same change its card makes', () => {
    st().select({ type: 'opening', id: 'entry' })
    expect(steps(() => item([{ type: 'opening', id: 'entry' }], 'flip-swing').run())).toBe(1)
    expect(plan().openings.find(o => o.id === 'entry')!.flipSwing).toBe(true)
    st().select({ type: 'wall', id: 'hall_w' })
    expect(steps(() => item([{ type: 'wall', id: 'hall_w' }], 'kind').run())).toBe(1)
    expect(plan().walls.find(w => w.id === 'hall_w')!.kind).toBe('external')
    st().select({ type: 'wall', id: 'south' })
    expect(steps(() => item([{ type: 'wall', id: 'south' }], 'delete').run())).toBe(1)
    expect(plan().walls.some(w => w.id === 'south')).toBe(false)
  })

  it('switches snapping and the grid from bare ground', () => {
    item([], 'snap').run()
    expect(useSnapping.getState().on).toBe(false)
    expect(menuItems({ plan: plan(), sels: [], tool: 'select', at: [0, 0] }).find(i => i.id === 'snap')!.label).toBe('Turn snapping on')
    item([], 'grid').run()
    expect(useSnapping.getState().grid).toBe(true)
  })

  it('selects what was right-clicked, so the card and the menu agree', () => {
    openPlanMenu({ type: 'wall', id: 'south' }, [40, 50], [1, 1])
    expect(st().selection).toEqual({ type: 'wall', id: 'south' })
    expect(usePlanMenu.getState().open).toMatchObject({ x: 40, y: 50 })
    expect(usePlanMenu.getState().open!.items[0].id).toBe('length')
  })

  it('keeps several picked things picked when one of them is right-clicked, and clears on bare ground', () => {
    st().selectMany([
      { type: 'wall', id: 'south' },
      { type: 'wall', id: 'east' },
    ])
    openPlanMenu({ type: 'wall', id: 'east' }, [0, 0], [1, 1])
    expect(st().extra.length).toBe(1)
    expect(usePlanMenu.getState().open!.items.map(i => i.id)).toEqual(['duplicate', 'copy', 'cut', 'delete'])
    openPlanMenu(null, [0, 0], [1, 1])
    expect(st().selection).toBeNull()
  })

  it('opens the length box where the wall was right-clicked', () => {
    item([{ type: 'wall', id: 'south' }], 'length').run()
    expect(useDimEdit.getState().open).toEqual({ wall: 'south', at: [1, 1] })
  })
})

describe('a wall’s length typed on the plan (CB-10, HO-29)', () => {
  it('opens showing the length in mm, in a labelled box', () => {
    const w = plan().walls.find(x => x.id === 'south')!
    const html = renderToStaticMarkup(<DimBox plan={plan()} wall={w} x={10} y={20} />)
    expect(html).toContain(`value="${Math.round(wallLength(w) * 1000)}"`)
    expect(html).toContain('aria-label="Wall length in millimetres"')
    expect(html).toContain('left:10px')
  })
})

describe('snapping keys and switches (CB-07, LD-38)', () => {
  it('turns snapping off with Alt, or with the switch off; Shift is square, not free', () => {
    expect(snapFree({ altKey: false })).toBe(false)
    expect(snapFree({ altKey: true })).toBe(true)
    expect(snapSquare({ shiftKey: true })).toBe(true)
    useSnapping.getState().setOn(false)
    expect(snapFree({ altKey: false })).toBe(true)
  })

  it('has a Snapping and a Grid switch for the Key, and says how big the squares are', () => {
    expect(renderToStaticMarkup(<SnapKey k={23} />)).toMatch(/checked=""[^>]*\/>Snapping.*Grid/)
    gridOn()
    expect(renderToStaticMarkup(<SnapKey k={23} />)).toContain('1 m squares, bold every 5 m')
  })

  it('draws the grid only when it is switched on, turned with the plan', () => {
    const S = (p: [number, number]): [number, number] => [100 + p[0] * 20, 80 - p[1] * 20]
    expect(renderToStaticMarkup(<PlanGrid S={S} k={20} size={{ w: 400, h: 300 }} />)).toBe('')
    gridOn()
    const svg = renderToStaticMarkup(<PlanGrid S={S} k={20} size={{ w: 400, h: 300 }} />)
    expect(svg).toContain('matrix(20.0000 0.0000 0.0000 -20.0000 100.00 80.00)')
    expect(svg).toContain('url(#plan-grid-fine)')
  })

  it('keeps the squares a readable size at every zoom', () => {
    expect(gridSteps(23)).toEqual({ fine: 1, bold: 5 })
    expect(gridSteps(80)).toEqual({ fine: 0.5, bold: 1 })
    expect(gridSteps(200)).toEqual({ fine: 0.1, bold: 1 })
    expect(gridSteps(2)).toEqual({ fine: 10, bold: 50 })
    for (const k of [0.1, 1, 5, 23, 60, 150, 400]) expect(gridSteps(k).fine * k).toBeGreaterThanOrEqual(k < 0.32 ? 0 : 16)
  })
})

describe('the line after a press-and-drag with a click-to-click tool (CB-12)', () => {
  it('says how the tool draws, for the tools that draw from point to point', () => {
    expect(dragHint('wall', { started: false })).toMatch(/click by click.*A drag moves the plan/)
    expect(dragHint('measure', { started: false })).toMatch(/two clicks/)
    expect(dragHint('roof', { started: false, roofOutline: true })).toMatch(/roof outline/)
  })

  it('says nothing once a point is down, for Select, or for tools that take one click', () => {
    expect(dragHint('wall', { started: true })).toBeNull()
    expect(dragHint('select', { started: false })).toBeNull()
    expect(dragHint('door', { started: false })).toBeNull()
    expect(dragHint('roof', { started: false, roofOutline: false })).toBeNull()
  })

  it('knows its own lines, so the next click can take one down', () => {
    expect(isDragHint(dragHint('area', { started: false }))).toBe(true)
    expect(isDragHint('Click on a wall to place it.')).toBe(false)
    expect(isDragHint(null)).toBe(false)
  })
})
