// Design › Checks' layout and what it points at, on the made-up sample block with the made-up garage
// floor: the three words, the topic groups (worst first, passes folded), the verdict card, the pins'
// numbers and places on the plan, where each row is fixed, why CDC and DA differ, and the spacing
// between retaining walls the Housing Code asks for.

import { describe, expect, it } from 'vitest'
import type { Plan, Wall } from '../../plan/model'
import { routeDifferences } from '../differ'
import { runChecks } from '../rules'
import { fixOf, targetOf } from '../targets'
import { foldedText, groupBadges, groupChecks, pinNumbers, topicOf, verdictOf, WORD_OF } from '../topics'
import type { CheckResult, CheckTree } from '../types'
import { COUNCIL_TABLES } from '../councils'
import { L0, measureSample, site, withRetaining } from './sample'

const s = site()
const row = (id: string, status: CheckResult['status'], title = id): CheckResult => ({ id, title, status, source: { clause: 'Test 1.1', confidence: 'read', asAt: 'test' } })

describe('the panel’s words and groups', () => {
  it('three words for what to do, beside a fact to add and a part not drawn', () => {
    expect(WORD_OF).toEqual({ fail: 'fix', warn: 'confirm', unknown: 'fact', incomplete: 'draw', pending: 'remove', pass: 'ok', info: 'info' })
  })

  it('puts every row under a topic', () => {
    expect(topicOf('map:zone')).toBe('land')
    expect(topicOf('tree:abc')).toBe('trees')
    expect(topicOf('drive-grade:d1')).toBe('driveway')
    expect(topicOf('da-sun-neighbours')).toBe('sun')
    expect(topicOf('hc-side')).toBe('setbacks')
    expect(topicOf('lot-inside')).toBe('setbacks')
    expect(topicOf('da-retaining')).toBe('earth')
    expect(topicOf('hc-retaining-gap')).toBe('earth')
    expect(topicOf('da-fsr')).toBe('size')
  })

  it('lists the groups with something to fix first, each worst first, and counts the rest', () => {
    const groups = groupChecks([row('da-height', 'pass'), row('da-front', 'pass'), row('da-batters', 'warn'), row('da-side', 'fail'), row('da-coverage', 'unknown'), row('da-cut-fill', 'pass')])
    expect(groups.map(g => g.id)).toEqual(['setbacks', 'earth', 'size'])
    expect(groups[0].rows.map(r => r.id)).toEqual(['da-side', 'da-front'])
    expect(groupBadges(groups[0])).toEqual([{ word: 'fix', text: 'Fix 1' }])
    expect(groupBadges(groups[2]).map(b => b.text)).toEqual(['1 fact', '1 OK'])
    expect(foldedText([row('a', 'pass'), row('b', 'pass'), row('c', 'pending'), row('d', 'info')])).toBe('+ 2 OK · 1 to remove · 1 for info')
  })

  it('folds a driveway that isn’t drawn to one line', () => {
    const g = groupChecks([row('drive-grade', 'incomplete'), row('drive-footpath', 'incomplete')])[0]
    expect(g.undrawn).toBe(true)
    expect(groupBadges(g)).toEqual([{ word: 'draw', text: 'Not drawn yet' }])
  })

  it('the verdict card counts what to do, then everything else', () => {
    const v = verdictOf([row('a', 'fail'), row('b', 'fail'), row('c', 'warn'), row('d', 'pass'), row('e', 'unknown'), row('drive-grade', 'incomplete'), row('hc-height', 'incomplete')])
    expect(v.head.map(h => h.text)).toEqual(['2 to fix', '1 to confirm'])
    expect(v.rest).toEqual(['1 OK', '1 fact to add', '1 not drawn yet', '1 wait for a driveway'])
    expect(verdictOf([row('a', 'pass')]).head[0].text).toBe('Nothing to fix')
    expect(verdictOf([row('a', 'pass'), row('b', 'unknown')]).head[0].text).toBe('Nothing to fix so far')
  })

  it('numbers the rows to fix and confirm that have a place on the plan, in the panel’s order, with no gaps', () => {
    const groups = groupChecks([row('da-height', 'warn'), row('da-side', 'fail'), row('map:zone', 'fail'), row('da-front', 'warn')])
    const n = pinNumbers(groups, r => !r.id.startsWith('map:'))
    expect([...n]).toEqual([
      ['da-side', 1],
      ['da-front', 2],
      ['da-height', 3],
    ])
  })
})

