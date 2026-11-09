// Walls rising to meet a roof whose eaves sit above their ceiling, on the made-up split level
// (fixtures.ts), and the wall area the quantities count for them.

import { describe, expect, it } from 'vitest'
import type { Plan, Wall } from '../model'
import { addRoof } from '../ops'
import { designQuantities } from '../quantities'
import { levelOutlines } from '../roof'
import { ceilingRL, matchRoofline, setEavesRL, wallTopAt, wallTopRL } from '../roofline'
import { splitLevels } from './fixtures'

const DEFAULTS = { type: 'hip' as const, pitch: 22.5, overhang: 0.45 }

/** The split level with a hip roof over the middle wing (ceiling RL 85.9). */
function midRoofed(): Plan {
  const p = splitLevels()
  return addRoof(p, 'level_mid', levelOutlines(p.walls.filter(w => w.level === 'level_mid'))[0], DEFAULTS)
}
const roofOn = (p: Plan, level: string) => p.roofs.find(r => r.level === level)!
const wallsOn = (p: Plan, level: string) => p.walls.filter(w => w.level === level)
/** The split level without its top storey, so the lower wing has nothing built on it. */
const noTop = (p: Plan): Plan => ({ ...p, levels: p.levels.filter(l => l.id !== 'level_top'), walls: p.walls.filter(w => w.level !== 'level_top') })

describe('walls under a roof set above their ceiling', () => {
  it('rise to meet the roof, outside walls only', () => {
    let p = midRoofed()
    p = setEavesRL(p, roofOn(p, 'level_mid').id, 86.5)
    const inside: Wall = { id: 'mid_in', level: 'level_mid', a: [4, 6], b: [4, 12], thickness: 0.11, kind: 'internal' }
    p = { ...p, walls: [...p.walls, inside] }
    // All but the south wall, where the top storey's own wall stands in the gap (next test but two).
    for (const w of wallsOn(p, 'level_mid').filter(w => w.kind === 'external' && w.id !== 'mid_0')) expect(wallTopRL(p, w)).toBeCloseTo(86.5, 9)
    // Inside walls stop at the ceiling, and so do walls not under the roof.
    expect(wallTopRL(p, inside)).toBeCloseTo(ceilingRL(p, 'level_mid'), 9)
    for (const w of wallsOn(p, 'level_low')) expect(wallTopRL(p, w)).toBeCloseTo(84.7, 9)
    expect(wallTopAt(p, 'level_mid', [4, 9])).toBeCloseTo(86.5, 9)
    expect(wallTopAt(p, 'level_mid', [20, 9])).toBeCloseTo(85.9, 9)
  })

  it('stay at their ceiling when the eaves are lower', () => {
    let p = midRoofed()
    p = setEavesRL(p, roofOn(p, 'level_mid').id, 85.5)
    for (const w of wallsOn(p, 'level_mid')) expect(wallTopRL(p, w)).toBeCloseTo(85.9, 9)
    expect(wallTopRL(midRoofed(), wallsOn(p, 'level_mid')[0])).toBeCloseTo(85.9, 9)
  })

  it('rise across levels: a roof over the lower wing matched to the middle wing’s ceiling', () => {
    let p = noTop(splitLevels())
    p = addRoof(p, 'level_low', levelOutlines(wallsOn(p, 'level_low'))[0], DEFAULTS)
    p = matchRoofline(p, roofOn(p, 'level_low').id, 'level:level_mid')
    for (const w of wallsOn(p, 'level_low').filter(w => w.id !== 'low_2')) expect(wallTopRL(p, w)).toBeCloseTo(85.9, 9)
    // Where the two wings meet, the middle wing's own wall carries the roof.
    expect(wallTopRL(p, wallsOn(p, 'level_low').find(w => w.id === 'low_2')!)).toBeCloseTo(84.7, 9)
  })

  it('don’t rise through a storey built on them, or past the next wing’s wall: the roof sits on those', () => {
    let p = splitLevels()
    const mid = setEavesRL(midRoofed(), roofOn(midRoofed(), 'level_mid').id, 86.5)
    // The top storey's north wall stands along the middle wing's south wall, from RL 85 up.
    expect(wallTopRL(mid, wallsOn(mid, 'level_mid').find(w => w.id === 'mid_0')!)).toBeCloseTo(85.9, 9)
    // A roof over the top storey covers the lower wing too, but the top storey's floor is between.
    p = addRoof(p, 'level_top', levelOutlines(wallsOn(p, 'level_top'))[0], DEFAULTS)
    for (const w of wallsOn(p, 'level_low')) expect(wallTopRL(p, w)).toBeCloseTo(84.7, 9)
    for (const w of wallsOn(p, 'level_top')) expect(wallTopRL(p, w)).toBeCloseTo(ceilingRL(p, 'level_top'), 9)
  })

  it('count their full height in the outside wall area', () => {
    const p = midRoofed()
    const before = designQuantities(p, null, []).walls
    const raised = designQuantities(setEavesRL(p, roofOn(p, 'level_mid').id, 86.5), null, []).walls
    // The middle wing's walls are 0.6 m taller bar the south one, which the top storey's wall
    // meets; the lower wing's are as they were.
    expect(raised.perimeter).toBeCloseTo(before.perimeter, 9)
    expect(raised.gross - before.gross).toBeCloseTo(0.6 * (midPerimeter(p) - 8.27), 6)
    expect(raised.net - before.net).toBeCloseTo(raised.gross - before.gross, 6)
    const lower = designQuantities(setEavesRL(p, roofOn(p, 'level_mid').id, 85.5), null, []).walls
    expect(lower.gross).toBeCloseTo(before.gross, 9)
  })
})

function midPerimeter(p: Plan): number {
  const ring = levelOutlines(wallsOn(p, 'level_mid'))[0]
  return ring.reduce((t, a, i) => {
    const b = ring[(i + 1) % ring.length]
    return t + Math.hypot(b[0] - a[0], b[1] - a[1])
  }, 0)
}
