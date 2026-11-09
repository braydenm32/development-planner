import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { DriveLine } from '../../plan/crossing'
import { normalizePlan, type CrossingFacts } from '../../plan/model'
import { BLUE_MOUNTAINS } from '../councils/blueMountains'
import { WOLLONGONG } from '../councils/wollongong'
import { analyseDrive, crossingChecks, crossingStandard, driveChecks, kerbLevel, shapeOf } from '../crossing'
import { runChecks } from '../rules'
import type { CheckResult } from '../types'
import { L0, measureSample, site } from './sample'

/** A drive `run` m long from the garage floor at `top`, falling `grade` to the street boundary, as the checks see it. */
function line(o: { run?: number; top?: number; grade?: number; along?: { x: number; z: number }[]; natural?: number | null; facts?: CrossingFacts; door?: DriveLine['door']; width?: number; why?: DriveLine['why'] } = {}): DriveLine {
  const run = o.run ?? 12
  const top = o.top ?? 45.5
  const grade = o.grade ?? 0.1
  const along = o.along ?? Array.from({ length: Math.round(run / 0.25) + 1 }, (_, k) => ({ x: k * 0.25, z: top - k * 0.25 * grade }))
  const end = along[along.length - 1]
  return {
    id: 'd',
    name: 'Driveway',
    garage: [0, run],
    boundary: o.why ? null : [0, 0],
    out: o.why ? null : [0, -1],
    edge: o.why ? null : 0,
    guessed: false,
    why: o.why,
    along,
    floor: top,
    natural: o.natural === undefined ? end.z : o.natural,
    width: { min: o.width ?? 3.6, street: o.width ?? 3.6 },
    door: o.door === undefined ? { width: 2.7, skew: 0, offset: 0 } : o.door,
    facts: o.facts ?? {},
  }
}

const AS = crossingStandard(null)
const rows = (l: DriveLine, c = AS) => driveChecks(analyseDrive(l, c))
const row = (rs: CheckResult[], id: string) => rs.find(r => r.id === id)!

describe('the kerb level', () => {
  const shape = shapeOf(AS, line())
  it('takes a typed level first', () => {
    expect(kerbLevel(line({ facts: { kerb: { rl: 43, from: 'typed' } } }), shape)).toEqual({ rl: 43, from: 'typed' })
  })
  it('then works it out from the survey’s level at the boundary', () => {
    const k = kerbLevel(line({ natural: 44.3, facts: { kerb: { rl: 43, from: 'state' } } }), shape)!
    expect(k.from).toBe('survey')
    expect(k.boundary).toBe(44.3)
    expect(k.rl).toBeCloseTo(44.3 - 0.03 * 1.53 - 0.19, 6)
  })
  it('then the state’s elevation data, once read', () => {
    expect(kerbLevel(line({ natural: null, facts: { kerb: { rl: 43.1, from: 'state' } } }), shape)).toEqual({ rl: 43.1, from: 'state' })
  })
  it('and with none, the crossing checks need a fact, never pass', () => {
    const rs = rows(line({ natural: null }))
    expect(kerbLevel(line({ natural: null }), shape)).toBeNull()
    for (const id of ['drive-footpath', 'drive-scrape']) {
      expect(row(rs, id).status, id).toBe('unknown')
      expect(row(rs, id).value).toMatch(/kerb level/)
    }
    // The drive's own grade doesn't need the street.
    expect(row(rs, 'drive-grade').status).toBe('pass')
  })
})

describe('the drive’s grade', () => {
  it('passes up to 1 in 5, warns to 1 in 4 (a non-slip finish) and fails steeper', () => {
    expect(row(rows(line({ grade: 0.15 })), 'drive-grade').status).toBe('pass')
    expect(row(rows(line({ grade: 0.22 })), 'drive-grade').status).toBe('warn')
    const steep = row(rows(line({ grade: 0.3 })), 'drive-grade')
    expect(steep.status).toBe('fail')
    expect(steep.value).toMatch(/^Steepest 1 in 3\.3 \(30%\)/)
    expect(steep.source.clause).toMatch(/AS\/NZS 2890\.1/)
  })
  it('names the first 3 m inside the boundary when it’s gentler or steeper than the rest', () => {
    const along = Array.from({ length: 49 }, (_, k) => ({ x: k * 0.25, z: k * 0.25 <= 9 ? 46 - k * 0.25 * 0.1 : 45.1 - (k * 0.25 - 9) * 0.02 }))
    expect(row(rows(line({ along })), 'drive-grade').value).toMatch(/1 in 50\.0 \(2%\) over the first 3 m inside the boundary/)
  })
  it('uses the council’s number and its “generally”', () => {
    const r = row(rows(line({ grade: 0.3 }), crossingStandard(BLUE_MOUNTAINS)), 'drive-grade')
    expect(r.status).toBe('warn')
    expect(r.source.clause).toBe('Blue Mountains DCP 2015 E2.3.3 C3, C4')
    expect(row(rows(line({ grade: 0.3 }), crossingStandard(WOLLONGONG)), 'drive-grade').source.clause).toBe('Wollongong standard drawing 7000-C33')
  })
})

