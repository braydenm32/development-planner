import { describe, expect, it } from 'vitest'
import { daPackFile } from '../../components/printFiles'
import { COUNCIL_TABLES } from '../../checks/councils'
import type { CheckResult } from '../../checks/types'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import type { PlanningFacts } from '../../map/planning'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { emptyPlan, type Plan } from '../../plan/model'
import { fileSafe } from '../../print/export'
import { projectTitle } from '../../share/project'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { checklistRows, DA_ITEMS, sheetRange, type ChecklistInput } from '../checklist'
import { cleanRevision, daOf } from '../model'
import { daPackLayout, daPackPdf, listedChecks, type DaPackInput } from '../pack'
import { NOT_SET, sheetOf, titleText, type TitleInfo } from '../titleBlock'

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

function site() {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const facts = (patch: Partial<PlanningFacts> = {}): PlanningFacts => ({
  at: '2026-11-09T05:00:00Z',
  lga: 'WOLLONGONG',
  lep: 'Wollongong Local Environmental Plan 2009',
  zones: [{ name: 'R2 Low Density Residential', code: 'R2', middle: true }],
  height: 9,
  fsr: 0.5,
  lotSize: '449 m²',
  heritage: [],
  bushfire: [],
  flood: [],
  landslide: [],
  failed: [],
  ...patch,
})

const everySheet: ChecklistInput['sheets'] = {
  site: ['DA-02'],
  floor: ['DA-03', 'DA-04'],
  roof: ['DA-05'],
  elevation: ['DA-06', 'DA-07'],
  shadow: ['DA-08'],
  cutFill: ['DA-09'],
  stormwater: ['DA-10'],
  checks: ['DA-11'],
}

describe('the cover checklist', () => {
  const rows = (patch: Partial<ChecklistInput> = {}) => checklistRows({ council: null, planning: null, sheets: everySheet, driveway: false, ...patch })
  const row = (rs: ReturnType<typeof rows>, id: string) => rs.find(r => r.id === id)

  it('marks what the pack holds with its sheet numbers', () => {
    const rs = rows()
    expect(row(rs, 'site-plan')).toMatchObject({ status: 'in-pack', sheets: 'DA-02' })
    expect(row(rs, 'floor-plans')).toMatchObject({ status: 'in-pack', sheets: 'DA-03 to DA-04' })
    expect(row(rs, 'shadows')).toMatchObject({ status: 'in-pack', sheets: 'DA-08' })
    expect(row(rs, 'cut-fill')).toMatchObject({ status: 'in-pack', sheets: 'DA-09' })
    expect(row(rs, 'stormwater')).toMatchObject({ status: 'in-pack', sheets: 'DA-10' })
    expect(row(rs, 'controls')).toMatchObject({ status: 'in-pack', sheets: 'DA-11' })
  })

  it('says what to add for a sheet the plan can’t make yet', () => {
    const rs = rows({ sheets: { site: ['DA-02'], checks: ['DA-03'] } })
    expect(row(rs, 'floor-plans')).toMatchObject({ status: 'not-drawn', detail: 'Draw the walls under Design › Floors.' })
    expect(row(rs, 'shadows')?.status).toBe('not-drawn')
    expect(row(rs, 'cut-fill')?.detail).toMatch(/Earthworks › Place/)
    expect(row(rs, 'stormwater')?.status).toBe('not-drawn')
    expect(row(rs, 'site-plan')?.status).toBe('in-pack')
    // Elevations come from the walls, sections only from a section line.
    expect(row(rows(), 'elevations')).toMatchObject({ status: 'in-pack', sheets: 'DA-06 to DA-07' })
    expect(row(rows(), 'sections')).toMatchObject({ status: 'not-drawn', detail: 'Draw a section line across the house under Design › Sections.' })
  })

  it('lists the documents others make, with who makes them', () => {
    const rs = rows()
    for (const id of ['survey', 'basix', 'see', 'landscape', 'waste', 'cost']) expect(row(rs, id)?.status).toBe('others')
    expect(row(rs, 'survey')?.detail).toBe('From a registered surveyor.')
  })

  it('adds hazard rows only where the planning maps flag the lot', () => {
    const hazards = ['bushfire', 'flood', 'geotech', 'heritage']
    // Not on the map, or on it with nothing flagged: none.
    for (const planning of [null, facts()]) expect(rows({ planning }).filter(r => hazards.includes(r.id))).toEqual([])
    const flagged = rows({ planning: facts({ bushfire: [{ name: 'Vegetation Category 1', middle: true }], flood: [{ name: 'Flood planning area', middle: false }] }) })
    expect(flagged.filter(r => hazards.includes(r.id)).map(r => r.id)).toEqual(['bushfire', 'flood'])
    expect(row(flagged, 'bushfire')?.detail).toMatch(/^The NSW planning maps show bush fire prone land \(Vegetation Category 1\)\. From a bushfire consultant/)
    const heritage = rows({ planning: facts({ heritage: [{ name: 'Old house', middle: true, kind: 'Item - General' }], landslide: [{ name: 'Slope', middle: true }] }) })
    expect(heritage.filter(r => hazards.includes(r.id)).map(r => r.id)).toEqual(['geotech', 'heritage'])
  })

  it('follows the council’s own list', () => {
    const none = rows().map(r => r.id)
    expect(none).toContain('landscape')
    expect(none).not.toContain('erosion')
    const cc = rows({ council: 'central-coast' })
    expect(cc.map(r => r.id)).not.toContain('landscape')
    expect(cc.map(r => r.id)).toContain('erosion')
    expect(row(cc, 'notification')?.unverified).toBe(true)
    expect(rows({ council: 'blue-mountains' }).map(r => r.id)).not.toContain('waste')
    expect(row(rows({ council: 'kiama' }), 'cost')?.detail).toMatch(/\$100,001 to \$1 million/)
    // The driveway's long section only with a driveway, and only where the council asks for one.
    expect(rows({ council: 'kiama' }).map(r => r.id)).not.toContain('driveway')
    expect(rows({ council: 'kiama', driveway: true }).map(r => r.id)).toContain('driveway')
    expect(rows({ driveway: true }).map(r => r.id)).not.toContain('driveway')
  })

  it('cites a source for every row', () => {
    for (const item of DA_ITEMS) expect(item.sources.length).toBeGreaterThan(0)
  })

  it('writes runs of sheets', () => {
    expect(sheetRange([])).toBe('')
    expect(sheetRange(['DA-04'])).toBe('DA-04')
    expect(sheetRange(['DA-04', 'DA-05', 'DA-06'])).toBe('DA-04 to DA-06')
  })
})

describe('the title block', () => {
  const info: TitleInfo = { project: 'Sample house', address: null, lot: null, sheet: 'Site plan', n: 3, of: 9, scale: 100, paper: 'A3', date: '9 November 2026', revision: 'A', preparedBy: null }

  it('numbers the sheet and gives the scale and paper', () => {
    const t = titleText(info)
    expect(t.number).toBe('DA-03 of 09')
    expect(t.scale).toBe('1:100 at A3')
    expect(t.concept).toBe('Concept only: not for construction')
    expect(t.caveat).toMatch(/^Concept planning aid only/)
    expect(t.preparedBy).toBe('')
    expect(titleText({ ...info, scale: null }).scale).toBe('Not to scale, A3')
    expect(sheetOf(12, 14)).toBe('DA-12 of 14')
  })

  it('says the site address isn’t set without one, and shows it and the Lot/DP with one', () => {
    expect(titleText(info).site).toEqual([NOT_SET])
    expect(titleText({ ...info, lot: 'Lot 12 DP1000001' }).site).toEqual([NOT_SET, 'Lot 12 DP1000001'])
    expect(titleText({ ...info, address: '1 Example Street Sampleton 2000', lot: 'Lot 12 DP1000001' }).site).toEqual(['1 Example Street Sampleton 2000', 'Lot 12 DP1000001'])
  })

  it('keeps the revision a short code, A by default', () => {
    expect(daOf({}).revision).toBe('A')
    expect(daOf({ da: { revision: 'c' } }).revision).toBe('C')
    expect(cleanRevision(' b-2 ')).toBe('B2')
    expect(cleanRevision('  ')).toBeNull()
    expect(cleanRevision('revision')).toBe('REVI')
  })
})

describe('the DA pack', () => {
  const { survey, terrain } = site()
  const placement = { e: 1006, n: 1006, rotation: 5, ffl: 84 }
  const base = (plan: Plan): DaPackInput => ({
    plan,
    survey,
    siteArea: terrain.stats.area,
    earthworks: null,
    up: 'house',
    paper: 'A3',
    title: 'Sample house',
    date: '9 November 2026',
    terrain,
    revision: 'A',
    place: null,
    planning: null,
    council: null,
    checks: [],
    notChecked: [],
  })

  it('builds for an empty plan: a cover, a site plan and a checks summary, the rest not drawn yet', () => {
    const input = base(emptyPlan(placement))
    const { pages, rows } = daPackLayout(input)
    expect(pages.map(p => [p.number, p.kind])).toEqual([
      ['DA-01', 'cover'],
      ['DA-02', 'site'],
      ['DA-03', 'checks'],
    ])
    expect(rows.find(r => r.id === 'floor-plans')?.status).toBe('not-drawn')
    const pdf = text(daPackPdf(input))
    expect(pdf).toContain('/Count 3')
    expect(pdf).toContain('(DA document pack) Tj')
    expect(pdf).toContain('(DA-01 of 03) Tj')
    expect(pdf).toContain(`(${NOT_SET}) Tj`)
    expect(pdf.match(/\(Concept only: not for construction\) Tj/g)).toHaveLength(3)
    expect(pdf).toContain('(Not drawn yet) Tj')
    expect(pdf).toContain('(There are no checks to show yet.) Tj')
  })

  it('puts the sheets in DA order and numbers them, with the address on every title block', () => {
    const plan: Plan = { ...garageFloor(), placement, sections: [{ id: 's1', label: 'A', a: [-1, 2], b: [12, 2] }] }
    const input: DaPackInput = { ...base(plan), place: { address: '1 Example Street Sampleton 2000', lot: 'Lot 12 DP1000001' } }
    const { pages } = daPackLayout(input)
    const kinds = pages.map(p => p.kind)
    expect(kinds[0]).toBe('cover')
    expect(kinds[kinds.length - 1]).toBe('checks')
    expect(kinds.indexOf('site')).toBeLessThan(kinds.indexOf('floor'))
    expect(kinds.indexOf('floor')).toBeLessThan(kinds.indexOf('elevation'))
    expect(kinds.indexOf('elevation')).toBeLessThan(kinds.indexOf('section'))
    expect(daPackLayout(input).rows.find(r => r.id === 'sections')?.status).toBe('in-pack')
    expect(pages.map(p => p.number)).toEqual(pages.map((_, i) => `DA-${String(i + 1).padStart(2, '0')}`))
    const pdf = text(daPackPdf(input))
    expect(pdf.match(/\(1 Example Street Sampleton 2000\) Tj/g)).toHaveLength(pages.length)
    expect(pdf).toContain(`(DA-${String(pages.length).padStart(2, '0')} of ${String(pages.length).padStart(2, '0')}) Tj`)
    expect(pdf).not.toContain(NOT_SET)
  })

  it('lists every fail, missing fact and part not drawn, fails first, and never a pass', () => {
    const check = (id: string, status: CheckResult['status']): CheckResult => ({ id, title: `Check ${id}`, status, source: { clause: 'Test DCP 1.1', confidence: 'read', asAt: 'test' } })
    const checks = [check('a', 'pass'), check('b', 'unknown'), check('c', 'fail'), check('d', 'incomplete'), check('e', 'warn')]
    expect(listedChecks(checks).map(c => c.id)).toEqual(['c', 'e', 'b', 'd'])
    const pdf = text(daPackPdf({ ...base({ ...garageFloor(), placement }), checks, council: COUNCIL_TABLES.wollongong }))
    expect(pdf).toContain('(1 fail \\267 1 to check \\267 1 needs a fact \\267 1 not drawn yet \\267 1 pass) Tj')
    for (const id of ['b', 'c', 'd', 'e']) expect(pdf).toContain(`(Check ${id}) Tj`)
    expect(pdf).not.toContain('(Check a) Tj')
    expect(pdf).toContain('(Fails) Tj')
  })

  it('builds from the app for garageFloor(), with cut and fill and a stormwater concept', () => {
    const plan: Plan = { ...garageFloor(), placement }
    const earth = earthFrom(terrain.grid, survey.boundary, earthInputs(plan, survey))
    const f = daPackFile({ plan, survey, terrain, earth, up: 'house', paper: 'A4', pdfFurniture: true })
    expect(f.name).toBe(`${fileSafe(projectTitle(plan))}-DA-pack.pdf`)
    const pdf = text(f.data as Uint8Array)
    expect(pdf).toContain('(Stormwater concept) Tj')
    expect(pdf).toContain('(Checks summary) Tj')
    if (earth.result.cut + earth.result.fill > 0.01) expect(pdf).toContain('(Cut and fill plan) Tj')
    // A4 landscape.
    expect(pdf).toContain('/MediaBox [0 0 841.89 595.28]')
  })
})
