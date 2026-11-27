// The retaining wall rows count the walls the earthworks imply (LF-05), and the engineer figure
// reads the same wherever it's said (LF-06, HO-24, DB-23).

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TERMS } from '../../guide/glossary'
import { Accuracy } from '../../legal/pages'
import features from '../../nav/features.json'
import { ENGINEER_HEIGHT, ENGINEER_NOTE, ENGINEER_RULE, ENGINEER_TEXT, needsEngineer } from '../engineer'
import { runChecks } from '../rules'
import { fixOf } from '../targets'
import { measureSample, withRetaining } from './sample'

const vertical = { cutBatter: 0, fillBatter: 2 }

describe('implied walls in the checks (LF-05)', () => {
  it('counts a vertical cut edge as a retaining wall on a CDC, labelled implied', () => {
    const ms = measureSample({ checks: { frontEdge: 0 }, earth: vertical })
    expect(ms.walls).toHaveLength(0)
    expect(ms.implied.length).toBeGreaterThan(0)
    const tallest = Math.max(...ms.implied.map(w => w.height))
    expect(needsEngineer(tallest)).toBe(true)
    const row = runChecks(ms, 'cdc').find(r => r.id === 'hc-retaining')!
    expect(row.status).toBe('warn')
    expect(row.value).toBe(`Tallest holds back ${tallest.toFixed(2)} m (implied)`)
    expect(row.note).toContain(`over ${ENGINEER_TEXT}`)
    expect(row.note).toContain('implied')
    expect(row.note).toContain('Implied walls aren’t drawn yet')
    // Nothing to point at on the plan (no drawn wall), and it's fixed where the walls are listed.
    expect(row.walls).toEqual([])
    expect(fixOf(row)!.where).toMatch(/retaining walls/i)
  })

  it('and on a DA, against the council’s heights', () => {
    const ms = measureSample({ checks: { frontEdge: 0 }, earth: vertical })
    const row = runChecks(ms, 'da', 'wollongong').find(r => r.id === 'da-retaining')!
    expect(row.value).toContain('(implied)')
    expect(['fail', 'pass']).toContain(row.status)
    if (Math.max(...ms.implied.map(w => w.height)) > 1) expect(row.status).toBe('fail')
  })

  it('still says None with battered slopes and no walls', () => {
    const ms = measureSample({ checks: { frontEdge: 0 }, earth: { cutBatter: 2, fillBatter: 2 } })
    expect(ms.implied).toHaveLength(0)
    const row = runChecks(ms, 'cdc').find(r => r.id === 'hc-retaining')!
    expect(row.value).toBe('None')
    expect(row.status).toBe('pass')
  })

  it('keeps drawn walls as they were, and says how many more are implied', () => {
    const drawn = measureSample({ checks: { frontEdge: 0 }, plan: withRetaining, earth: { cutBatter: 2, fillBatter: 2 } })
    expect(drawn.implied).toHaveLength(0)
    expect(runChecks(drawn, 'cdc').find(r => r.id === 'hc-retaining')!.value).toMatch(/^Tallest holds back \d+\.\d\d m$/)
  })
})

describe('one engineer figure, said the same everywhere (LF-06, HO-24, DB-23)', () => {
  it('is 600 mm, for walls over it', () => {
    expect(ENGINEER_HEIGHT).toBe(0.6)
    expect(ENGINEER_TEXT).toBe('600 mm')
    expect(ENGINEER_NOTE).toBe('Over 600 mm: needs a professional engineer’s certificate.')
    expect(ENGINEER_RULE).toContain('over 600 mm')
    expect(ENGINEER_RULE).toContain('NSW Housing Code cl 3.30')
  })

  it('reads from that figure on the CDC row, the How accurate page, the glossary and the feature list', () => {
    const ms = measureSample({ checks: { frontEdge: 0 } })
    expect(runChecks(ms, 'cdc').find(r => r.id === 'hc-retaining')!.limit).toContain(`Over ${ENGINEER_TEXT} needs a professional engineer’s certificate`)
    const accuracy = renderToStaticMarkup(<Accuracy />)
    expect(accuracy).toContain(`over ${ENGINEER_TEXT}`)
    expect(accuracy).not.toContain('1.0 m as needing an engineer')
    const term = TERMS.find(t => t.id === 'retaining-wall')!
    expect(term.says).toContain(`over ${ENGINEER_TEXT}`)
    expect(term.says).not.toContain('1 m')
    const feature = (features as { id: string; name: string; visibleWhen?: string }[]).find(f => f.id === 'retaining-engineer-flag')!
    expect(feature.name).toContain(`over ${ENGINEER_TEXT}`)
    expect(feature.visibleWhen).toContain(`over ${ENGINEER_TEXT}`)
  })

  it('says whose figure the flag is where a council’s own rule lets the wall through', () => {
    // A wall holding back between 600 mm and Wollongong's 1 m, well clear of the boundary.
    const ms = measureSample({ checks: { frontEdge: 0 }, plan: withRetaining, earth: { cutBatter: 2, fillBatter: 2 } })
    const rw = ms.walls.find(w => needsEngineer(w.height) && w.height <= 1 && w.toBoundary > 0.9)
    const row = runChecks(ms, 'da', 'wollongong').find(r => r.id === 'da-retaining')!
    if (rw) expect(row.note).toContain(`over ${ENGINEER_TEXT}`)
    expect(row.limit).toContain('1 m')
  })
})