describe('where a row is on the plan', () => {
  const trees: CheckTree[] = [{ id: 'near', label: 'T1', at: [9, 12], trunk: 0.5, height: 12, remove: false }]
  const ms = measureSample({ checks: { frontEdge: 0 }, trees, plan: withRetaining, earth: { cutBatter: 2, fillBatter: 2 } })
  const da = runChecks(ms, 'da', 'wollongong')
  const by = (id: string) => da.find(r => r.id === id)!

  it('a setback points at its boundary and the distance it measures', () => {
    const front = ms.edges.find(e => e.role === 'front')!
    const t = targetOf(by('da-front'), ms)!
    expect(t.lines).toEqual([[front.a, front.b]])
    expect(t.gaps).toEqual([front.near])
    // The gap is the setback: as long as the row says.
    const [a, b] = t.gaps[0]
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(front.clearance!, 2)
  })

  it('a tree points at its trunk, with its protection and root zones', () => {
    const t = targetOf(by('tree:near'), ms)!
    expect(t.at).toEqual([9, 12])
    expect(t.circles.map(c => c.kind)).toEqual(['tpz', 'srz'])
    expect(t.circles[0].r).toBeCloseTo(6, 6)
  })

  it('the earthworks rows point at the cut, the size rows at the house, a fact at nothing', () => {
    expect(targetOf(by('da-batters'), ms)?.plan).toEqual({ kind: 'cut' })
    expect(targetOf(by('da-coverage'), ms)?.plan).toEqual({ kind: 'ground' })
    expect(targetOf(row('da-fsr', 'unknown'), ms)).toBeNull()
    expect(targetOf(row('map:zone', 'warn'), ms)).toBeNull()
  })

  it('retaining walls over the limit are named, and pointed at', () => {
    // rw_west holds back 2 m, 0.75 m from the boundary; rw_south 1.2 m: both over Wollongong's limits.
    const tall = by('da-retaining')
    expect(tall.status).toBe('fail')
    expect(tall.walls).toEqual(['rw_west', 'rw_south'])
    const t = targetOf(tall, ms)!
    expect(t.plan).toEqual({ kind: 'retaining', ids: ['rw_west', 'rw_south'] })
    expect(t.lines).toHaveLength(2)
  })

  it('every row to fix says where it’s fixed', () => {
    expect(fixOf(by('da-front'))).toMatchObject({ area: 'earthworks', tab: 'place' })
    expect(fixOf(by('da-batters'))).toMatchObject({ area: 'earthworks', tab: 'cut-fill' })
    expect(fixOf(by('da-retaining'))).toMatchObject({ area: 'earthworks', tab: 'retaining-walls' })
    expect(fixOf(by('tree:near'))).toMatchObject({ area: 'site', tab: 'features' })
    expect(fixOf(by('da-height'))).toMatchObject({ area: 'design', tab: 'roofs' })
    for (const r of da) expect(fixOf(r)).not.toBeNull()
  })
})

