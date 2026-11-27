// Where a stair lands: on the floor it joins, inside that floor's walls, with no wall across the
// flight or the step off the top, and no flight over 18 risers. Uses the made-up split level in
// fixtures.ts only: a lower wing (y 0..6), a middle wing beside it (y 6..12) and a top level over
// the lower wing.

import { describe, expect, it } from 'vitest'
import { normalizePlan, type Opening, type Plan, type Stair } from '../model'
import { flightRisers, stairLandingIssues } from '../stairLanding'
import { mm1, stairJoins, stairRules } from '../stairs'
import { splitLevels } from './fixtures'

const plan = (): Plan => normalizePlan(splitLevels())
const ids = (p: Plan, s: Stair) => stairLandingIssues(p, s).map(i => i.id)
const stair = (patch: Partial<Stair>): Stair => ({ id: 's', level: 'level_low', at: [4, 1], angle: 0, width: 0.9, base: 0, rise: 3, going: 0.25, shape: 'straight', turn: 'left', toLevel: 'level_top', ...patch })

describe('where a stair lands', () => {
  it('is happy with a stair that climbs inside the walls to the floor over them', () => {
    // 16 risers, 3.75 m long, from x 2 to 5.75 along the lower wing, up to the top level over it.
    expect(ids(plan(), stair({ at: [2, 3] }))).toEqual([])
  })

  it('says when it arrives outside the floor it joins', () => {
    const p = plan()
    // On the middle wing (y 6..12), going up to the top level, which is over the lower wing (y 0..6).
    const s = stair({ level: 'level_mid', at: [2, 9], rise: 1.8 })
    expect(ids(p, s)).toEqual(['outside'])
    expect(stairLandingIssues(p, s)[0].text).toMatch(/^It arrives outside Top level’s walls: the top step is \d\.\d\d m from that floor\./)
  })

  it('says when the flight runs through a wall, unless there’s a door or opening there', () => {
    const p = plan()
    // Climbing north from the lower wing through the wall between the wings (y = 6) to the middle level.
    const s = stair({ at: [4, 5], angle: 90, rise: 1.2, toLevel: 'level_mid' })
    expect(ids(p, s)).toEqual(['wall'])
    const wall = p.walls.find(w => w.level === 'level_low' && w.a[1] === 6 && w.b[1] === 6)!
    const along = Math.abs(4 - wall.a[0])
    const gap = (wall: string): Opening => ({ id: `gap_${wall}`, wall, kind: 'opening', offset: along, width: 1.2, height: 2.1, sill: 0, flipHinge: false, flipSwing: false })
    expect(ids({ ...p, openings: [gap(wall.id)] }, s)).toEqual([])
    // A window is no way through.
    expect(ids({ ...p, openings: [{ ...gap(wall.id), kind: 'window' }] }, s)).toEqual(['wall'])
  })

  it('says when a wall stands across the step off the top', () => {
    const p = plan()
    // The fixture's own stair: up to the middle level, stopping 0.5 m short of the wall between the wings.
    const s = p.stairs[0]
    expect(s.toLevel).toBe('level_mid')
    expect(ids(p, s)).toEqual(['wall-top'])
    expect(stairLandingIssues(p, s)[0].text).toContain('stands across the top step with no door or opening')
    // An opening in both wings' walls there lets it through.
    const walls = p.walls.filter(w => w.a[1] === 6 && w.b[1] === 6)
    const openings = walls.map((w): Opening => ({ id: `o_${w.id}`, wall: w.id, kind: 'opening', offset: Math.abs(6 - w.a[0]), width: 1.2, height: 2.1, sill: 0, flipHinge: false, flipSwing: false }))
    expect(ids({ ...p, openings }, s)).toEqual([])
  })

  it('allows 18 risers in a flight, and says what to do past that', () => {
    expect(flightRisers({ rise: 3, shape: 'straight' })).toEqual([16])
    expect(flightRisers({ rise: 3, shape: 'u' })).toEqual([8, 8])
    const p = plan()
    // 5.4 m in one straight flight is 29 risers; as a U it's 15 and 14.
    const tall = stair({ at: [0.5, 3], rise: 5.4, toLevel: null })
    expect(ids(p, tall)).toContain('flight')
    expect(stairLandingIssues(p, tall).find(i => i.id === 'flight')!.text).toContain('29 risers in one flight: the building code (NCC) allows 18')
    expect(ids(p, { ...tall, shape: 'u' })).not.toContain('flight')
  })

  it('leaves a stair whose top meets no floor to that warning', () => {
    const p = plan()
    expect(ids(p, stair({ at: [2, 3], toLevel: null, rise: 2 }))).toEqual([])
  })
})

describe('a stair’s riser, written the same way everywhere', () => {
  it('is to 0.1 mm in the card’s headline and in its limits', () => {
    const p = plan()
    // 1.5 m in 8 risers: 187.5 mm each.
    const s = stair({ at: [2, 3], rise: 1.5, toLevel: null })
    expect(stairJoins(p, s).risers).toBe('8 risers of 187.5 mm')
    expect(mm1(stairRules(s)[0].value)).toBe('187.5')
    expect(mm1(0.19)).toBe('190')
  })
})
