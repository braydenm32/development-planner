import { describe, expect, it } from 'vitest'
import { normalizePlan } from '../../plan/model'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { EXPORT_CAVEAT } from '../exportCaveat'
import { doorWindowSchedule, scheduleCsv } from '../schedule'

const plan = normalizePlan({ ...garageFloor(), name: 'Sample house' })

describe('door and window schedule', () => {
  const rows = doorWindowSchedule(plan)

  it('lists every opening with its marks, floor, size and sill', () => {
    expect(rows).toHaveLength(plan.openings.length)
    expect(rows.map(r => r.id)).toEqual(['D1', 'D2', 'W1', 'O1', 'O2'])
    const win = rows.find(r => r.id === 'W1')!
    expect(win).toMatchObject({ floor: 'Ground floor', type: 'Window', width: 1.8, height: 1.2, sill: 0.9 })
  })

  it('names the rooms either side of the wall, or Outside', () => {
    const byType = (id: string) => rows.find(r => r.id === id)!
    // The entry door is in the north wall of the hall, which only has the Entry room behind it.
    expect(byType('D1').room).toBe('Entry')
    // The window in the east wall: the Study.
    expect(byType('W1').room).toBe('Study')
    // The wall between the laundry and the study has both.
    expect(byType('D2').room).toBe('Laundry / Study')
    expect(byType('D2').wall).toMatch(/^External wall, 4\.50 m$/)
  })

  it('writes a CSV in millimetres with the caveat last, quoting commas', () => {
    const csv = scheduleCsv([{ id: 'D1', floor: 'Ground, rear', type: 'Door', room: 'Hall', wall: 'External wall, 1.00 m', width: 0.82, height: 2.04, sill: 0 }])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Mark,Floor,Type,Room,Wall,Width (mm),Height (mm),Sill height (mm)')
    expect(lines[1]).toBe('D1,"Ground, rear",Door,Hall,"External wall, 1.00 m",820,2040,0')
    expect(lines.at(-1)).toBe(`"${EXPORT_CAVEAT}"`)
  })
})
