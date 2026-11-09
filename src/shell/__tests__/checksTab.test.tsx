// Design › Checks as drawn, on the made-up sample block with the made-up garage floor: the
// approval route as one control, the verdict card, the topic groups with Fix / Confirm / OK, what
// was measured beside what's allowed, the street side asked in the row that waits for it, and the
// pins on the plan. And the route's own rules: picking a council puts the route on DA, CDC keeps
// the council, and the map's council fills in only when none was picked.

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { checkSettingsOf } from '../../checks/councils'
import { councilFromMap, setCheckSettings, setRoute } from '../../checks/settings'
import { ChecksMarks, ChecksPlanLayer } from '../../checks/ChecksPlanLayer'
import { clearCheckPins, hoverCheck, pointedRow, setCheckPins, useChecksPointing, type Pin } from '../../checks/pointStore'
import type { CheckTarget } from '../../checks/targets'
import { TREE_REMOVAL_LABEL } from '../../checks/TreeRemoval'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)

vi.mock('../useSite', () => ({
  useLoaded: () => {
    const plan = usePlan.getState().plan
    return plan ? { plan, survey, terrain, earth: null } : null
  },
  pickTool: () => {},
}))

const { ChecksTab, CheckRow } = await import('../tabs/ChecksTab')

const sample = (checks: Plan['checks']): Plan => normalizePlan({ ...garageFloor(), name: 'Sample house', placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }, checks })
const settings = () => checkSettingsOf(usePlan.getState().plan!.checks)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Design › Checks', () => {
  beforeEach(() => clearCheckPins())

  it('shows the route as one control, the verdict, and the groups with three words', () => {
    usePlan.getState().load(sample({ pathway: 'da', battleAxe: false, councils: { wollongong: true } }))
    const html = renderToStaticMarkup(<ChecksTab />)
    const t = text(html)
    expect(t).toContain('Approval route')
    expect(html).toContain('aria-label="Council for a DA"')
    expect(html).toMatch(/<option value="wollongong" selected="">Wollongong<\/option>/)
    expect(t).toMatch(/DA: (\d+ to fix|\d+ to confirm|Nothing to fix)/)
    expect(t).toContain('Setbacks')
    expect(t).toContain('Building size &amp; height')
    expect(t).toContain('Lot facts')
    // No old words.
    expect(t).not.toMatch(/\bFails\b|Needs a fact|Mark for removal/)
    // What's allowed beside what was measured.
    expect(t).toContain('Allowed')
  })

  it('asks for the street side in the row that waits for it, once', () => {
    usePlan.getState().load(sample({ pathway: 'cdc', battleAxe: false, councils: { wollongong: true } }))
    const html = renderToStaticMarkup(<ChecksTab />)
    expect(html.split('Which side is the street?').length - 1).toBe(1)
  })

  it('a removable tree’s row has the one toggle, worded as Site › Features words it', () => {
    const r = { id: 'tree:t', title: 'Tree T1', status: 'pending' as const, value: 'To remove (needs approval)', tree: 't', removable: true, source: { clause: 'x', confidence: 'read' as const, asAt: 'y' } }
    const html = renderToStaticMarkup(<CheckRow r={r} />)
    expect(html).toContain(TREE_REMOVAL_LABEL)
    expect(html).toContain('checked=""')
    expect(text(html)).toContain('To remove')
  })

  it('a row that differs on the other route says why', () => {
    const r = { id: 'da-retaining', title: 'Retaining walls', status: 'fail' as const, value: 'Tallest holds back 1.20 m', limit: 'Up to 1 m', source: { clause: 'x', confidence: 'read' as const, asAt: 'y' } }
    const html = renderToStaticMarkup(<CheckRow r={r} n={2} differ="On a CDC this is Confirm: because." />)
    expect(text(html)).toContain('On a CDC this is Confirm: because.')
    expect(html).toContain('class="check-pin fix"')
    expect(text(html)).toContain('Tallest holds back 1.20 m · Allowed Up to 1 m')
  })
})

