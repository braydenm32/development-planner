import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { newFurniture } from '../../plan/furniture'
import { sortedLevels, type Plan } from '../../plan/model'
import { addFurniture, addLevelAbove, addRoof } from '../../plan/ops'
import { levelOutlines } from '../../plan/roof'
import { textWidth } from '../pdfWriter'
import { planSetPdf, type PlanSetInput } from '../plans'
import { shadowDiagram } from '../../sun/facts'
import { isProjectFile, parseProjectFile, projectFileText, projectTitle } from '../project'

function setup() {
  const dxfText = planeSurvey()
  const doc = parseDxf(dxfText)
  const roles = guessRoles(analyzeLayers(doc))
  const survey = buildSurvey(doc, roles)
  const terrain = buildTerrain(survey)
  let plan: Plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 5, ffl: 84 } }
  plan = addLevelAbove(plan).plan
  const first = sortedLevels(plan)[1]
  plan = addRoof(plan, first.id, levelOutlines(plan.walls.filter(w => w.level === first.id))[0], { type: 'hip', pitch: 22.5, overhang: 0.45 })
  return { saved: { fileName: 'plane.dxf', dxfText, roles }, survey, terrain, plan }
}

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('PDF plans', () => {
  const { survey, terrain, plan } = setup()
  const input: PlanSetInput = {
    plan,
    survey,
    siteArea: terrain.stats.area,
    earthworks: { cut: 12.3, fill: 4.5 },
    up: 'house',
    paper: 'A3',
    title: 'Test (house)',
    date: '8 November 2026',
  }

  it('draws a site plan, a plan of each floor and a roof plan', () => {
    const pdf = text(planSetPdf(input))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(4)
    expect(pdf).toContain('/Count 4')
    expect(pdf).toContain('(Site plan) Tj')
    expect(pdf).toContain('(Ground floor plan) Tj')
    expect(pdf).toContain('(First floor plan) Tj')
    expect(pdf).toContain('(Roof plan) Tj')
    // Brackets in text are escaped.
    expect(pdf).toContain('/Title (Test \\(house\\))')
  })

  it('adds a shadow diagram for 21 June when the shadows are given', () => {
    const at = (p: Plan) => shadowDiagram({ plan: p, boundary: survey.boundary, origin: survey.origin, ground: terrain.grid, date: { year: 2026, month: 6, day: 21 } })
    const pdf = text(planSetPdf({ ...input, shadows: at(plan) }))
    expect(pdf).toContain('/Count 5')
    expect(pdf).toContain('(Shadow diagram, 21 June) Tj')
    for (const t of ['9 am', '12 pm', '3 pm']) expect(pdf).toContain(`(${t}) Tj`)
    // The house sits close to this block's edges, so its shadows reach over them.
    expect(pdf).toMatch(/\(sun \d+\\260 up in the north; shadow \d+ m\\262, [\d.]+ m\\262 over the south boundary\) Tj/)
    expect(pdf).toMatch(/\(sun \d+\\260 up in the north-east; shadow \d+ m\\262, [\d.]+ m\\262 over the west and south boundaries\) Tj/)
    expect(pdf).toContain('Times are AEST \\(UTC+10\\), no daylight saving.) Tj')
    expect(pdf).toContain('(Shadows are estimates. Trees, fences and neighbouring buildings are not shown.) Tj')
    // Nothing to cast a shadow: no sheet.
    expect(text(planSetPdf({ ...input, shadows: at({ ...plan, walls: [], roofs: [] }) }))).not.toContain('Shadow diagram')
  })

  it('points every cross-reference at its object', () => {
    const bytes = planSetPdf({ ...input, paper: 'A4', up: 0 })
    const pdf = text(bytes)
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1])
    expect(pdf.slice(start, start + 4)).toBe('xref')
    const rows = pdf.slice(start).split('\n').slice(3)
    const count = Number(/\/Size (\d+)/.exec(pdf)![1]) - 1
    for (let i = 0; i < count; i++) {
      const offset = Number(rows[i].slice(0, 10))
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    }
    // A4 landscape is 297 x 210 mm.
    expect(pdf).toContain('/MediaBox [0 0 841.89 595.28]')
  })

  it('draws retaining walls with their length and height', () => {
    const wall = { id: 'rw', level: sortedLevels(plan)[0].id, a: [-1, 17] as [number, number], b: [10, 17] as [number, number], thickness: 0.2, kind: 'retaining' as const }
    const pdf = text(planSetPdf({ ...input, plan: { ...plan, walls: [...plan.walls, wall] }, ground: terrain.grid }))
    expect(pdf).toMatch(/\(RW 11000, holds back up to \d+\) Tj/)
    expect(pdf).toContain('(Retaining walls) Tj')
    // The floor plan names it too, without a height.
    expect(pdf).toContain('(RW 11000) Tj')
  })

  it('draws furniture on the floor plans in thin lines, unless turned off', () => {
    const ground = sortedLevels(plan)[0].id
    let furnished = addFurniture(plan, newFurniture('car', ground, [2.5, 7])!)
    furnished = addFurniture(furnished, newFurniture('washer', ground, [6, 3.45])!)
    const on = text(planSetPdf({ ...input, plan: furnished }))
    const off = text(planSetPdf({ ...input, plan: furnished, furniture: false }))
    const bare = text(planSetPdf(input))
    const grey = '0.42 0.45 0.5 RG'
    expect(on).toContain('(WM) Tj')
    expect(on).toContain(grey)
    // Thin: 0.1 mm lines.
    expect(on).toContain(`${(0.1 * 72) / 25.4}`.slice(0, 4) + ' w')
    expect(off).not.toContain('(WM) Tj')
    expect(off).not.toContain(grey)
    expect(off.length).toBe(bare.length)
    const moves = (s: string) => s.match(/ m\n/g)!.length
    // The car has six lines and outlines, the washer two.
    expect(moves(on)).toBe(moves(off) + 8)
  })

  it('measures Helvetica text', () => {
    expect(textWidth('Hello', 10)).toBeCloseTo((722 + 556 + 222 + 222 + 556) / 100, 6)
    expect(textWidth('Hello', 10, 'bold')).toBeGreaterThan(textWidth('Hello', 10))
  })
})

