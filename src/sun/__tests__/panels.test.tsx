// The sun in the panels, for a box house in Sydney with a north window in its living room: the
// room's Living area tick and winter sun, the Overview's sun group, the plan key's Shadows switch
// and Site › Sun.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { Survey } from '../../lib/survey'
import type { Terrain } from '../../lib/terrain'
import type { Opening, Plan, Wall } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { ShellContext, type ShellData } from '../../shell/context'
import { OverviewSheet } from '../../shell/OverviewSheet'
import { TAB_PANELS } from '../../shell/sections'
import type { KeyNumbers } from '../../shell/useKeyNumbers'
import { sunFacts, winterDay } from '../facts'
import { RoomSun } from '../RoomSun'
import { ShadowsKey } from '../ShadowPlan'
import { useSun } from '../store'

const L0 = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, level: L0, a, b, thickness: 0.2, kind: 'external' })
const north: Opening = { id: 'win-n', wall: 'n', kind: 'window', offset: 5, width: 2, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false }
const plan: Plan = {
  version: 1,
  levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
  walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
  openings: [north],
  rooms: [{ id: 'r', level: L0, name: 'Living', at: [5, 4] }],
  areas: [],
  roofs: [],
  stairs: [],
  furniture: [],
  placement: { e: 0, n: 0, rotation: 0, ffl: 50.3 },
}
const boundary: Vec2[] = [
  [-10, -10],
  [20, -10],
  [20, 20],
  [-10, 20],
]
// Just what the sun reads from the survey: the boundary, its origin and the ground (flat at RL 50).
const survey = { boundary, origin: [0, 0] } as unknown as Survey
const terrain = { grid: { sample: () => 50 } } as unknown as Terrain

/** Markup as the words a person reads. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

function load(p: Plan) {
  usePlan.getState().load(p)
  Object.assign(usePlan.getInitialState(), usePlan.getState())
}

describe('the sun in the panels', () => {
  beforeEach(() => {
    load(plan)
    useSun.setState({ planShadows: true })
    Object.assign(useSun.getInitialState(), useSun.getState())
  })

  it('ticks a room called Living as a living area, with its winter sun', () => {
    const html = renderToStaticMarkup(<RoomSun plan={plan} room={plan.rooms[0]} survey={survey} terrain={terrain} earth={null} />)
    expect(html).toMatch(/<input type="checkbox" checked=""/)
    expect(words(html)).toBe('Living area Winter sun on its windows: 6 h between 9 am and 3 pm on 21 June (north 6 h).')
    const bed = { ...plan.rooms[0], name: 'Bed 1' }
    const off = renderToStaticMarkup(<RoomSun plan={{ ...plan, rooms: [bed] }} room={bed} survey={survey} terrain={terrain} earth={null} />)
    expect(off).not.toContain('checked')
    expect(words(off)).toBe('Living area')
  })

  it('gives the Overview a sun group', () => {
    const sun = sunFacts({ plan, boundary, origin: [0, 0], ground: terrain.grid, date: winterDay() })
    const n: KeyNumbers = { levels: [], floorArea: null, ffl: 50.3, earth: null, retaining: null, roof: null, batterSides: [], batters: null, placement: null, sun }
    const text = words(renderToStaticMarkup(<OverviewSheet numbers={n} stats={null} onBalance={() => {}} onClose={() => {}} />))
    expect(text).toContain('Sun on 21 June Open Living, sun on its windows 6 h')
    expect(text).toContain('The house’s shadow stays on your block from 9 am to 3 pm.')
  })

  it('keys the shadows on the plan', () => {
    expect(words(renderToStaticMarkup(<ShadowsKey />))).toBe('Shadows, 21 June 9 am 12 pm 3 pm Over the boundary On the ground, finished where cut or filled. Times AEST.')
    useSun.setState({ planShadows: false })
    Object.assign(useSun.getInitialState(), useSun.getState())
    expect(words(renderToStaticMarkup(<ShadowsKey />))).toBe('Shadows, 21 June')
  })

  it('shows the place, the time, north, the 9, 12 and 3 shadows and the living areas in Site › Sun', () => {
    const Tab = TAB_PANELS['site/sun']
    const data = { survey, terrain, earth: null } as unknown as ShellData
    const text = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={data}>
          <Tab />
        </ShellContext.Provider>,
      ),
    )
    expect(text).toContain('Where the block is Near Sydney')
    expect(text).toContain('Sydney (33.870° S, 151.210° E)')
    expect(text).toContain('Australian Eastern Standard Time (UTC+10), with no daylight saving')
    expect(text).toContain('The sun takes the survey’s north as true north.')
    expect(text).toMatch(/9 am : sun 19° up in the north-east; shadow \d+ m²/)
    expect(text).toMatch(/12 pm : sun 33° up in the north; shadow \d+ m²/)
    expect(text).toContain('The house’s shadow stays on your block from 9 am to 3 pm.')
    expect(text).toContain('Living: 6 h (north window 6 h)')
    expect(text).toContain('Shadows are estimates.')
  })
})
