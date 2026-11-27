import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { normalizePlan, toSite } from '../../plan/model'
import { addLevelAbove } from '../../plan/ops'
import { addNote, newNote } from '../../plan/notes'
import { addSection } from '../../sections/lines'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { wallPolygons } from '../../plan/geometry'
import { EXPORT_CAVEAT } from '../exportCaveat'
import { dxfFileName } from '../files'
import { LAYERS, levelLayerNames, openingLayer, planDxf, stairLayer, wallLayer } from '../planDxf'

// The made-up sample block, with the made-up garage floor placed on it.
const text = readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8')
const survey = buildSurvey(parseDxf(text), guessRoles(analyzeLayers(parseDxf(text))))
const placement = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }
const base = normalizePlan({ ...garageFloor(), name: 'Sample house', placement })

const read = (s: string) => parseDxf(s).entities
const onLayer = (s: string, layer: string) => read(s).filter(e => e.layer === layer)

describe('plan DXF', () => {
  it('round trip: the app reads its own boundary and walls back, in the survey\'s coordinates', () => {
    const out = planDxf({ plan: base, survey, title: 'Sample house' })
    // The boundary: the same eastings and northings as the survey, once its origin is added back.
    const b = onLayer(out, LAYERS.boundary)
    expect(b).toHaveLength(1)
    const pts = b[0].kind === 'polyline' ? b[0].points : []
    expect(pts).toHaveLength(survey.boundary.length)
    pts.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(survey.boundary[i][0] + survey.origin[0], 2)
      expect(p[1]).toBeCloseTo(survey.boundary[i][1] + survey.origin[1], 2)
    })
    // And the survey importer finds that boundary and the contours when it reads the export.
    const doc = parseDxf(out)
    const back = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
    expect(back.boundaryIsGuess).toBe(false)
    expect(back.origin).toEqual(survey.origin)
    expect(back.boundary.length).toBe(survey.boundary.length)
    expect(back.contours.length).toBe(survey.contours.length)

    // The walls: one closed outline per wall, at the placed position.
    const walls = onLayer(out, wallLayer(base, 'level_ground'))
    expect(walls).toHaveLength(base.walls.length)
    const first = [...wallPolygons(base.walls).values()][0].map(p => toSite(p, placement, [0, 0]))
    const w0 = walls[0]
    expect(w0.kind === 'polyline' && w0.closed).toBe(true)
    first.forEach((p, i) => {
      expect(w0.kind === 'polyline' && w0.points[i][0]).toBeCloseTo(p[0], 2)
      expect(w0.kind === 'polyline' && w0.points[i][1]).toBeCloseTo(p[1], 2)
    })
    // Walls sit inside the block.
    for (const e of walls) if (e.kind === 'polyline') for (const p of e.points) expect(p[0]).toBeGreaterThan(survey.origin[0])
  })

  it('puts each floor, the retaining walls and the driveway on their own layers', () => {
    let plan = base
    plan = { ...plan, walls: [...plan.walls, { id: 'rw', level: 'level_ground', a: [0, 20], b: [6, 20], thickness: 0.2, kind: 'retaining' }] }
    plan = { ...plan, areas: [...plan.areas, { id: 'dr', level: 'level_ground', name: 'Drive', kind: 'driveway', pts: [[0, 17], [3, 17], [3, 19], [0, 19]] }] }
    const up = addLevelAbove(plan)
    plan = { ...up.plan, walls: [...up.plan.walls] }
    const out = planDxf({ plan, survey, title: 'Sample house' })
    expect(onLayer(out, wallLayer(plan, up.id)).length).toBeGreaterThan(0)
    expect(onLayer(out, LAYERS.retaining)).toHaveLength(1)
    expect(onLayer(out, LAYERS.driveway)).toHaveLength(1)
    // The ground floor's walls don't include the retaining wall.
    expect(onLayer(out, wallLayer(plan, 'level_ground'))).toHaveLength(base.walls.length)
  })

  it('names each level\'s layers after the level, whatever its place in the stack', () => {
    // A split level between the ground and first floors used to come out as WALLS-FIRST.
    const levels = [
      ...base.levels,
      { id: 'level_split', name: 'Split level', elevation: 1.2, height: 2.7 },
      { id: 'level_first', name: 'First floor', elevation: 3, height: 2.7 },
      { id: 'level_same', name: 'First floor', elevation: 6, height: 2.7 },
    ]
    const wall = (id: string, level: string) => ({ id, level, a: [0, 0] as [number, number], b: [4, 0] as [number, number], thickness: 0.27, kind: 'external' as const })
    const plan = { ...base, levels, walls: [...base.walls, wall('s1', 'level_split'), wall('f1', 'level_first'), wall('t1', 'level_same')] }
    expect([...levelLayerNames(plan).values()]).toEqual(['GROUND-FLOOR', 'SPLIT-LEVEL', 'FIRST-FLOOR', 'FIRST-FLOOR-2'])
    const out = planDxf({ plan, survey, title: 'Sample house' })
    expect(wallLayer(plan, 'level_split')).toBe('WALLS-SPLIT-LEVEL')
    expect(onLayer(out, 'WALLS-SPLIT-LEVEL')).toHaveLength(1)
    expect(onLayer(out, 'WALLS-FIRST-FLOOR')).toHaveLength(1)
    expect(onLayer(out, 'WALLS-FIRST-FLOOR-2')).toHaveLength(1)
    expect(onLayer(out, 'WALLS-GROUND-FLOOR')).toHaveLength(base.walls.length)
    // Each floor level as text, by the level's name.
    const levelText = onLayer(out, LAYERS.levels).flatMap(e => (e.kind === 'text' ? [e.text] : []))
    expect(levelText).toContain('Ground floor: FFL RL 45.50')
    expect(levelText).toContain('Split level: FFL RL 46.70')
  })

  it('carries the doors and windows, stairs, roofs, section lines and retaining wall top RLs', () => {
    let plan = base
    plan = { ...plan, walls: [...plan.walls, { id: 'rw', level: 'level_ground', a: [0, 20], b: [6, 20], thickness: 0.2, kind: 'retaining', retain: { high: 'left', top: 46.2 } }] }
    plan = { ...plan, stairs: [{ id: 'st', level: 'level_ground', at: [9, 11], angle: 90, width: 0.9, base: 0, rise: 2.7, going: 0.25, shape: 'straight', turn: 'left' }] }
    plan = { ...plan, roofs: [{ id: 'ro', level: 'level_ground', pts: [[0, 0], [10, 0], [10, 14], [0, 14]], type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 }] }
    plan = addSection(plan, [-1, 7], [11, 7]).plan
    const terrain = buildTerrain(survey)
    const pads = [{ include: [[[10, 10], [14, 10], [14, 14], [10, 14]] as [number, number][]], exclude: [], level: 45.1, fill: true }]
    const out = planDxf({ plan, survey, ground: terrain.grid, pads, title: 'Sample house' })
    const texts = (layer: string) => onLayer(out, layer).flatMap(e => (e.kind === 'text' ? [e.text] : []))
    const lines = (layer: string) => onLayer(out, layer).filter(e => e.kind === 'polyline')

    // One outline per opening, across the wall, with its size.
    const openings = openingLayer(plan, 'level_ground')
    expect(openings).toBe('OPENINGS-GROUND-FLOOR')
    expect(lines(openings)).toHaveLength(base.openings.length)
    expect(texts(openings)).toContain('Window 1800 x 1200, sill 900')
    expect(texts(openings)).toContain('Door 920 x 2040')
    // The office window is in the east wall, 1.5 m along it: its outline is centred there.
    const win = lines(openings)[base.openings.findIndex(o => o.id === 'office_window')]
    const at = toSite([9.95, 1.65], placement, [0, 0])
    const xs = win.kind === 'polyline' ? win.points.map(p => p[0]) : []
    const ys = win.kind === 'polyline' ? win.points.map(p => p[1]) : []
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(at[0], 2)
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(at[1], 2)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.8, 2)

    expect(lines(stairLayer(plan, 'level_ground')).length).toBeGreaterThan(3)
    // The roof's edge with its overhang, its hips and ridge, and what it is.
    expect(lines(LAYERS.roof).length).toBeGreaterThan(4)
    expect(texts(LAYERS.roof)[0]).toMatch(/^hip roof, 22\.5 deg, eaves RL 48\.20$/)
    expect(lines(LAYERS.sections)).toHaveLength(1)
    expect(texts(LAYERS.sections)).toEqual(['A', 'A'])
    expect(texts(LAYERS.retaining)).toEqual(['RW top RL 46.20'])
    expect(texts(LAYERS.levels)).toContain('Pad RL 45.10')
    // The app still reads its own export back as the same survey.
    const doc = parseDxf(out)
    const back = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
    expect(back.contours.length).toBe(survey.contours.length)
    expect(back.boundary.length).toBe(survey.boundary.length)
  })

  it('is saved under a name that can\'t be taken for the survey file', () => {
    // A project named after its survey: the design must not come out as "sample-block.dxf".
    expect(dxfFileName({ ...base, name: 'sample-block' })).toBe('sample-block-design.dxf')
  })

  it('writes the finished contours and the notes, with the caveat on the drawing', () => {
    const note = newNote('level_ground', [2, 2], 'Check fall to street')
    const plan = addNote(base, note)
    const finished = [{ z: 45.5, major: false, pts: [[10, 10], [12, 11]] as [number, number][] }]
    const out = planDxf({ plan, survey, finished, title: 'Sample house', date: '9 November 2026' })
    const fin = onLayer(out, LAYERS.finished)
    expect(fin).toHaveLength(1)
    expect(fin[0].kind === 'polyline' && fin[0].points[0]).toEqual([10 + survey.origin[0], 10 + survey.origin[1], 45.5])
    const notes = onLayer(out, LAYERS.notes).flatMap(e => (e.kind === 'text' ? [e.text] : []))
    expect(notes).toContain('Check fall to street')
    expect(notes).toContain(EXPORT_CAVEAT)
    expect(notes.some(t => t.startsWith('Sample house, 9 November 2026'))).toBe(true)
  })

  it('leaves out finished contours when the ground is unchanged', () => {
    expect(onLayer(planDxf({ plan: base, survey, finished: null, title: 'x' }), LAYERS.finished)).toHaveLength(0)
  })

  it('survives a survey-sized plan on the sample block', () => {
    const terrain = buildTerrain(survey)
    expect(terrain.grid.nx).toBeGreaterThan(2)
    expect(planDxf({ plan: base, survey, title: 'x' }).length).toBeGreaterThan(1000)
  })
})
