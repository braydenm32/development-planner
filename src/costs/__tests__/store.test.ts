// Costs kept with the project: their own Undo while Costs is open, the record that carries them
// in Projects and cloud saves, and the project file. Share links never carry them (the Worker's
// own test checks a shared project leaves the costs record out).

import { beforeEach, describe, expect, it } from 'vitest'
import type { SavedProject } from '../../lib/storage'
import type { Plan } from '../../plan/model'
import { describeContents } from '../../projects/ops'
import type { ProjectMeta } from '../../projects/types'
import { projectReview } from '../../safety/review'
import { parseProjectFile, projectFileText } from '../../share/project'
import { emptyCosts, type CostsData } from '../model'
import { COSTS_KIND, costsForProject, costsFromRecords, hasCosts } from '../persist'
import { costsUndoKey, pointedNow, useCosts } from '../store'

const key = (k: string, o: { mod?: boolean; shift?: boolean } = {}) => ({ key: k, ctrlKey: !!o.mod, metaKey: false, shiftKey: !!o.shift })
const withCut = (d: CostsData, rate: number): CostsData => ({ ...d, rates: { ...d.rates, cut: rate } })

beforeEach(() => {
  useCosts.getState().load(emptyCosts())
  useCosts.setState({ focus: false, hover: null, opened: null })
})

describe('the costs store', () => {
  it('undoes and redoes changes, and skips a change that changes nothing', () => {
    const s = useCosts.getState()
    s.commit(d => withCut(d, 60))
    s.commit(d => ({ ...d, who: 'owner' }))
    s.commit(d => ({ ...d }))
    expect(useCosts.getState().past.length).toBe(2)
    useCosts.getState().undo()
    expect(useCosts.getState().data).toMatchObject({ who: 'builder', rates: { cut: 60 } })
    useCosts.getState().undo()
    expect(useCosts.getState().data).toEqual(emptyCosts())
    useCosts.getState().redo()
    expect(useCosts.getState().data.rates).toEqual({ cut: 60 })
    // a new change drops what could be redone
    useCosts.getState().commit(d => withCut(d, 70))
    expect(useCosts.getState().future).toEqual([])
  })

  it('starts each project with no history', () => {
    useCosts.getState().commit(d => withCut(d, 60))
    useCosts.getState().load({ ...emptyCosts(), who: 'owner' })
    expect(useCosts.getState()).toMatchObject({ past: [], future: [], data: { who: 'owner' } })
  })

  it('takes ⌘Z and ⌘⇧Z only while Costs is open', () => {
    useCosts.getState().commit(d => withCut(d, 60))
    expect(costsUndoKey(key('z', { mod: true }))).toBe(false)
    expect(useCosts.getState().data.rates).toEqual({ cut: 60 })
    useCosts.setState({ focus: true })
    expect(costsUndoKey(key('z'))).toBe(false)
    expect(costsUndoKey(key('z', { mod: true }))).toBe(true)
    expect(useCosts.getState().data.rates).toEqual({})
    expect(costsUndoKey(key('Z', { mod: true, shift: true }))).toBe(true)
    expect(useCosts.getState().data.rates).toEqual({ cut: 60 })
    useCosts.getState().undo()
    expect(costsUndoKey(key('y', { mod: true }))).toBe(true)
    expect(useCosts.getState().data.rates).toEqual({ cut: 60 })
  })

  it('points out the hovered line, else the one opened, and nothing once Costs closes', () => {
    const a = { line: 'cut', label: 'Dig out', what: '', target: { kind: 'cut' as const } }
    const b = { line: 'windows', label: 'Windows', what: '', target: { kind: 'openings' as const, ids: ['o1'] } }
    expect(pointedNow({ focus: true, hover: a, opened: b })).toBe(a)
    expect(pointedNow({ focus: true, hover: null, opened: b })).toBe(b)
    expect(pointedNow({ focus: false, hover: a, opened: b })).toBeNull()
  })
})

describe('keeping costs with the project', () => {
  it('keeps them as their own record kind, and only once they say something', () => {
    expect(COSTS_KIND).toBe('costs')
    expect(hasCosts(emptyCosts())).toBe(false)
    expect(costsFromRecords(null)).toBeUndefined()
    expect(costsFromRecords({ plan: {} })).toBeUndefined()
    expect(costsFromRecords({ costs: emptyCosts() })).toBeUndefined()
    expect(costsFromRecords({ costs: { ...emptyCosts(), who: 'owner', rates: { cut: 60, bogus: 1 } } })).toEqual({ ...emptyCosts(), who: 'owner', rates: { cut: 60 } })
    expect(costsForProject()).toBeUndefined()
    useCosts.getState().commit(d => withCut(d, 60))
    expect(costsForProject()).toEqual(withCut(emptyCosts(), 60))
  })

  it('carries them in the project file, and reads a file without them', () => {
    const survey: SavedProject = { fileName: 'block.dxf', dxfText: '0\nEOF\n', roles: {} } as SavedProject
    const plan = { version: 1, name: 'House', levels: [], walls: [], openings: [], rooms: [], areas: [], roofs: [], stairs: [], furniture: [], placement: { e: 0, n: 0, rotation: 0, ffl: 0 } } as unknown as Plan
    const costs: CostsData = { ...emptyCosts(), who: 'owner', quotes: { cut: { amount: 2000, from: 'Ann', date: '2026-11-08' } } }
    const withCosts = parseProjectFile(projectFileText(survey, plan, undefined, costs))
    expect(withCosts.costs).toEqual(costs)
    expect(JSON.parse(projectFileText(survey, plan)).costs).toBeUndefined()
    expect(parseProjectFile(projectFileText(survey, plan)).costs).toBeNull()
    // and says so before opening one
    const review = projectReview({ file: 'House.project.json', name: 'House', survey, plan, siteFeatures: 0, costs: '1 quote, built by the owner', current: null })
    expect(review.facts).toContainEqual({ label: 'Costs', value: '1 quote, built by the owner' })
  })

  it('names them among what deleting a project removes', () => {
    const meta = { id: 'p1', name: 'House' } as ProjectMeta
    const out = describeContents(meta, { costs: { ...emptyCosts(), quotes: { cut: { amount: 1, from: '', date: '' } } } })
    expect(out).toContain('Its costs: 1 quote')
    expect(out.some(l => l.startsWith('Everything else'))).toBe(false)
  })
})
