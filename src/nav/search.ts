// ⌘K search over the menu: every area, tab, More item and command by its name and plain
// words, and every feature (features.json) by its name, each leading to its home. Places and
// actions rank first, then features (by a short label), then what a word means (C35).

import { allPlaces, areaById, homeOf, placeName, tabOf, type ActionId, type Entry, type Place } from './menu'
import { LEADS, MORE_WORDS, NOT_HERE } from './searchWords'

export interface Feature {
  id: string
  name: string
}

/** `thing` is something in the open project (a room, a level, a roof) or a project; `absent` says the app doesn't do it. */
export type ResultKind = 'area' | 'tab' | 'more' | 'command' | 'feature' | 'term' | 'thing' | 'absent'

/** Something of the person's own that search finds by its name: a room, level, roof or area in the open project, or a project. */
export interface Thing {
  type: 'room' | 'level' | 'roof' | 'area' | 'project'
  id: string
  /** The level it's on (its own id for a level). */
  level?: string
}

export interface SearchItem {
  key: string
  kind: ResultKind
  label: string
  /** Where it lives, in words. */
  where: string
  entry: Entry
  place: Place
  featureId?: string
  action?: ActionId
  run?: Entry['run']
  shortcut?: string
  /** For a `thing`: what it is, so choosing it goes to it. */
  thing?: Thing
  /** For an `absent` row: the line that says the app doesn't do it. */
  says?: string
  /** Words matched in order of strength: the label, then keywords, then the names of what it is home to. */
  tiers: string[][]
}

/** Lower case words, with punctuation and symbols dropped. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Where a command is done, when that's one tab: "Approvals › DA pack" says more than "Commands" (LF-14). */
function commandAt(entry: Entry, place: Place): string | null {
  if (place.kind !== 'home' || place.home.id !== 'commands' || !entry.at) return null
  const [a, t] = entry.at.split('/')
  const area = areaById(a)
  const tab = area && (t === 'more' ? area.more : tabOf(area, t))
  return area && tab ? `${area.label} › ${tab.label}` : null
}

/** The search index for the menu, with each feature named as features.json names it. */
export function buildIndex(features: Feature[]): SearchItem[] {
  const names = new Map(features.map(f => [f.id, f.name]))
  const out: SearchItem[] = []
  for (const { entry, place } of allPlaces()) {
    // The global homes themselves (Top bar, Keyboard…) aren't destinations; their items are.
    if (place.kind === 'home' && !place.item) continue
    // What a planning word means is a glossary entry, not somewhere to go: it lists last.
    const kind: ResultKind = place.kind === 'area' ? 'area' : place.kind === 'tab' ? 'tab' : place.kind === 'more' ? 'more' : entry.action?.startsWith('term:') ? 'term' : 'command'
    out.push({
      key: `${kind}:${place.kind === 'tab' ? place.area.id + '/' : ''}${entry.id}`,
      kind,
      label: entry.label,
      where: place.kind === 'area' ? 'Area' : (commandAt(entry, place) ?? placeName(place)),
      entry,
      place,
      action: entry.action,
      run: entry.run,
      shortcut: entry.shortcut,
      tiers: [words(entry.label), words([...(entry.keywords ?? []), ...(MORE_WORDS[entry.id] ?? [])].join(' ')), words(entry.features.map(f => names.get(f) ?? '').join(' '))],
    })
  }
  // What the app doesn't do, said plainly (./searchWords.ts): found by its words only.
  const nowhere = allPlaces().find(p => p.place.kind === 'home' && !p.place.item && p.entry.id === 'help')!
  for (const n of NOT_HERE)
    out.push({ key: `absent:${n.id}`, kind: 'absent', label: n.label, where: n.says, says: n.says, entry: { id: `absent-${n.id}`, label: n.label, features: [] }, place: nowhere.place, tiers: [[], words(n.words.join(' ')), []] })
  for (const f of features) {
    const home = homeOf(f.id)
    // Rows that only record how something is built (a debounce, a toast's timing) aren't
    // something to look for; their home still finds them by their words.
    if (!home || specOnly(f.name)) continue
    const at = home.place.kind === 'home' && home.place.item ? `${home.place.home.label} › ${home.place.item.label}` : placeName(home.place)
    out.push({
      key: `feature:${f.id}`,
      kind: 'feature',
      label: featureLabel(f.name),
      where: at,
      entry: home.entry,
      place: home.place,
      featureId: f.id,
      tiers: [words(f.name), [], []],
    })
  }
  return out
}

