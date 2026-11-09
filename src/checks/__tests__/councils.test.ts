// The council tables: every rule names a source the table holds, the registry finds a council by
// the names a planning lookup gives it, and a control a table leaves out isn't checked but listed.

import { describe, expect, it } from 'vitest'
import { activeCouncil, checkSettingsOf, COUNCILS, COUNCIL_TABLES, councilFor } from '../councils'
import { CONTROLS, type AreaBand, type Council, type RuleSource } from '../councils/types'
import { WOLLONGONG } from '../councils/wollongong'
import { bandOf, councilChecks, missingControls, NOT_CHECKED, notChecked } from '../rules'
import { measure } from '../measure'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan } from '../../plan/model'
import { readFileSync } from 'node:fs'

/** Every rule source in a table, with where it sits. */
function sources(c: Council): [string, RuleSource][] {
  const out: [string, RuleSource][] = []
  const walk = (path: string, v: unknown) => {
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (typeof o.in === 'string' && typeof o.clause === 'string') out.push([path, o as unknown as RuleSource])
    else for (const [k, w] of Object.entries(o)) walk(`${path}.${k}`, w)
  }
  for (const { key } of CONTROLS) walk(key, (c as unknown as Record<string, unknown>)[key])
  walk('sideRear', c.sideRear)
  return out
}

/** Every band list in a table. */
function bandLists(c: Council): [string, AreaBand<unknown>[]][] {
  return (
    [
      ['coverage', c.coverage?.bands],
      ['landscaped', c.landscaped?.bands],
      ['erosion', c.erosion?.bands],
    ] as [string, AreaBand<unknown>[] | undefined][]
  ).filter((x): x is [string, AreaBand<unknown>[]] => x[1] !== undefined)
}

describe('council tables', () => {
  it.each(COUNCILS.map(c => [c.name, c] as const))('%s: every rule cites an instrument the table holds, with its link and version', (_, c) => {
    expect(COUNCIL_TABLES[c.id]).toBe(c)
    for (const i of Object.values(c.instruments)) {
      expect(i.url).toMatch(/^https:\/\//)
      expect(i.version).not.toBe('')
      expect(i.cite).not.toBe('')
    }
    const all = sources(c)
    expect(all.length).toBeGreaterThan(0)
    for (const [where, s] of all) {
      expect(c.instruments[s.in], `${where} cites ${s.in}`).toBeDefined()
      for (const a of s.also ?? []) expect(c.instruments[a], `${where} also cites ${a}`).toBeDefined()
      expect(['read', 'secondary', 'unverified']).toContain(s.sure)
      expect(s.clause).not.toBe('')
    }
  })
  it.each(COUNCILS.map(c => [c.name, c] as const))('%s: area bands rise and end open', (_, c) => {
    for (const [where, bands] of bandLists(c)) {
      const edges = bands.slice(0, -1).map(b => b.below ?? b.upTo)
      expect(edges.every(e => e !== undefined), where).toBe(true)
      expect([...edges].sort((a, b) => a! - b!), where).toEqual(edges)
      const last = bands[bands.length - 1]
      expect(last.below === undefined && last.upTo === undefined, where).toBe(true)
    }
    for (const b of c.coverage?.bands ?? []) expect(b.value > 0 && b.value <= 1).toBe(true)
  })
  it('reads bands by their edges: under, and up to and including', () => {
    const bands: AreaBand<string>[] = [{ below: 450, value: 'a' }, { upTo: 900, value: 'b' }, { value: 'c' }]
    expect([449.9, 450, 900, 900.1].map(a => bandOf(bands, a))).toEqual(['a', 'b', 'b', 'c'])
  })
  it('Wollongong’s table holds every control the checks know', () => {
    expect(missingControls(WOLLONGONG)).toEqual([])
    expect(notChecked('da', WOLLONGONG)).toEqual(WOLLONGONG.notChecked)
  })
})

describe('the registry', () => {
  it('finds a council by id, LGA or LEP name, however it’s written', () => {
    for (const n of ['wollongong', 'Wollongong', 'WOLLONGONG', 'Wollongong City Council', 'Wollongong Local Environmental Plan 2009', 'Wollongong LEP 2009', 'City of Wollongong'])
      expect(councilFor(n)?.id, n).toBe('wollongong')
  })
  it('a council the app has no rules for is null, so only the Housing Code runs', () => {
    for (const n of ['Penrith City Council', 'Wingecarribee Shire Council', 'Sydney Local Environmental Plan 2012', 'Woll', '', null, undefined]) expect(councilFor(n), String(n)).toBeNull()
  })
  it('a plan saved before councils could be switched still has Wollongong on', () => {
    expect(activeCouncil(checkSettingsOf({ pathway: 'da', battleAxe: false }))?.id).toBe('wollongong')
    expect(activeCouncil(checkSettingsOf(undefined))).toBeNull()
  })
})

describe('a council whose table leaves controls out', () => {
  // A made-up council: Wollongong's table without the controls whose sources weren't read.
  const partial: Council = { ...WOLLONGONG, name: 'Made-up', coverage: undefined, landscaped: undefined, trees: undefined, height: { source: WOLLONGONG.height!.source } }
  const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  const plan = normalizePlan({ ...garageFloor(), name: 'Sample house', placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }, checks: { pathway: 'da', battleAxe: false, frontEdge: 0 } })
  const trees = [{ id: 't', label: 'T1', at: [18, 12] as [number, number], trunk: 0.5, height: 12, remove: false }]
  const ms = measure({ plan, survey, terrain, earth: null, trees })

  it('checks only what the table holds', () => {
    const ids = councilChecks(ms, partial).map(r => r.id)
    expect(ids).not.toContain('da-coverage')
    expect(ids).not.toContain('da-landscaped')
    expect(ids.some(i => i.startsWith('tree:'))).toBe(false)
    expect(ids).toContain('da-side-rear')
    expect(councilChecks(ms, WOLLONGONG).some(r => r.id === 'tree:t')).toBe(true)
  })
  it('says what it can’t check for that council', () => {
    const list = notChecked('da', partial)
    expect(list.slice(0, 3)).toEqual(['Site coverage: Made-up’s own rule isn’t in the app yet', 'Landscaped area: Made-up’s own rule isn’t in the app yet', 'Trees: Made-up’s own rule isn’t in the app yet'])
    expect(notChecked('cdc', partial)).toEqual(NOT_CHECKED.cdc)
    expect(notChecked('da', null)).toEqual(NOT_CHECKED.cdc)
  })
  it('without a DCP height, asks for the LEP map value', () => {
    const h = councilChecks(ms, partial).find(r => r.id === 'da-height')!
    expect(h.status).toBe('unknown')
    expect(h.limit).toBe('The Height of Buildings Map value for this lot')
    expect(h.source.clause).toBe('Wollongong LEP 2009 cl 4.3(2)')
    const set = measure({ plan: { ...plan, checks: { ...plan.checks!, lepHeight: 8.5 } }, survey, terrain, earth: null })
    expect(councilChecks(set, partial).find(r => r.id === 'da-height')!.status).toBe('pass')
  })
})
