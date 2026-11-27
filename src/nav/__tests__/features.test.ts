// The feature inventory (features.json) stays true to the app (LD-23, LF-10, LD-24): its ids are
// unique, every file it cites is there, every feature the menu names is in it, and each place
// it gives is one the app has today, in the menu's own words.

import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import features from '../features.json'
import { allPlaces, AREAS, MORE, placeName } from '../menu'

/** The places a `where` may start with: the six areas, and what is there in every one of them. */
const PLACES = [...AREAS.map(a => a.label), 'Every area', 'Top bar', 'Project menu', 'All projects', 'Summary strip', 'Search', 'Keyboard', 'Help', 'Start screen', 'Shared view', 'App start']

/** What may follow an area's name: its tabs, its More, and what floats on its plan. */
const IN_AREA = ['Tool rail', 'live section under the plan']

/** Names of the layout before the areas, and of modes the app no longer has. */
const OLD = /Floor plan|Print and share|print mode\b|3D site|[Nn]ew layout|old layout|All modes|3D mode|Design › Floors|Design › Checks|Design › BASIX|Earthworks › Stormwater|Share › Plans › DA pack|Retaining wall panel|Fit to view|mode tab/

const parts = (where: string) => where.split('; ')
/** A place's steps, "Design › Plan (Select tool) › Selected wall", leaving a › in brackets alone. */
const steps = (part: string) => part.split(/ › (?![^(]*\))/)
/** Whether a step names `label`, maybe with a note in brackets after it: "Cut & fill (first, above Balance)". */
const names = (step: string, label: string) => step === label || step.replace(/\s*\(.*\)$/, '') === label

describe('the feature inventory', () => {
  it('gives every feature its own id', () => {
    const ids = features.map(f => f.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cites only files that are there', () => {
    const missing = features.flatMap(f =>
      [...f.source.matchAll(/\b(?:src|worker|public|docs|samples)\/[\w./[\]-]+/g)].map(m => m[0].replace(/[.,]+$/, '')).filter(p => !existsSync(p)).map(p => `${f.id}: ${p}`),
    )
    expect(missing).toEqual([])
    for (const f of features) expect(f.source, f.id).toMatch(/\bsrc\/|\bworker\//)
  })

  it('has every feature the menu names', () => {
    const ids = new Set(features.map(f => f.id))
    const unknown = allPlaces().flatMap(({ entry }) => entry.features.filter(id => !ids.has(id)).map(id => `${entry.id}: ${id}`))
    expect(unknown).toEqual([])
  })

  it('says where each one is with a place the app has, in one style', () => {
    const wrong: string[] = []
    for (const f of features) {
      if (/ > /.test(f.where)) wrong.push(`${f.id}: uses > instead of ›`)
      for (const part of parts(f.where)) {
        const [first, second, third] = steps(part)
        if (!PLACES.some(p => names(first, p))) wrong.push(`${f.id}: ${part}`)
        const area = AREAS.find(a => a.label === first)
        if (!area || !second) continue
        if (names(second, MORE) || names(second, area.more.label)) {
          if (third && !area.more.items.some(i => names(third, i.label))) wrong.push(`${f.id}: no "${third}" under ${first} › More`)
        } else if (![...area.tabs.map(t => t.label), ...IN_AREA].some(l => names(second, l))) wrong.push(`${f.id}: ${first} has no tab "${second}"`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('names the tab or More item the menu gives as its home', () => {
    const away = allPlaces().flatMap(({ entry, place }) => {
      if (place.kind !== 'tab' && place.kind !== 'more') return []
      const at = place.kind === 'more' ? `${placeName(place)} › ${entry.label}` : placeName(place)
      return entry.features.filter(id => !features.find(f => f.id === id)?.where.includes(at)).map(id => `${id}: ${at}`)
    })
    expect(away).toEqual([])
  })

  it('uses no names from the old layout', () => {
    const stale = features.flatMap(f => (['name', 'where', 'visibleWhen'] as const).filter(k => OLD.test(f[k])).map(k => `${f.id} ${k}: ${f[k]}`))
    expect(stale).toEqual([])
  })

  it('keeps one word for what is saved with the project', () => {
    const kinds = new Set(features.map(f => f.persisted))
    expect([...kinds].filter(k => !['none', 'indexedDB', 'localStorage', 'cloud'].includes(k))).toEqual([])
  })
})