describe('the footpath crossing', () => {
  it('passes a standard crossing from the survey’s level at the boundary', () => {
    const r = row(rows(line()), 'drive-footpath')
    expect(r.status).toBe('pass')
    expect(r.value).toBe('Falls 1 in 33.3 (3%) to the road over 1.53 m')
    expect(r.note).toMatch(/survey’s level at the boundary/)
  })
  it('warns outside Wollongong’s 2.5%, with the level the drive wants at the boundary', () => {
    // Kerb RL 44.00 and the drive at RL 44.30 at the boundary: (44.30 − 44.19) / 1.53 = 7.2%.
    const r = row(rows(line({ top: 45.5, grade: 0.1, facts: { kerb: { rl: 44, from: 'typed' } } }), crossingStandard(WOLLONGONG)), 'drive-footpath')
    expect(r.status).toBe('warn')
    expect(r.value).toBe('Falls 1 in 13.9 (7.2%) to the road over 1.53 m')
    expect(r.limit).toBe('Up to 1 in 40 (2.5%) towards the road')
    expect(r.note).toMatch(/about RL 44\.23 at the boundary/)
  })
  it('fails one steeper than the 1 in 8 Wollongong lets a footpath beside a crossing be regraded to', () => {
    // Kerb RL 43.60, the drive at RL 44.30: (44.30 − 43.79) / 1.53 = 33%.
    const r = row(rows(line({ facts: { kerb: { rl: 43.6, from: 'typed' } } }), crossingStandard(WOLLONGONG)), 'drive-footpath')
    expect(r.status).toBe('fail')
    expect(r.note).toMatch(/Too steep to walk across/)
  })
  it('fails a footpath falling into the lot', () => {
    const r = row(rows(line({ facts: { kerb: { rl: 44.6, from: 'typed' } } })), 'drive-footpath')
    expect(r.status).toBe('fail')
    expect(r.value).toMatch(/towards the lot/)
  })
})

describe('changes of grade', () => {
  it('passes small changes', () => {
    expect(row(rows(line({ grade: 0.08 })), 'drive-transitions').status).toBe('pass')
  })
  it('warns where a transition is needed and there’s room for it', () => {
    // 1 in 6 off a level garage floor: a 16.7% summit, over AS/NZS 2890.1’s 12.5%.
    const r = row(rows(line({ grade: 1 / 6 })), 'drive-transitions')
    expect(r.status).toBe('warn')
    expect(r.value).toMatch(/16\.7% summit at the garage/)
  })
  it('fails when the drive is too short to fit its transitions', () => {
    // Level, then 2 m at 1 in 3, then level to the boundary: 33% changes 2 m apart need 3 m each.
    const along = Array.from({ length: 33 }, (_, k) => {
      const x = k * 0.25
      return { x, z: x <= 3 ? 46 : x <= 5 ? 46 - (x - 3) / 3 : 46 - 2 / 3 }
    })
    const r = row(rows(line({ along })), 'drive-transitions')
    expect(r.status).toBe('fail')
    expect(r.note).toMatch(/No room/)
  })
})

describe('scraping', () => {
  it('passes a gentle drive', () => {
    const r = row(rows(line({ grade: 0.05 })), 'drive-scrape')
    expect(r.status).toBe('pass')
    expect(r.value).toMatch(/^Clears by \d+ mm/)
  })
  it('fails at a sharp summit and says where', () => {
    // Level 6 m from the garage, then 1 in 4 to the boundary.
    const along = Array.from({ length: 49 }, (_, k) => ({ x: k * 0.25, z: k * 0.25 <= 6 ? 46 : 46 - (k * 0.25 - 6) * 0.25 }))
    const r = row(rows(line({ along })), 'drive-scrape')
    expect(r.status).toBe('fail')
    expect(r.value).toMatch(/^Scrapes \d+ mm 6\.\d m in from the boundary \(underneath, between the wheels\)$/)
  })
})

