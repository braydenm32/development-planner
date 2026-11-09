import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { normalizePlan, toSite } from '../../plan/model'
import { addLevelAbove } from '../../plan/ops'
import { addNote, newNote } from '../../plan/notes'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { wallPolygons } from '../../plan/geometry'
import { EXPORT_CAVEAT } from '../exportCaveat'
import { LAYERS, planDxf, wallLayer } from '../planDxf'

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
    const walls = onLayer(out, wallLayer(0))
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
    expect(onLayer(out, wallLayer(1)).length).toBeGreaterThan(0)
    expect(onLayer(out, LAYERS.retaining)).toHaveLength(1)
    expect(onLayer(out, LAYERS.driveway)).toHaveLength(1)
    // The ground floor's walls don't include the retaining wall.
    expect(onLayer(out, wallLayer(0))).toHaveLength(base.walls.length)
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