const cloudFeature = (id: string) => id.startsWith('cloud-')

/**
 * The index for a copy of the app with no cloud (GitHub Pages, or the Worker not running):
 * commands and features that only exist signed in (uploading projects, the recovery code, cloud
 * space…) would lead nowhere there, so they are left out. "Sign in and cloud saves" stays: chosen,
 * it says that signing in isn't available on this copy.
 */
export function withoutCloud(index: SearchItem[]): SearchItem[] {
  return index.filter(item => {
    if (item.kind === 'feature') return !cloudFeature(item.featureId ?? '')
    if (item.action === 'cloud') return true
    return !(item.entry.features.length > 0 && item.entry.features.every(cloudFeature))
  })
}

const KEYBOARD_FEATURES = new Set(['keyboard-shortcuts-overlay', 'single-key-shortcuts'])

/** The index for a touch screen: the list of keyboard shortcuts and its switch are no use without keys (PH-13). */
export function withoutKeyboard(index: SearchItem[]): SearchItem[] {
  return index.filter(item => item.action !== 'keyboard-help' && !KEYBOARD_FEATURES.has(item.featureId ?? ''))
}

/** A feature as a short row: its name without the asides in brackets, cut at a word near 60 characters. */
export function featureLabel(name: string): string {
  const plain = name.replace(/\s*\([^)]*\)?/g, '').replace(/\s+/g, ' ').trim() || name
  if (plain.length <= 60) return plain
  const cut = plain.slice(0, 60)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,:;·]$/, '')}…`
}

/** A feature row that records an implementation detail rather than something to find: a timing in ms or seconds, a debounce. */
export const specOnly = (name: string) => /\b\d+\s?(ms|s)\b|debounce/i.test(name)

const KIND_ORDER: Record<ResultKind, number> = { area: 5, tab: 4, thing: 4, command: 3, more: 2, feature: 0, absent: -1, term: -1 }

/**
 * Places and actions first, features after, words explained last: a tab found by one of its
 * words outranks a feature named with it, and a glossary entry comes after both (C35).
 */
const KIND_WEIGHT: Record<ResultKind, number> = { area: 30, tab: 30, command: 30, more: 30, thing: 30, feature: 0, absent: 0, term: -50 }

/**
 * A word without its ending, so "removal" finds "remove", "stairs" finds "stair" and "rotate"
 * finds "rotation" (LF-17). Only for words long enough to stay themselves.
 */
export function stem(w: string): string {
  if (w.length < 5) return w
  // The longest ending that still leaves four letters: "rotation" keeps "rotat", as "rotate" does.
  for (const end of ['ation', 'ing', 'ion', 'als', 'al', 'ed', 'es', 's', 'e']) if (w.endsWith(end) && w.length - end.length >= 4) return w.slice(0, -end.length)
  return w
}

/** How well an item matches, or 0. Every query word must start a word of the item, or (a little weaker) share its stem. */
function score(item: SearchItem, q: string[], phrase: string): number {
  const label = item.tiers[0].join(' ')
  if (label === phrase) return 100
  if (label.startsWith(phrase)) return 80
  const tiers = (hit: (query: string, word: string) => boolean) => {
    const has = (pool: string[]) => q.every(w => pool.some(t => hit(w, t)))
    if (has(item.tiers[0])) return 60
    if (has([...item.tiers[0], ...item.tiers[1]])) return 40
    if (has([...item.tiers[0], ...item.tiers[1], ...item.tiers[2]])) return 20
    return 0
  }
  const exact = tiers((w, t) => t.startsWith(w))
  if (exact) return exact
  // "removal" for "remove": found, just under the same words typed as they're written.
  const loose = tiers((w, t) => t.startsWith(w) || (w.length >= 5 && stem(t) === stem(w)))
  return loose ? loose - 5 : 0
}

/** The best matches for a query, best first. */
export function search(index: SearchItem[], query: string, limit = 40): SearchItem[] {
  const q = words(query)
  if (!q.length) return []
  const phrase = q.join(' ')
  const ranked = index
    .map(item => ({ item, s: score(item, q, phrase) }))
    .filter(r => r.s > 0)
    .map(r => ({ ...r, s: r.s + KIND_WEIGHT[r.item.kind] }))
    .sort((a, b) => b.s - a.s || KIND_ORDER[b.item.kind] - KIND_ORDER[a.item.kind] || a.item.label.length - b.item.label.length)
    .map(r => r.item)
  // An everyday word that means one thing above all ("print", "bedroom") has that result lead (HO-33).
  const lead = ranked.findIndex(r => r.key === LEADS[phrase])
  if (lead > 0) ranked.unshift(...ranked.splice(lead, 1))
  // What a word means comes after everything else, but always comes: a long list doesn't push it off the end.
  // So does a line that says the app doesn't do something.
  const last = (r: SearchItem) => r.kind === 'term' || r.kind === 'absent'
  const terms = [...ranked.filter(r => r.kind === 'absent').slice(0, 2), ...ranked.filter(r => r.kind === 'term').slice(0, 3)]
  return [...ranked.filter(r => !last(r)).slice(0, limit - terms.length), ...terms]
}

/** What the open project holds that search finds by name (LD-21): its rooms, levels, roofs and named areas. */
export interface ProjectThings {
  levels: { id: string; name: string }[]
  rooms: { id: string; name: string; level: string }[]
  areas: { id: string; name: string; level: string }[]
  roofs: { id: string; level: string }[]
}

/** Rows for the open project's own things, each found by its name and led to on the plan. */
export function thingItems(t: ProjectThings): SearchItem[] {
  const design = areaById('design')!
  const at = (tab: string): { entry: Entry; place: Place } => ({ entry: tabOf(design, tab)!, place: { kind: 'tab', area: design, tab: tabOf(design, tab)! } })
  const levelName = (id: string) => t.levels.find(l => l.id === id)?.name ?? 'a level'
  const row = (type: Thing['type'], id: string, level: string, label: string, where: string, tab: string, extra: string): SearchItem => ({
    key: `thing:${type}:${id}`,
    kind: 'thing',
    label,
    where,
    ...at(tab),
    thing: { type, id, level },
    tiers: [words(label), words(extra), []],
  })
  return [
    ...t.rooms.filter(r => r.name.trim()).map(r => row('room', r.id, r.level, r.name.trim(), `Room on ${levelName(r.level)}`, 'rooms', 'room')),
    ...t.areas.filter(a => a.name.trim()).map(a => row('area', a.id, a.level, a.name.trim(), `Area on ${levelName(a.level)}`, 'rooms', 'area')),
    ...t.levels.map(l => row('level', l.id, l.id, l.name, 'Level in this project', 'floors', 'level floor storey')),
    ...t.roofs.map(r => row('roof', r.id, r.level, `Roof over ${levelName(r.level)}`, 'Roof in this project', 'roofs', 'roof')),
  ]
}

/** Rows for the projects on this device, by name (search on the Projects home, LF-31). */
export function projectItems(projects: { id: string; name: string }[]): SearchItem[] {
  const home = allPlaces().find(p => p.place.kind === 'home' && !p.place.item && p.entry.id === 'projects-page')!
  return projects.map(p => ({ key: `thing:project:${p.id}`, kind: 'thing' as const, label: p.name, where: 'Project', entry: home.entry, place: home.place, thing: { type: 'project' as const, id: p.id }, tiers: [words(p.name), words('project'), []] }))
}

/** What ⌘K suggests before you type: the areas and their tabs. */
export function suggestions(index: SearchItem[]): SearchItem[] {
  return index.filter(i => i.kind === 'area' || i.kind === 'tab')
}
