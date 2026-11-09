import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../components/tools'
import { normalizePlan, type Plan } from '../model'
import { addLevelAbove, deleteLevel } from '../ops'
import { addNote, cleanNote, deleteNote, newNote, NOTE_MAX, notesOf, updateNote } from '../notes'
import { garageFloor } from './fixtures'

describe('plan notes', () => {
  it('loads an older saved plan with no notes field as having none', () => {
    const old = JSON.parse(JSON.stringify(garageFloor())) as Plan
    expect('notes' in old).toBe(false)
    expect(normalizePlan(old).notes).toEqual([])
    expect(notesOf(old)).toEqual([])
  })

  it('keeps notes through normalizePlan and a save and load', () => {
    const plan = addNote(normalizePlan(garageFloor()), newNote('level_ground', [1, 2], 'Door sticks'))
    const back = normalizePlan(JSON.parse(JSON.stringify(plan)))
    expect(back.notes).toEqual([expect.objectContaining({ level: 'level_ground', at: [1, 2], text: 'Door sticks' })])
  })

  it('adds, edits and deletes a note without touching the rest of the plan', () => {
    let plan = normalizePlan(garageFloor())
    const n = newNote('level_ground', [3, 4], '  Check\n  levels  ')
    expect(n.text).toBe('Check levels')
    plan = addNote(plan, n)
    plan = updateNote(plan, n.id, { text: 'Check the fall' })
    expect(notesOf(plan)[0].text).toBe('Check the fall')
    expect(plan.walls).toEqual(garageFloor().walls)
    plan = deleteNote(plan, n.id)
    expect(notesOf(plan)).toEqual([])
  })

  it('caps a note at a label\'s length', () => {
    expect(cleanNote('x'.repeat(500))).toHaveLength(NOTE_MAX)
  })

  it('removes a floor\'s notes with the floor', () => {
    const up = addLevelAbove(normalizePlan(garageFloor()))
    const plan = addNote(addNote(up.plan, newNote('level_ground', [0, 0], 'down')), newNote(up.id, [0, 0], 'up'))
    expect(notesOf(deleteLevel(plan, up.id)).map(n => n.text)).toEqual(['down'])
  })
})

describe('tool keys', () => {
  it('never gives two tools the same key', () => {
    const keys = TOOLS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(TOOLS.find(t => t.id === 'measure')?.key).toBe('L')
    expect(TOOLS.find(t => t.id === 'note')?.key).toBe('E')
  })
})
