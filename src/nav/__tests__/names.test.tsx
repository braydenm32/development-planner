// One name per thing (LD-13, LD-40, HO-34, HO-10, HO-26): a level of the house is a "level" and
// its height is the "Floor level (FFL)"; the tab is "Plan" and the view switch "2D | 3D"; the
// section under the plan is the "live section"; a drawn slab, deck, driveway or garden is an
// "outdoor area", so "Area" alone is a size in m²; the guide is "Getting started".

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../components/tools'
import { TERMS, termById } from '../../guide/glossary'
import { SECTIONS } from '../../guide/sections'
import { selectionCounts } from '../../plan/editing'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { updateLevel } from '../../plan/ops'
import { namePlanStep } from '../../shell/undoSteps'
import features from '../features.json'
import { allPlaces, areaById, HOMES } from '../menu'
import { buildIndex, search } from '../search'

const index = buildIndex(features)
const entries = allPlaces().map(p => p.entry)
const entry = (id: string) => entries.find(e => e.id === id)!

/** Every source file's text outside its comments, tests left out. */
function sources(dir = 'src'): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sources(path))
    } else if (/\.tsx?$/.test(name)) {
      const text = readFileSync(path, 'utf8')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .map(l => l.replace(/\{\/\*.*?\*\/\}/g, '').replace(/\s\/\/ .*$/, ''))
        .join('\n')
      out.push({ path, text })
    }
  }
  return out
}

describe('a level of the house', () => {
  it('has its tab called Levels, at the same address as before', () => {
    const tab = areaById('design')!.tabs.find(t => t.id === 'floors')!
    expect(tab.label).toBe('Levels')
    expect(areaById('design')!.tabs.map(t => t.label)).not.toContain('Floors')
  })

  it('is found first by level and levels in search, and still by floors, FFL and storey', () => {
    // "level" used to list Level area past slab edges and Change level, with the tab not in the first 15.
    for (const q of ['level', 'levels']) expect(search(index, q)[0], q).toMatchObject({ kind: 'tab', label: 'Levels' })
    for (const q of ['floors', 'FFL', 'floor level', 'storey']) expect(search(index, q).slice(0, 6).some(r => r.kind === 'tab' && r.label === 'Levels'), q).toBe(true)
  })

  it('is a level when it is renamed or changed, and a storey only where the rules count them', () => {
    const plan = garageFloor()
    const l = plan.levels[0]
    expect(namePlanStep(plan, updateLevel(plan, l.id, { name: 'Lower' })).what).toBe('rename level')
    expect(termById('storey')!.says).toMatch(/planning rules count/)
    expect(termById('gfa')!.says).toContain('every level')
    expect(SECTIONS.find(s => s.id === 'levels')!.steps[0]).toContain('Design › Levels')
  })

  it('no label, hint or message still says Design › Floors, Floor RL or floor RL', () => {
    const stale = sources().flatMap(f => {
      // The search words keep "floor RL" so people who type it still land on Levels.
      const text = f.path.endsWith('nav/menu.ts') ? f.text.replace(/'floor RL'/g, '') : f.text
      return [...text.matchAll(/Design › Floors|\b[Ff]loor RL\b|change it in Floors/g)].map(m => `${f.path}: ${m[0]}`)
    })
    expect(stale).toEqual([])
  })
})

describe('the plan and the view of it', () => {
  it('the view switch says 2D and 3D beside the Plan tab', () => {
    expect(areaById('design')!.tabs[0].label).toBe('Plan')
    expect(entry('view-plan').label).toBe('Show in 2D (the plan)')
    expect(entry('view-3d').label).toBe('Show in 3D')
    for (const q of ['2D', 'plan view', 'show the plan']) expect(search(index, q).slice(0, 3).some(r => r.action === 'view-plan'), q).toBe(true)
    // The switch itself, in the top bar, the shared view and on a phone.
    const switches = sources().filter(f => /AppShell\.tsx$|SharedView\.tsx$|CanvasChrome\.tsx$/.test(f.path))
    expect(switches).toHaveLength(3)
    for (const f of switches) {
      expect(f.text, f.path).toMatch(/'2D'/)
      expect(f.text, f.path).not.toMatch(/\? 'Plan' : '3D'|\? '3D' : 'Plan'/)
    }
  })

  it('the house plan’s own file is told apart from the project file that holds everything', () => {
    const menu = HOMES.find(h => h.id === 'project-menu')!.items.map(i => i.label)
    expect(menu).toContain('Download a backup (project file)')
    expect(menu).toContain('Export the house plan only')
    expect(menu).not.toContain('Export plan')
    expect(areaById('design')!.more.items.map(i => i.label)).toContain('House plan file')
    for (const q of ['export plan', 'plan file']) expect(search(index, q).slice(0, 4).some(r => r.action === 'export-plan' || r.label === 'House plan file'), q).toBe(true)
  })
})

