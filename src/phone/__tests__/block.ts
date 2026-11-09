// A synthetic block for the phone's tests: a 30 m × 40 m rectangle whose ground is a plane
// falling to the north, with a 10 m × 8 m house on it. Nothing here comes from a real survey.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks, type Barrier } from '../../lib/earthworks'
import { DEFAULT_VIEW } from '../../lib/storage'
import { analyzeLayers, buildSurvey, guessRoles, type Survey } from '../../lib/survey'
import { buildTerrain, type Terrain } from '../../lib/terrain'
import { dxf, lwpolyline, point } from '../../lib/__tests__/fixtures'
import { earthworksOf, type Plan, type Roof, type Wall } from '../../plan/model'
import { earthworksPlatforms, retainingStrips } from '../../plan/platforms'
import type { Earth } from '../../plan/useEarthworks'
import { loadPrintPrefs } from '../../print/prefs'
import type { ShellData } from '../../shell/context'
import { useKeyNumbers, type KeyNumbers } from '../../shell/useKeyNumbers'

type P2 = [number, number]

/** Falls 0.1 m per metre to the north, and a little to the east. */
export const ground = (E: number, N: number) => 30 - 0.1 * (N - 1000) - 0.02 * (E - 500)

export const BOUNDARY: P2[] = [
  [500, 1000],
  [530, 1000],
  [530, 1040],
  [500, 1040],
]

export function loadBlock(): { survey: Survey; terrain: Terrain } {
  const ents: string[] = []
  for (let E = 494; E <= 536; E += 2) for (let N = 994; N <= 1046; N += 2) ents.push(point('SPOT_LEVELS', [E, N, ground(E, N)]))
  ents.push(lwpolyline('LOT_BOUNDARY', [...BOUNDARY, BOUNDARY[0]]))
  const doc = parseDxf(dxf(ents))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const L0 = 'level_ground'
const wall = (id: string, a: P2, b: P2, kind: Wall['kind'] = 'external'): Wall => ({ id, level: L0, a, b, thickness: 0.3, kind })

export const roof: Roof = {
  id: 'roof1',
  level: L0,
  pts: [
    [-0.15, -0.15],
    [10.15, -0.15],
    [10.15, 8.15],
    [-0.15, 8.15],
  ],
  type: 'flat',
  pitch: 2,
  overhang: 0.5,
  gables: [false, false, false, false],
  lowEdge: 0,
}

/** A 10 m × 8 m house in the middle of the block, square to north, with a retaining wall behind it. */
export function house(patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    name: 'Phone test house',
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0]), wall('rw', [-1, -2], [11, -2], 'retaining')],
    openings: [],
    rooms: [{ id: 'r1', level: L0, name: 'Living', at: [5, 4] }],
    areas: [],
    roofs: [roof],
    stairs: [],
    furniture: [],
    placement: { e: 510, n: 1015, rotation: 0, ffl: 28.6 },
    earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 },
    ...patch,
  }
}

export function earthOf(plan: Plan, survey: Survey, terrain: Terrain): Earth {
  const platforms = earthworksPlatforms(plan, survey.origin)
  const strips = retainingStrips(plan, survey.origin)
  const barriers = strips.map((s): Barrier => [s.a, s.b])
  const prep = prepareEarthworks(terrain.grid, survey.boundary, platforms, earthworksOf(plan), barriers)
  return { prep, result: evaluateEarthworks(prep), platforms, strips }
}

export function numbersOf(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): KeyNumbers {
  const box: { n?: KeyNumbers } = {}
  function Probe() {
    box.n = useKeyNumbers(plan, survey, terrain, earth)
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return box.n!
}

export function shellData(survey: Survey, terrain: Terrain, earth: Earth | null): ShellData {
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

/** Markup as the words a person reads. */
export const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ')
    .trim()