describe('the pins on the plan', () => {
  const S = (p: [number, number]): [number, number] => [p[0] * 10, -p[1] * 10]
  const pins: Pin[] = [
    { id: 'a', n: 1, word: 'fix', title: 'Front setback' },
    { id: 'b', n: 2, word: 'confirm', title: 'Geotechnical report' },
  ]
  const targets: Record<string, CheckTarget> = {
    a: { at: [10, 2], lines: [[[0, 0], [20, 0]]], gaps: [[[10, 4], [10, 0]]], circles: [], plan: null },
    b: { at: [10, 2], lines: [], gaps: [], circles: [{ at: [4, 4], r: 3, kind: 'tpz' }], plan: null },
  }
  const draw = (p: Pin[], shown: string | null = null) =>
    renderToStaticMarkup(
      <svg>
        <ChecksMarks plan={sample(undefined)} level="level_ground" survey={survey} terrain={terrain} earth={null} S={S} k={10} pins={p} targets={p.length ? targets : {}} shown={shown} />
      </svg>,
    )

  it('draws nothing while Checks is closed, a numbered pin for each row while it’s open', () => {
    expect(draw([])).toBe('<svg></svg>')
    // The panel's store starts empty, so the plan shows nothing until Checks opens.
    expect(renderToStaticMarkup(<svg><ChecksPlanLayer plan={sample(undefined)} level="level_ground" survey={survey} terrain={terrain} earth={null} S={S} k={10} /></svg>)).toBe('<svg></svg>')
    const html = draw(pins)
    expect(html).toContain('class="ck-pin fix"')
    expect(html).toContain('class="ck-pin confirm"')
    // Two on one spot sit side by side.
    const at = html.match(/translate\(([-\d.]+) /g)!
    expect(at).toHaveLength(2)
    expect(new Set(at).size).toBe(2)
    // Nothing pointed at yet: no red lines.
    expect(html).not.toContain('ck-line')
  })

  it('the row pointed at draws what it measures in red', () => {
    expect(draw(pins, 'a')).toContain('class="ck-line"')
    expect(draw(pins, 'a')).toContain('class="ck-gap"')
    expect(draw(pins, 'a')).toContain('class="ck-pin fix on"')
    expect(draw(pins, 'b')).toContain('class="ck-tpz"')
  })

  it('the panel fills the store and empties it as it closes', () => {
    setCheckPins(pins, targets)
    hoverCheck('a')
    expect(pointedRow(useChecksPointing.getState())).toBe('a')
    // A row no longer listed stops being pointed at.
    setCheckPins(pins.slice(1), { b: targets.b })
    expect(pointedRow(useChecksPointing.getState())).toBeNull()
    clearCheckPins()
    expect(useChecksPointing.getState().pins).toEqual([])
  })
})

describe('the approval route', () => {
  it('picking a council puts the route on DA; CDC keeps the council; DA comes back to it', () => {
    usePlan.getState().load(sample({ pathway: 'cdc', battleAxe: false, councils: {} }))
    setRoute('da', 'kiama')
    expect(settings().pathway).toBe('da')
    expect(settings().councils).toEqual({ kiama: true })
    setRoute('cdc')
    expect(settings().pathway).toBe('cdc')
    expect(settings().councils).toEqual({ kiama: true })
    setRoute('da', 'kiama')
    expect(settings().pathway).toBe('da')
    // No council: back to CDC.
    setRoute('da', null)
    expect(settings().pathway).toBe('cdc')
    expect(settings().councils?.kiama).toBe(false)
  })

  it('the map’s council fills in only when none was picked or switched off by hand', () => {
    usePlan.getState().load(sample({ pathway: 'cdc', battleAxe: false, councils: {} }))
    councilFromMap({ lga: 'WOLLONGONG', lep: 'Wollongong Local Environmental Plan 2009' })
    expect(settings().councils).toEqual({ wollongong: true })
    // The route stays as it was.
    expect(settings().pathway).toBe('cdc')
    // A council picked by hand stays.
    setRoute('da', 'kiama')
    councilFromMap({ lga: 'WOLLONGONG', lep: null })
    expect(settings().councils).toEqual({ kiama: true })
    // One switched off by hand stays off.
    setRoute('da', null)
    councilFromMap({ lga: 'WOLLONGONG', lep: null })
    expect(settings().councils?.wollongong).toBeUndefined()
    // A council the app doesn't know changes nothing.
    usePlan.getState().load(sample({ pathway: 'cdc', battleAxe: false, councils: {} }))
    councilFromMap({ lga: 'SOMEWHERE ELSE', lep: null })
    expect(settings().councils).toEqual({})
    setCheckSettings({ frontEdge: 0 })
    expect(settings().frontEdge).toBe(0)
  })
})
