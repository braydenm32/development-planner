// The summary strip's and the Overview's numbers, on a synthetic block whose ground is an
// exact plane, checked against hand calculations written here; and the same numbers in the
// tab panels, the strip and the Overview, which read the same store (CALM 8).

import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { SelectionPanel } from '../../components/PlanSections'
import { balanceCutFill, retainedText } from '../../components/planNumbers'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks, type Barrier, type EarthworksResult } from '../../lib/earthworks'
import { DEFAULT_VIEW } from '../../lib/storage'
import { analyzeLayers, buildSurvey, guessRoles, type Survey } from '../../lib/survey'
import { buildTerrain, type Terrain } from '../../lib/terrain'
import { dxf, lwpolyline, point } from '../../lib/__tests__/fixtures'
import { areaRoute } from '../../nav/route'
import { balancedRL, boundarySides, crossedBoundaries, ENGINEER_HEIGHT, levelSummaries, movesFloor, outOfBalance, roomArea } from '../../plan/keyNumbers'
import { earthworksOf, type Plan, type Roof, type Wall } from '../../plan/model'
import { addLevelAbove } from '../../plan/ops'
import { earthworksPlatforms, retainingStrips } from '../../plan/platforms'
import { retainingProfiles } from '../../plan/retaining'
import { usePlan } from '../../plan/store'
import type { Earth } from '../../plan/useEarthworks'
import { loadPrintPrefs } from '../../print/prefs'
import { ShellContext, type ShellData } from '../context'
import { andList, m2, netText } from '../format'
import { OverviewSheet } from '../OverviewSheet'
import { MORE_SECTIONS, TAB_PANELS, TAB_TOOL } from '../sections'
import { whereShown } from '../format'
import { SummaryStrip } from '../SummaryStrip'
import { useKeyNumbers, type KeyNumbers } from '../useKeyNumbers'

// ---------------------------------------------------------------------------
// The block: z = 60 + 0.04 (E − 5000) + 0.12 (N − 8000), spot levels every 2 m.

type P2 = [number, number]
const planeW = (E: number, N: number) => 60 + 0.04 * (E - 5000) + 0.12 * (N - 8000)
const BOUNDARY: P2[] = [
  [5000, 8000],
  [5031, 8003],
  [5028, 8046],
  [4997, 8042],
]

function loadSite(): { survey: Survey; terrain: Terrain } {
  const ents: string[] = []
  for (let E = 4987; E <= 5041; E += 2) for (let N = 7990; N <= 8056; N += 2) ents.push(point('SPOT_LEVELS', [E, N, planeW(E, N)]))
  ents.push(lwpolyline('LOT_BOUNDARY', [...BOUNDARY, BOUNDARY[0]]))
  const doc = parseDxf(dxf(ents))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const L0 = 'level_ground'
const wall = (id: string, a: P2, b: P2, thickness: number, kind: Wall['kind'] = 'external'): Wall => ({ id, level: L0, a, b, thickness, kind })

/** A 12 m × 9 m (centreline) house with 300 mm walls: its outside is 12.3 m × 9.3 m. */
function house(patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    name: 'Strip house',
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [wall('s', [0, 0], [12, 0], 0.3), wall('e', [12, 0], [12, 9], 0.3), wall('n', [12, 9], [0, 9], 0.3), wall('w', [0, 9], [0, 0], 0.3)],
    openings: [],
    rooms: [{ id: 'r1', level: L0, name: 'Living', at: [6, 4.5] }],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 5008, n: 8016, rotation: 15, ffl: 63.2 },
    // Upright sides, so cut and fill have a closed form.
    earthworks: { margin: 0, cutBatter: 0, fillBatter: 0, subfloor: 0.4 },
    ...patch,
  }
}

/** The house frame to world coordinates, written independently of the app's toSite. */
function toWorld([x, y]: P2, pl: Plan['placement']): P2 {
  const t = (pl.rotation * Math.PI) / 180
  return [pl.e + x * Math.cos(t) - y * Math.sin(t), pl.n + x * Math.sin(t) + y * Math.cos(t)]
}

/** What useEarthworks works out: retaining walls are the lines cut and fill stops at. */
function earthOf(plan: Plan, survey: Survey, terrain: Terrain): Earth {
  const platforms = earthworksPlatforms(plan, survey.origin)
  const strips = retainingStrips(plan, survey.origin)
  const barriers = strips.map((s): Barrier => [s.a, s.b])
  const prep = prepareEarthworks(terrain.grid, survey.boundary, platforms, earthworksOf(plan), barriers)
  return { prep, result: evaluateEarthworks(prep), platforms, strips }
}