describe('turning in', () => {
  it('never passes: what it checks, and the rest for the designer', () => {
    const r = row(rows(line()), 'drive-turn')
    expect(r.status).toBe('warn')
    expect(r.value).toBe('Check with the designer')
    expect(r.note).toMatch(/Not checked: a full swept path/)
  })
  it('fails a garage door too narrow for the car', () => {
    const r = row(rows(line({ door: { width: 2, skew: 0, offset: 0 } })), 'drive-turn')
    expect(r.status).toBe('fail')
    expect(r.value).toMatch(/garage door is 2\.00 m wide/)
  })
  it('fails a crossing narrower than the car', () => {
    expect(row(rows(line({ width: 1.8 })), 'drive-turn').status).toBe('fail')
  })
  it('says when the drive is under 3 m wide, or there’s no garage door to drive into', () => {
    expect(row(rows(line({ width: 2.8 })), 'drive-turn').note).toMatch(/2\.80 m at its narrowest/)
    expect(row(rows(line({ door: null })), 'drive-turn').note).toMatch(/No garage door found/)
  })
  it('uses Wollongong’s crossing width at the kerb', () => {
    const r = row(rows(line(), crossingStandard(WOLLONGONG)), 'drive-turn')
    expect(r.note).toMatch(/the crossing is 5\.6 m wide there/)
    expect(r.source.clause).toMatch(/7000-C30/)
  })
})

describe('a battle-axe lot, and a drive that doesn’t reach the street', () => {
  it('can’t check the crossing on a battle-axe lot', () => {
    const rs = rows(line({ why: 'battle-axe' }))
    for (const id of ['drive-footpath', 'drive-scrape', 'drive-turn']) expect(row(rs, id).status, id).toBe('unknown')
  })
  it('asks for the drive to be drawn to the street', () => {
    expect(row(rows(line({ why: 'not-to-street' })), 'drive-footpath').status).toBe('incomplete')
  })
})

describe('on the sample block', () => {
  it('an old plan with no driveway is unchanged, and its crossing checks wait for one', () => {
    const plan = normalizePlan({ ...garageFloor(), name: 'Sample house' })
    expect(plan.areas.every(a => a.crossing === undefined && a.drive === undefined)).toBe(true)
    const ms = measureSample({ checks: { frontEdge: 2 } })
    expect(ms.drives).toEqual([])
    const all = runChecks(ms, 'cdc')
    const drive = all.filter(r => r.id.startsWith('drive-'))
    expect(drive.map(r => r.status)).toEqual(['incomplete', 'incomplete', 'incomplete', 'incomplete', 'incomplete'])
    expect(drive[0].value).toBe('Draw a driveway (Area tool, kind Driveway) to check this.')
    // And the rest are the same as without them.
    expect(crossingChecks([], null).length).toBe(5)
  })

  it('checks a drawn drive from the garage door out to the north boundary', () => {
    const s = site()
    const drive = (p: ReturnType<typeof garageFloor>) => ({
      ...p,
      areas: [
        {
          id: 'drive',
          level: L0,
          name: 'Driveway',
          kind: 'driveway' as const,
          pts: [
            [1.15, 10.6],
            [7.15, 10.6],
            [7.15, 29.6],
            [1.15, 29.6],
          ] as Vec2[],
          drive: { garage: 'slab' as const },
        },
      ],
    })
    const ms = measureSample({ checks: { frontEdge: 2 }, plan: drive }, s)
    expect(ms.drives).toHaveLength(1)
    const d = ms.drives[0]
    expect(d.why).toBeUndefined()
    expect(d.floor).toBe(45.5)
    expect(d.door?.width).toBe(6)
    const rs = runChecks(ms, 'da', 'wollongong').filter(r => r.id.startsWith('drive-'))
    expect(rs.map(r => r.status)).not.toContain('incomplete')
    expect(rs.map(r => r.status)).not.toContain('unknown')
    expect(row(rs, 'drive-turn').status).toBe('warn')
  })
})
