// ⌘K search over the menu: every area, tab, More item and command by its name and plain
// words, and every feature (features.json) by its name, each leading to its home.

import { allPlaces, homeOf, placeName, type ActionId, type Entry, type Place } from './menu'

export interface Feature {
  id: string
  name: string
}

export type ResultKind = 'area' | 'tab' | 'more' | 'command' | 'feature'

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
    const kind: ResultKind = place.kind === 'area' ? 'area' : place.kind === 'tab' ? 'tab' : place.kind === 'more' ? 'more' : 'command'
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
    if (!home) continue
    const at = home.place.kind === 'home' && home.place.item ? `${home.place.home.label} › ${home.place.item.label}` : placeName(home.place)
    out.push({
      key: `feature:${f.id}`,
      kind: 'feature',
      label: f.name,
      where: at,
      entry: home.entry,
      place: home.place,
      featureId: f.id,
      tiers: [words(f.name), [], []],
    })
  }
  return out
}

const KIND_ORDER: Record<ResultKind, number> = { area: 5, tab: 4, command: 3, more: 2, feature: 0 }

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
  return index
    .map(item => ({ item, s: score(item, q, phrase) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s || KIND_ORDER[b.item.kind] - KIND_ORDER[a.item.kind] || a.item.label.length - b.item.label.length)
    .slice(0, limit)
    .map(r => r.item)
}

/** What ⌘K suggests before you type: the areas and their tabs. */
export function suggestions(index: SearchItem[]): SearchItem[] {
  return index.filter(i => i.kind === 'area' || i.kind === 'tab')
}