/** What the strip and the Overview get, from the hook they call. */
function numbersOf(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): KeyNumbers {
  const box: { n?: KeyNumbers } = {}
  function Probe() {
    box.n = useKeyNumbers(plan, survey, terrain, earth)
    return null
  }
  renderToStaticMarkup(<Probe />)
  return box.n!
}

/** Markup as the words a person reads. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ')
    .trim()

const strip = (n: KeyNumbers | null, shown: Parameters<typeof SummaryStrip>[0]['shown'] = {}) =>
  renderToStaticMarkup(<SummaryStrip route={areaRoute('design')} numbers={n} shown={shown} onBalance={() => {}} onOverview={() => {}} overviewOpen={false} />)

const site = loadSite()
const { survey, terrain } = site

// ---------------------------------------------------------------------------

describe('floor area and FFL', () => {
  it('floor area is the outside of the walls: 12.3 × 9.3 = 114.39 m²', () => {
    const plan = house()
    const n = numbersOf(plan, survey, terrain, null)
    expect(n.floorArea).toBeCloseTo(12.3 * 9.3, 6)
    expect(n.levels).toHaveLength(1)
    expect(n.levels[0]).toMatchObject({ name: 'Ground floor', rooms: 1 })
    // the same figure the Rooms & areas panel works out
    expect(n.floorArea).toBe(levelSummaries(plan)[0].gross.area)
    expect(words(strip(n))).toContain('Floor 114.39 m²')
  })

  it('adds up every level', () => {
    const { plan } = addLevelAbove(house())
    const n = numbersOf(plan, survey, terrain, null)
    expect(n.levels.map(l => l.name)).toEqual(['Ground floor', 'First floor'])
    expect(n.floorArea).toBeCloseTo(2 * 114.39, 6)
    expect(words(strip(n))).toContain('Floor 228.78 m²')
  })

  it('has no floor area before walls enclose a floor, and says so quietly', () => {
    const n = numbersOf(house({ walls: [], rooms: [] }), survey, terrain, null)
    expect(n.floorArea).toBeNull()
    expect(words(strip(n))).not.toContain('Floor')
  })

  it('FFL is the ground floor RL, to 10 mm', () => {
    const n = numbersOf(house(), survey, terrain, null)
    expect(n.ffl).toBe(63.2)
    expect(words(strip(n))).toContain('FFL RL 63.20')
    // with the floor lifted half a metre
    expect(numbersOf(house({ placement: { e: 5008, n: 8016, rotation: 15, ffl: 63.705 } }), survey, terrain, null).ffl).toBe(63.705)
  })

  it('shows a waiting line until the survey and plan load', () => {
    expect(words(strip(null))).toContain('Key numbers show once the survey and plan load.')
  })
})

describe('cut, fill and Out of balance', () => {
  // With upright sides on a plane, cut − fill = A × (ground at the pad's centroid − pad), and
  // Balance puts the pad at the ground under the centroid: house frame (6, 4.5), turned 15°.
  const plan = house()
  const centre = toWorld([6, 4.5], plan.placement)
  const groundAtCentre = planeW(centre[0], centre[1])
  const pad = 63.2 - 0.3

  beforeEach(() => usePlan.getState().load(house()))

  it('works out the hand figures first', () => {
    // E = 5008 + 6 cos 15° − 4.5 sin 15° = 5008 + 5.7956 − 1.1647 = 5012.6309
    // N = 8016 + 6 sin 15° + 4.5 cos 15° = 8016 + 1.5529 + 4.3467 = 8021.8996
    expect(centre[0]).toBeCloseTo(5012.6309, 3)
    expect(centre[1]).toBeCloseTo(8021.8996, 3)
    // 60 + 0.04 × 12.6309 + 0.12 × 21.8996 = 60 + 0.5052 + 2.6280 = 63.1332
    expect(groundAtCentre).toBeCloseTo(63.1332, 3)
  })

  it('reads cut, fill and what is left over the way the Cut & fill panel does', () => {
    const earth = earthOf(plan, survey, terrain)
    const n = numbersOf(plan, survey, terrain, earth)
    expect(n.earth).not.toBeNull()
    const e = n.earth!
    expect(e.cut).toBe(earth.result.cut)
    expect(e.fill).toBe(earth.result.fill)
    expect(e.pad).toBeCloseTo(pad, 9)
    // 114.39 × (63.1332 − 62.9) = 26.67 m³ left over
    const handNet = 114.39 * (groundAtCentre - pad)
    expect(handNet).toBeCloseTo(26.67, 2)
    // the grid is 0.25 m, and the pad edge falls between nodes
    expect(Math.abs(e.net - handNet)).toBeLessThan(0.03 * (e.cut + e.fill))
    expect(e.net).toBeGreaterThan(0)
  })

  it('flags Out of balance with Balance, and Balance sets the hand-worked floor', () => {
    const earth = earthOf(plan, survey, terrain)
    const n = numbersOf(plan, survey, terrain, earth)
    const e = n.earth!
    expect(e.outOfBalance).toBe(true)
    expect(outOfBalance(plan, earth.prep)).toBe(true)
    expect(Math.abs(e.balancedRL! - (groundAtCentre + 0.3))).toBeLessThan(0.02)
    expect(e.balancedRL! * 100).toBeCloseTo(Math.round(e.balancedRL! * 100), 9)

    const text = words(strip(n))
    expect(text).toContain(`Out of balance · ${netText(e.net)}`)
    expect(text).toContain('Balance')
    expect(text).not.toContain('Cut · fill')
    expect(strip(n)).toContain(`Move the floor to RL ${e.balancedRL!.toFixed(2)}`)

    // Balance, as the strip's button and the panel's button both do
    expect(balanceCutFill(earth)).toBe(`Floor moved to RL ${e.balancedRL!.toFixed(2)}, where cut and fill are about equal.`)
    const after = usePlan.getState().plan!
    expect(after.placement.ffl).toBe(e.balancedRL)
    const earth2 = earthOf(after, survey, terrain)
    const n2 = numbersOf(after, survey, terrain, earth2)
    expect(n2.earth!.outOfBalance).toBe(false)
    expect(Math.abs(n2.earth!.net)).toBeLessThan(0.01 * (n2.earth!.cut + n2.earth!.fill) + 0.5)
    const text2 = words(strip(n2))
    expect(text2).not.toContain('Out of balance')
    expect(text2).toContain(`Cut · fill ${n2.earth!.cut.toFixed(1)} · ${n2.earth!.fill.toFixed(1)} m³`)
  })

  it('counts a floor as balanced when Balance would leave it where it is', () => {
    expect(balancedRL(63.2, null)).toBeNull()
    expect(balancedRL(63.2, 0.2349)).toBe(63.43)
    expect(balancedRL(63.2, 0.004)).toBe(63.2)
    expect(movesFloor(null, 63.2)).toBe(false)
    expect(movesFloor(63.2, 63.2)).toBe(false)
    expect(movesFloor(63.2, 63.204)).toBe(false)
    expect(movesFloor(63.21, 63.2)).toBe(true)
    expect(movesFloor(63.19, 63.2)).toBe(true)
  })

  it('has no earthworks numbers without walls to level under', () => {
    const bare = house({ walls: [], rooms: [] })
    const n = numbersOf(bare, survey, terrain, earthOf(bare, survey, terrain))
    expect(n.earth).toBeNull()
    expect(words(strip(n))).not.toMatch(/Cut|Out of balance/)
  })
})

describe('batters crossing the boundary', () => {
  // The south side runs (5000, 8000) → (5031, 8003). Walking it anticlockwise, the outside is
  // on the right: the direction (3, −31), bearing atan2(3, −31) = 174.5°, which is south.
  it('names the south side when the house sits 1.4 m from it', () => {
    const plan = house({ placement: { e: 5010, n: 8002.5, rotation: 0, ffl: 61.75 }, earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 } })
    // The south wall's outside at E 5016 is at N 8002.35; the boundary there is at N 8000 + 3 × 16 / 31 = 8001.55.
    // Ground there is 60 + 0.64 + 0.282 = 60.922, the pad 61.45: 0.53 of fill, whose 1 in 2 batter
    // and 0.5 m margin reach 1.56 m, past the boundary 0.8 m away.
    const earth = earthOf(plan, survey, terrain)
    expect(boundarySides(earth.result, survey)).toEqual(['south'])
    const n = numbersOf(plan, survey, terrain, earth)
    expect(n.batterSides).toEqual(['south'])
    expect(n.batters).toBe('the south boundary')
    const text = words(strip(n))
    expect(text).toContain('Batters cross the south boundary')
    expect(strip(n)).toContain('The earthworks run past the south boundary.')
  })

  // Walking the boundary anticlockwise, the outside of each side is on the right:
  // (5031, 8003) → (5028, 8046) faces (43, 3), east; (5028, 8046) → (4997, 8042) faces (−4, 31),
  // north; (4997, 8042) → (5000, 8000) faces (−42, −3), west.
  const crossing = (edges: number[]) => crossedBoundaries({ boundaryEdges: edges } as EarthworksResult, survey)

  it('words the boundaries crossed the same way everywhere', () => {
    expect(survey.boundary).toHaveLength(4)
    expect(crossing([])).toBeNull()
    expect(crossing([0])).toBe('the south boundary')
    expect(crossing([1, 2])).toBe('the east and north boundaries')
    expect(crossing([0, 1, 3])).toBe('the south, east and west boundaries')
    expect(crossing([0, 1, 2, 3])).toBe('all four boundaries')
  })

  it('names nothing when the house sits in the middle', () => {
    const plan = house({ placement: { e: 5009, n: 8018, rotation: 0, ffl: 63.15 }, earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 } })
    const n = numbersOf(plan, survey, terrain, earthOf(plan, survey, terrain))
    expect(n.batterSides).toEqual([])
    expect(words(strip(n))).not.toContain('Batters')
  })

  it('lists several sides the way a person says them', () => {
    expect(andList([])).toBe('')
    expect(andList(['east'])).toBe('east')
    expect(andList(['east', 'north'])).toBe('east and north')
    expect(andList(['east', 'north', 'west'])).toBe('east, north and west')
  })
})

describe('retaining walls', () => {
  // Across the uphill (north) side, 1.5 m behind the house, with the floor cut in.
  const rw: Wall = { id: 'rw', level: L0, a: [-1, 10.8], b: [13, 10.8], thickness: 0.2, kind: 'retaining' }
  const plan = house({ walls: [...house().walls, rw], earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 } })

  it('reads the walls the Retaining walls panel lists', () => {
    const earth = earthOf(plan, survey, terrain)
    const n = numbersOf(plan, survey, terrain, earth)
    const walls = retainingProfiles(plan, survey.origin, earth.result.grid)
    expect(n.retaining).not.toBeNull()
    expect(n.retaining!.count).toBe(1)
    expect(n.retaining!.length).toBeCloseTo(14, 9)
    expect(n.retaining!.maxHeight).toBe(walls[0].maxHeight)
    expect(n.retaining!.face).toBe(walls[0].faceArea)
    expect(n.retaining!.engineer).toBe(walls[0].maxHeight >= ENGINEER_HEIGHT)
    expect(words(strip(n))).toContain(`Tallest wall ${walls[0].maxHeight.toFixed(2)} m`)
    expect(strip(n)).toContain(`Holds back up to ${retainedText(walls[0].maxHeight)}`)
  })

  const withWall = (maxHeight: number): KeyNumbers => ({
    levels: [],
    floorArea: null,
    ffl: 63.2,
    earth: null,
    retaining: { count: 1, length: 10, maxHeight, face: 10 * maxHeight, engineer: maxHeight >= ENGINEER_HEIGHT },
    roof: null,
    batterSides: [],
    batters: null,
    placement: null,
  })

  it('asks for an engineer from 600 mm, the figure the checks use', () => {
    expect(ENGINEER_HEIGHT).toBe(0.6)
    expect(words(strip(withWall(1.2)))).toContain('Tallest wall 1.20 m Engineer > 600 mm')
    expect(words(strip(withWall(0.8)))).toContain('Tallest wall 0.80 m Engineer > 600 mm')
    expect(words(strip(withWall(0.6)))).toContain('Engineer')
    expect(words(strip(withWall(0.5)))).not.toContain('Engineer')
  })
})

describe('roof height above the ground', () => {
  // A flat roof over the walls with a 0.6 m overhang: its top is FFL + 2.7 m walls + 0.3 m
  // roof, and on a plane the lowest ground under it is at one of its four corners.
  const roof: Roof = {
    id: 'roof1',
    level: L0,
    pts: [
      [-0.15, -0.15],
      [12.15, -0.15],
      [12.15, 9.15],
      [-0.15, 9.15],
    ],
    type: 'flat',
    pitch: 2,
    overhang: 0.6,
    gables: [false, false, false, false],
    lowEdge: 0,
  }
  const plan = house({ roofs: [roof] })

  it('matches the hand figure', () => {
    const corners: P2[] = [
      [-0.75, -0.75],
      [12.75, -0.75],
      [12.75, 9.75],
      [-0.75, 9.75],
    ]
    const top = 63.2 + 2.7 + 0.3
    const lowest = Math.min(...corners.map(c => planeW(...toWorld(c, plan.placement))))
    const n = numbersOf(plan, survey, terrain, null)
    expect(n.roof).not.toBeNull()
    expect(n.roof!.top).toBeCloseTo(top, 9)
    expect(n.roof!.area).toBeCloseTo(13.5 * 10.5, 6)
    expect(Math.abs(n.roof!.height - (top - lowest))).toBeLessThan(0.01)
    expect(words(strip(n))).toContain(`Roof ${n.roof!.height.toFixed(2)} m above ground`)
  })

  it('has none to show without a roof', () => {
    const n = numbersOf(house(), survey, terrain, null)
    expect(n.roof).toBeNull()
    expect(words(strip(n))).not.toContain('Roof')
  })
})

describe('chips step back when the number is already in view (CALM 5)', () => {
  const plan = house()
  const earth = earthOf(plan, survey, terrain)
  const n = numbersOf(plan, survey, terrain, earth)

  it('turns a chip into a plain label pointing at where the number is', () => {
    const html = strip(n, { 'floor-area': 'in the panel', ffl: 'on plan' })
    expect(html).toContain('class="chip ghost" title="Floor is in the panel"')
    expect(words(html)).toContain('Floor → panel')
    expect(words(html)).toContain('FFL → plan')
    expect(words(html)).not.toContain('114.39')
    expect(words(html)).not.toContain('RL 63.20')
  })

  it('says where in a word or two', () => {
    expect(whereShown('in the panel')).toBe('→ panel')
    expect(whereShown('on plan')).toBe('→ plan')
    expect(whereShown('selected')).toBe('→ selected')
  })

  it('lets the panel showing cut and fill take over Out of balance', () => {
    const html = strip(n, { 'cut-fill': 'in the panel' })
    expect(words(html)).not.toContain('Out of balance')
    expect(words(html)).toContain('Cut · fill → panel')
  })

  it('keeps chips as buttons otherwise', () => {
    const html = strip(n)
    expect(html).not.toContain('chip ghost')
    expect((html.match(/<button class="chip"/g) ?? []).length).toBe(2)
  })
})

describe('number formats shared with the panels', () => {
  it('reads as the panels read', () => {
    expect(m2(114.39)).toBe('114.39 m²')
    expect(m2(0.005)).toBe('0.01 m²')
    expect(netText(26.64)).toBe('26.6 m³ to take away')
    expect(netText(-3.04)).toBe('3.0 m³ to bring in')
    expect(netText(0)).toBe('0.0 m³ to take away')
  })
})

// ---------------------------------------------------------------------------
// The panels, the strip and the Overview render the same numbers from the same store.

function shellData(earth: Earth | null): ShellData {
  return {
    project: { fileName: 'synthetic.dxf', dxfText: '', roles: {} },
    layers: [],
    onRoleChange: () => {},
    survey,
    terrain,
    siteError: null,
    earth,
    view: DEFAULT_VIEW,
    changeView: () => {},
    changeUp: () => {},
    resetCamera: () => {},
    printPrefs: loadPrintPrefs(),
    changePrintPrefs: () => {},
    print: { model: null, busy: false, error: null },
    hover: null,
    openProject: async () => '',
    replaceSurvey: () => {},
  }
}

describe('the panels', () => {
  const plan = house({ roofs: [] })
  const earth = earthOf(plan, survey, terrain)
  beforeEach(() => {
    usePlan.getState().load(plan)
    // A static render reads a zustand store's server snapshot, which is its initial state;
    // put the loaded plan there so the panels render it as the browser would.
    Object.assign(usePlan.getInitialState(), usePlan.getState())
  })

  it('render every tab panel and More section', () => {
    const data = shellData(earth)
    for (const [key, Panel] of [...Object.entries(TAB_PANELS), ...Object.entries(MORE_SECTIONS)]) {
      const html = renderToStaticMarkup(
        <ShellContext.Provider value={data}>
          <Panel />
        </ShellContext.Provider>,
      )
      expect(html.length, key).toBeGreaterThan(0)
      expect(words(html), key).not.toContain('Loading the plan')
    }
  })

  it('show the same cut, fill and floor numbers in the panels, the strip and the Overview', () => {
    const data = shellData(earth)
    const n = numbersOf(plan, survey, terrain, earth)
    const inShell = (C: ComponentType) =>
      words(
        renderToStaticMarkup(
          <ShellContext.Provider value={data}>
            <C />
          </ShellContext.Provider>,
        ),
      )
    const cutFill = inShell(TAB_PANELS['earthworks/cut-fill'])
    const rooms = inShell(TAB_PANELS['design/rooms'])
    const overview = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={data}>
          <OverviewSheet numbers={n} stats={terrain.stats} onClose={() => {}} onBalance={() => {}} />
        </ShellContext.Provider>,
      ),
    )
    const cut = `${n.earth!.cut.toFixed(1)} m³`
    const fill = `${n.earth!.fill.toFixed(1)} m³`
    for (const [name, text] of [
      ['Cut & fill tab', cutFill],
      ['Overview', overview],
    ]) {
      expect(text, name).toContain(cut)
      expect(text, name).toContain(fill)
    }
    expect(rooms).toContain('114.39 m²')
    expect(overview).toContain('114.39 m²')
    expect(cutFill).toContain('RL 62.90')
  })

  it('word the batters warning the same in the Cut & fill tab, the strip and the Overview', () => {
    const near = house({ placement: { e: 5010, n: 8002.5, rotation: 0, ffl: 61.75 }, earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 } })
    usePlan.getState().load(near)
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const e = earthOf(near, survey, terrain)
    const n = numbersOf(near, survey, terrain, e)
    const data = shellData(e)
    const Tab = TAB_PANELS['earthworks/cut-fill']
    const tab = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={data}>
          <Tab />
        </ShellContext.Provider>,
      ),
    )
    const overview = words(renderToStaticMarkup(<OverviewSheet numbers={n} stats={terrain.stats} onClose={() => {}} onBalance={() => {}} />))
    for (const text of [tab, words(strip(n)), overview]) expect(text).toContain('Batters cross the south boundary')
    expect(tab).not.toMatch(/ and \w+ and /)
  })

  it("lead the room inspector with the room's area, as the Rooms & areas panel works it out", () => {
    // The Living room fills the inside of the walls: (12 − 0.3) × (9 − 0.3) = 11.7 × 8.7 = 101.79 m².
    const room = plan.rooms[0]
    expect(roomArea(plan, room)).toBeCloseTo(11.7 * 8.7, 6)
    usePlan.getState().select({ type: 'room', id: room.id })
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const inspector = words(renderToStaticMarkup(<SelectionPanel plan={plan} survey={survey} terrain={terrain} earth={earth} />))
    expect(inspector).toMatch(/^Room Area 101\.79 m²/)
    const Rooms = TAB_PANELS['design/rooms']
    const rooms = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={shellData(earth)}>
          <Rooms />
        </ShellContext.Provider>,
      ),
    )
    expect(rooms).toContain('Living 101.79 m²')
  })

  it("show a retaining wall's own panel in Earthworks › Retaining walls when it is selected, and the list otherwise", () => {
    const rw: Wall = { id: 'rw', level: L0, a: [-1, 10.8], b: [13, 10.8], thickness: 0.2, kind: 'retaining' }
    const walled = house({ walls: [...house().walls, rw], earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 } })
    const e = earthOf(walled, survey, terrain)
    const Tab = TAB_PANELS['earthworks/retaining-walls']
    const render = () =>
      words(
        renderToStaticMarkup(
          <ShellContext.Provider value={shellData(e)}>
            <Tab />
          </ShellContext.Provider>,
        ),
      )
    usePlan.getState().load(walled)
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const list = render()
    expect(list).toContain('Wall 1 · 14.0 m')
    expect(list).toContain('Draw a retaining wall')
    expect(list).not.toContain('How high is the earth behind it?')
    // While the tool draws, the tab holds its options, so the tool's own card stays off the plan.
    expect(TAB_TOOL['earthworks/retaining-walls']).toBe('retaining')
    usePlan.getState().setTool('retaining')
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const drawing = render()
    expect(drawing).toContain('Click its start and its end')
    expect(drawing).not.toContain('Draw a retaining wall')
    usePlan.getState().setTool('select')
    usePlan.getState().select({ type: 'wall', id: 'rw' })
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const panel = render()
    expect(panel).toContain('How high is the earth behind it?')
    // the same panel the plan's inspector shows
    const inspector = words(renderToStaticMarkup(<SelectionPanel plan={walled} survey={survey} terrain={terrain} earth={e} />))
    expect(inspector).toContain('How high is the earth behind it?')
  })
})