describe('the live section and the sections you draw', () => {
  it('the one under the plan is the live section everywhere it is named', () => {
    expect(entry('section-strip').label).toBe('Show or fold the live section under the plan')
    expect(entry('draw-section').label).toBe('Draw a section line')
    const strip = sources().filter(f => /sectionStrip\/(SectionStrip|useSectionStrip)\.tsx$/.test(f.path))
    expect(strip).toHaveLength(2)
    for (const f of strip) expect(f.text, f.path).not.toMatch(/>\s*Section\s*<|Show the section|the section line\b/)
  })

  it('a section is never called a cut, which is earth dug out (HO-10)', () => {
    for (const e of entries) for (const s of [e.label, e.hint ?? '']) expect(s, e.id).not.toMatch(/\bthe cut’s\b|\bCuts through\b/)
    const tab = areaById('design')!.tabs.find(t => t.id === 'sections')!
    expect(tab.subtitle).toBe('Sections through the house and the slope, and the four elevations.')
    const stale = sources().flatMap(f => [...f.text.matchAll(/[Tt]he cut runs|where you want to cut through/g)].map(m => `${f.path}: ${m[0]}`))
    expect(stale).toEqual([])
  })
})

describe('an outdoor area and an area in m²', () => {
  it('the tool, its key and what it draws are an outdoor area', () => {
    expect(TOOLS.find(t => t.id === 'area')).toMatchObject({ label: 'Outdoor area', short: 'Outdoor', key: 'A' })
    expect(entry('tool-area').label).toBe('Outdoor area tool')
    expect(entry('inspect-area').label).toBe('Selected outdoor area')
    expect(selectionCounts([{ type: 'area', id: 'a' }, { type: 'area', id: 'b' }, { type: 'room', id: 'r' }])).toMatch(/2 outdoor areas/)
    for (const q of ['area', 'outdoor area', 'deck']) expect(search(index, q).slice(0, 8).some(r => r.action === 'tool:area'), q).toBe(true)
    const stale = sources().flatMap(f => [...f.text.matchAll(/\bArea tool, kind\b|with the Area tool\b|<h2>Area<\/h2>/g)].map(m => `${f.path}: ${m[0]}`))
    expect(stale).toEqual([])
  })
})

describe('plain words', () => {
  it('a slope is written 1 in 2 in the glossary, as the app writes it (HO-26)', () => {
    const batter = termById('batter')!.says
    expect(batter).toContain('1 in 2')
    for (const t of TERMS) expect(t.says, t.id).not.toMatch(/\b\d:1 means\b/)
  })

  it('a wall’s length says where it is measured, without "centreline" (HO-41)', () => {
    const stale = sources().flatMap(f => [...f.text.matchAll(/Length \(centreline\)|label="Ground against it"/g)].map(m => `${f.path}: ${m[0]}`))
    expect(stale).toEqual([])
    const inspector = sources().find(f => f.path.endsWith('components/PlanSections.tsx'))!.text
    expect(inspector).toContain('Length is measured along the middle of the wall')
    expect(inspector).toContain('label="Earth against this wall"')
  })

  it('the guide has one name, Getting started', () => {
    expect(entry('guide').label).toBe('Getting started guide')
    for (const q of ['how it works', 'help', 'getting started']) expect(search(index, q).slice(0, 3).some(r => r.action === 'guide'), q).toBe(true)
    const stale = sources().flatMap(f => [...f.text.matchAll(/How it works/g)].map(m => `${f.path}: ${m[0]}`))
    expect(stale).toEqual([])
  })
})