describe('why CDC and DA differ', () => {
  // A wall holding back more than Wollongong's 1 m but allowed on a CDC with an engineer.
  const tallWall = (p: Plan): Plan => {
    const w: Wall = { id: 'rw_tall', level: L0, a: [-1, -1.5], b: [11, -1.5], thickness: 0.2, kind: 'retaining', retain: { high: 'right', lowLevel: 'pad' } }
    return { ...p, walls: [...p.walls, w] }
  }

  it('a row whose verdict changes with the route says what each allows', () => {
    const ms = measureSample({ checks: { frontEdge: 0 } })
    const cdc = runChecks(ms, 'cdc')
    const da = runChecks(ms, 'da', 'wollongong')
    const lines = routeDifferences(da, ms, 'da', COUNCIL_TABLES.wollongong, cdc)
    for (const [id, text] of lines) {
      const mine = da.find(r => r.id === id)!
      expect(WORD_OF[mine.status]).not.toBe('draw')
      expect(text).toMatch(/^On a CDC this is (Fix|Confirm|OK): the Housing Code .+; Wollongong .+\.$/)
    }
    // Rows that agree say nothing.
    for (const r of da) if (!lines.has(r.id)) expect(cdc.find(c => c.id.replace('hc-', 'da-') === r.id && WORD_OF[c.status] !== WORD_OF[r.status] && ['fix', 'confirm', 'ok'].includes(WORD_OF[c.status]) && ['fix', 'confirm', 'ok'].includes(WORD_OF[r.status]) && r.id !== 'da-cut-fill')).toBeUndefined()
  })

  it('names the retaining wall rule each route has, both ways round', () => {
    const ms = measureSample({ checks: { frontEdge: 0 }, plan: tallWall, earth: { cutBatter: 2, fillBatter: 2 } })
    const cdc = runChecks(ms, 'cdc')
    const da = runChecks(ms, 'da', 'wollongong')
    expect(cdc.find(r => r.id === 'hc-retaining')!.status).toBe('warn')
    expect(da.find(r => r.id === 'da-retaining')!.status).toBe('fail')
    const onDa = routeDifferences(da, ms, 'da', COUNCIL_TABLES.wollongong, cdc).get('da-retaining')
    expect(onDa).toBe(
      'On a CDC this is Confirm: the Housing Code allows walls over 600 mm with an engineer’s certificate; Wollongong allows 600 mm within 900 mm of a side or rear boundary, 1 m elsewhere; over 1 m terraced and engineered.',
    )
    expect(routeDifferences(cdc, ms, 'cdc', COUNCIL_TABLES.wollongong, da).get('hc-retaining')).toMatch(/^On a DA this is Fix: the Housing Code allows walls over 600 mm/)
    // Worked out from the measures when the other route's rows aren't given.
    expect(routeDifferences(da, ms, 'da', COUNCIL_TABLES.wollongong).get('da-retaining')).toBe(onDa)
  })

  it('says nothing without a council to compare with', () => {
    const ms = measureSample({ checks: { frontEdge: 0 } })
    expect(routeDifferences(runChecks(ms, 'cdc'), ms, 'cdc', null).size).toBe(0)
  })
})

describe('retaining walls 2 m apart (Housing Code cl 3.30)', () => {
  const rw = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L0, a, b, thickness: 0.2, kind: 'retaining' })
  const gap = (walls: Wall[]) => runChecks(measureSample({ checks: { frontEdge: 0 }, plan: p => ({ ...p, walls: [...p.walls, ...walls] }) }), 'cdc').find(r => r.id === 'hc-retaining-gap')

  it('fails two walls side by side closer than 2 m, and names them', () => {
    const r = gap([rw('a', [0, -1.5], [12, -1.5]), rw('b', [0, -2.7], [12, -2.7])])!
    expect(r.status).toBe('fail')
    expect(r.value).toBe('Walls 1 and 2, 1.20 m apart')
    expect(r.walls).toEqual(['a', 'b'])
  })

  it('passes walls 2 m or more apart, and walls that meet at a corner', () => {
    expect(gap([rw('a', [0, -1.5], [12, -1.5]), rw('b', [0, -3.6], [12, -3.6])])!.status).toBe('pass')
    expect(gap([rw('a', [0, -1.5], [12, -1.5]), rw('b', [12, -1.5], [12, -8])])!.status).toBe('pass')
  })

  it('isn’t a row with one wall or none', () => {
    expect(gap([rw('a', [0, -1.5], [12, -1.5])])).toBeUndefined()
    expect(gap([])).toBeUndefined()
  })
})

describe('the sample block reads the same in Checks and on its pins', () => {
  it('every pinned row has a place, and only rows to fix or confirm are pinned', () => {
    const ms = measureSample({ checks: { frontEdge: 0 }, earth: { cutBatter: 2, fillBatter: 2 } })
    const rs = runChecks(ms, 'da', 'wollongong')
    const n = pinNumbers(groupChecks(rs), r => !!targetOf(r, ms))
    for (const [id] of n) {
      const r = rs.find(x => x.id === id)!
      expect(['fail', 'warn']).toContain(r.status)
      expect(targetOf(r, ms)).not.toBeNull()
    }
    expect([...n.values()]).toEqual([...n.values()].map((_, i) => i + 1))
    void s
  })
})