describe('project file', () => {
  it('carries the survey and the plan to another browser', () => {
    const { saved, plan } = setup()
    const named = { ...plan, name: 'Smith St' }
    const text = projectFileText(saved, named)
    expect(isProjectFile(text)).toBe(true)
    const back = parseProjectFile(text)
    expect(back.survey).toEqual(saved)
    expect(back.plan.walls).toEqual(named.walls)
    expect(back.plan.roofs).toEqual(named.roofs)
    expect(back.plan.furniture).toEqual([])
    const furnished = addFurniture(named, { ...newFurniture('sofa-3', sortedLevels(named)[0].id, [3, 7], 90)!, label: 'Lounge' })
    expect(parseProjectFile(projectFileText(saved, furnished)).plan.furniture).toEqual(furnished.furniture)
    expect(projectTitle(back.plan)).toBe('Smith St')
  })

  it('opens project files saved before furniture existed', () => {
    const { saved, plan } = setup()
    const old = JSON.parse(projectFileText(saved, plan))
    delete old.plan.furniture
    expect(parseProjectFile(JSON.stringify(old)).plan.furniture).toEqual([])
  })

  it('turns away other files', () => {
    const { plan } = setup()
    expect(isProjectFile(JSON.stringify(plan))).toBe(false)
    expect(isProjectFile('not json')).toBe(false)
    expect(() => parseProjectFile(JSON.stringify(plan))).toThrow(/not a Contour & Gable project/)
    expect(() => parseProjectFile('{')).toThrow(/not a Contour & Gable project/)
  })

  it('names an unnamed project', () => {
    expect(projectTitle(setup().plan)).toBe('House plan')
  })
})
