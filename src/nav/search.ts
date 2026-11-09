// ⌘K search over the menu: every area, tab, More item and command by its name and plain
// words, and every feature (features.json) by its name, each leading to its home. Places and
// actions rank first, then features (by a short label), then what a word means (C35).

import { allPlaces, homeOf, placeName, type ActionId, type Entry, type Place } from './menu'

export interface Feature {
  id: string
  name: string
}

export type ResultKind = 'area' | 'tab' | 'more' | 'command' | 'feature' | 'term'

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
      where: place.kind === 'area' ? 'Area' : placeName(place),
      entry,
      place,
      action: entry.action,
      run: entry.run,
      shortcut: entry.shortcut,
      tiers: [words(entry.label), words((entry.keywords ?? []).join(' ')), words(entry.features.map(f => names.get(f) ?? '').join(' '))],
    })
  }
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

/** A feature as a short row: its name without the asides in brackets, cut at a word near 60 characters. */
export function featureLabel(name: string): string {
  const plain = name.replace(/\s*\([^)]*\)?/g, '').replace(/\s+/g, ' ').trim() || name
  if (plain.length <= 60) return plain
  const cut = plain.slice(0, 60)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,:;·]$/, '')}…`
}

/** A feature row that records an implementation detail rather than something to find: a timing in ms or seconds, a debounce. */
export const specOnly = (name: string) => /\b\d+\s?(ms|s)\b|debounce/i.test(name)

const KIND_ORDER: Record<ResultKind, number> = { area: 5, tab: 4, command: 3, more: 2, feature: 0, term: -1 }

/**
 * Places and actions first, features after, words explained last: a tab found by one of its
 * words outranks a feature named with it, and a glossary entry comes after both (C35).
 */
const KIND_WEIGHT: Record<ResultKind, number> = { area: 30, tab: 30, command: 30, more: 30, feature: 0, term: -50 }

/** How well an item matches, or 0. Every query word must start a word of the item. */
function score(item: SearchItem, q: string[], phrase: string): number {
  const label = item.tiers[0].join(' ')
  if (label === phrase) return 100
  if (label.startsWith(phrase)) return 80
  const has = (pool: string[]) => q.every(w => pool.some(t => t.startsWith(w)))
  if (has(item.tiers[0])) return 60
  if (has([...item.tiers[0], ...item.tiers[1]])) return 40
  if (has([...item.tiers[0], ...item.tiers[1], ...item.tiers[2]])) return 20
  return 0
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
  // What a word means comes after everything else, but always comes: a long list doesn't push it off the end.
  const terms = ranked.filter(r => r.kind === 'term').slice(0, 3)
  return [...ranked.filter(r => r.kind !== 'term').slice(0, limit - terms.length), ...terms]
}

/** What ⌘K suggests before you type: the areas and their tabs. */
export function suggestions(index: SearchItem[]): SearchItem[] {
  return index.filter(i => i.kind === 'area' || i.kind === 'tab')
}
