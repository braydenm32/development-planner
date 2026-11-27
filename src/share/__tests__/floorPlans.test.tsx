// The PDF's floor plan sheets: fitted to the house (outdoor areas don't shrink it), every floor
// and the roof at one scale, a scale that can be picked, labels kept off each other, and a
// section the plan shows under it offered as a section line. The made-up test garage on the
// tilted-plane test block.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { PdfPlans } from '../../components/ShareSections'
import { toastDownloaded } from '../../components/printFiles'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'
import { addWall } from '../../plan/ops'
import { usePlan } from '../../plan/store'
import { readSite } from '../../safety/files'
import { useSafety } from '../../safety/store'
import { keepStripSection, stripCut } from '../../sectionStrip/keep'
import { planPages } from '../pages'
import { autoFloorScale, floorScaleOf, planSetPdf, sheetFrame, type PlanSetInput } from '../plans'

const site = () => {
  const dxfText = planeSurvey()
  return readSite({ fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) })
}
const { survey, terrain } = site()
const A3 = sheetFrame('A3').area

/** The test garage with a 30 m driveway and a lawn far from the house on its level, and a small first floor. */
function house(): Plan {
  let p: Plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
  p = {
    ...p,
    areas: [
      ...p.areas,
      { id: 'drive', level: 'level_ground', name: 'Driveway', kind: 'driveway', pts: [[5.6, 0], [9.8, 0], [9.8, -30], [5.6, -30]] },
      { id: 'lawn', level: 'level_ground', name: 'Back lawn', kind: 'garden', pts: [[-20, 20], [-5, 20], [-5, 30], [-20, 30]] },
    ],
  }
  p = { ...p, levels: [...p.levels, { id: 'level_first', name: 'First floor', elevation: 3, height: 2.7 }] }
  const c: [number, number][] = [
    [1, 5],
    [5, 5],
    [5, 9],
    [1, 9],
  ]
  for (let i = 0; i < 4; i++) p = addWall(p, 'level_first', c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  return p
}

const input = (plan: Plan, patch: Partial<PlanSetInput> = {}): PlanSetInput => ({ plan, survey, siteArea: terrain.stats.area, earthworks: null, up: 'house', paper: 'A3', title: 'Test', date: '27 November 2026', ...patch })
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
/** Each sheet's scale by its name, from the title blocks. */
function scales(pdf: string): Record<string, number> {
  const out: Record<string, number> = {}
  const shown = [...pdf.matchAll(/\(([^()]*)\) Tj/g)].map(m => m[1])
  shown.forEach((t, i) => {
    const m = /^Scale 1:(\d+) at A\d$/.exec(t)
    // The title block writes the sheet's name, two lines of caveat, its number, then its scale.
    if (m) out[shown[i - 4]] = Number(m[1])
  })
  return out
}
/** Where a line of text was put on the paper (mm), the first time it appears after `from`. */
function at(pdf: string, label: string, from = 0): [number, number] {
  const m = new RegExp(`([\\d.-]+) ([\\d.-]+) Tm\\n\\(${label}\\) Tj`).exec(pdf.slice(from))
  if (!m) throw new Error(`${label} is not on the sheet`)
  return [Number(m[1]) / (72 / 25.4), Number(m[2]) / (72 / 25.4)]
}

describe('PDF floor plans', () => {
  it('fits each floor plan to the house: a long driveway and a far lawn don’t shrink it', () => {
    // The house alone is 9.8 x 13.7 m, which fits A3 at 1:100; with the driveway and lawn it would need 1:500.
    expect(autoFloorScale(house(), 'house', A3)).toBe(100)
    const s = scales(text(planSetPdf(input(house()))))
    expect(s['Ground floor plan']).toBe(100)
  })

  it('prints every floor at the same scale, though the first floor alone would fit at 1:50', () => {
    const p = house()
    const alone = { ...p, walls: p.walls.filter(w => w.level !== 'level_ground'), areas: [], rooms: [], openings: [] }
    expect(autoFloorScale(alone, 'house', A3)).toBe(50)
    const s = scales(text(planSetPdf(input(p))))
    expect(s['First floor plan']).toBe(s['Ground floor plan'])
  })

  it('prints at the scale picked in Share › Plans, and on A4 Auto steps down to one that fits', () => {
    const s = scales(text(planSetPdf(input(house(), { floorScale: 200 }))))
    expect([s['Ground floor plan'], s['First floor plan']]).toEqual([200, 200])
    // The site plan keeps its own scale.
    expect(scales(text(planSetPdf(input(house()))))['Site plan']).toBe(s['Site plan'])
    // A smaller sheet never gets a bigger drawing.
    expect(autoFloorScale(house(), 'house', sheetFrame('A4').area)).toBeGreaterThanOrEqual(100)
    expect([floorScaleOf(50), floorScaleOf('auto'), floorScaleOf(75), floorScaleOf(undefined)]).toEqual([50, 'auto', 'auto', 'auto'])
  })

  it('still draws the outdoor areas on the floor plan, as far as the sheet goes, and all of them on the site plan', () => {
    const pdf = text(planSetPdf(input(house(), { leaveOut: ['site'] })))
    expect(pdf).toContain('(Driveway) Tj')
    // The lawn is off the sheet at 1:100: its name isn't printed where it can't be seen.
    expect(pdf).not.toContain('(Back lawn) Tj')
    expect(text(planSetPdf(input(house())))).toContain('(Back lawn) Tj')
  })

  it('moves an outdoor area’s name off the overall dimension it would print over', () => {
    // A path 2.2 m deep along the south side: its middle is where the overall width is written.
    const p = house()
    const plan = { ...p, areas: [{ id: 'path', level: 'level_ground', name: 'Path', kind: 'slab' as const, pts: [[0.3, 0], [9.8, 0], [9.8, -2.2], [0.3, -2.2]] as [number, number][] }] }
    const pdf = text(planSetPdf(input(plan, { leaveOut: ['site', 'floor:level_first'] })))
    // Text starts, in mm: the overall width (0.3 m walls on 9.8 m centres) and the path's name.
    const width = at(pdf, '10100')
    const name = at(pdf, 'Path')
    // Left where it was, the name would sit on the figure's line; now it is a line clear of it, or beside it.
    expect(Math.abs(name[1] - width[1]) >= 2.6 || Math.abs(name[0] - width[0]) > 12).toBe(true)
  })
})

describe('Share › Plans', () => {
  beforeEach(() => {
    usePlan.getState().load(house())
  })

  const panel = (plan: Plan) =>
    renderToStaticMarkup(
      <PdfPlans plan={plan} survey={survey} terrain={terrain} earth={null} up="house" paper="A3" pdfFurniture floorScale={50} onLeaveOut={() => {}} onPaper={() => {}} onFloorScale={() => {}} furniture={null} />,
    )

  it('offers the floor plan scale, and says when the one picked won’t fit the sheet', () => {
    const html = panel(house())
    expect(html).toContain('Floor plan scale')
    for (const o of ['Auto (1:100)', '1:50', '1:100', '1:200']) expect(html).toContain(`>${o}</option>`)
    expect(html).toContain('At 1:50 the house is bigger than the A3 sheet')
  })

  it('says there is no section line yet, and keeps the section under the plan as one in a click', () => {
    const before = usePlan.getState().plan!
    expect(planPages(before).find(x => x.key === 'section')!.drawn).toBe(false)
    const html = panel(before)
    expect(html).toContain('(no section line yet)')
    expect(html).toContain('Use the section under the plan')
    expect(html).not.toContain('Sections<span class="muted"> (not drawn yet)')

    const line = keepStripSection(survey, null)!
    const after = usePlan.getState().plan!
    expect(line.label).toBe('A')
    expect([line.a, line.b]).toEqual([stripCut(before, survey, null).a, stripCut(before, survey, null).b])
    expect(planPages(after).find(x => x.key === 'section')!.drawn).toBe(true)
    expect(panel(after)).not.toContain('Use the section under the plan')
    // One step of Undo takes it away again.
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.sections ?? []).toHaveLength(0)
  })

  it('confirms a download by the file’s name', () => {
    toastDownloaded('test-plans.pdf')
    expect(useSafety.getState().toast?.text).toBe('Downloaded test-plans.pdf')
  })
})
