// Finding a piece of furniture by typing: its name, its room, or another word people use for it.

import { CATALOG, FURNITURE_GROUPS, type CatalogItem } from './furnitureCatalog'

/** Other words for a piece, by catalogue key: what people type when the catalogue calls it something else. */
const ALSO: Record<string, string> = {
  'bed-single': 'kids bed',
  'bed-king-single': 'kids bed',
  bedside: 'nightstand side table',
  wardrobe: 'robe closet cupboard storage built-in',
  'sofa-2': 'couch lounge settee loveseat',
  'sofa-3': 'couch lounge settee',
  armchair: 'chair recliner',
  'tv-unit': 'television telly entertainment unit',
  bench: 'kitchen bench counter worktop cabinets cupboards',
  island: 'kitchen island counter',
  fridge: 'refrigerator freezer',
  cooktop: 'stove oven hob range hotplate',
  sink: 'kitchen sink basin',
  dishwasher: 'dish washer',
  washer: 'washing machine laundry',
  dryer: 'tumble dryer clothes dryer',
  tub: 'trough laundry sink',
  toilet: 'wc loo lavatory',
  vanity: 'basin sink bathroom cabinet',
  shower: 'shower recess',
  bath: 'bathtub tub',
  desk: 'study table office',
  'desk-chair': 'office chair',
  car: 'vehicle parking garage ute',
  'outdoor-table': 'patio table deck alfresco',
  bbq: 'barbecue barbeque grill',
  box: 'custom anything other pantry linen cupboard storage shelf shelves tank water tank clothesline pool spa shed piano',
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** What a piece is found by: its name, its room's name and its other words. */
function haystack(c: CatalogItem): string[] {
  const group = FURNITURE_GROUPS.find(g => g.id === c.group)?.label ?? ''
  return words(`${c.name} ${group} ${ALSO[c.key] ?? ''}`)
}

/**
 * The catalogue's pieces that match what was typed: every word typed has to start a word of the
 * piece's name, room or other words ("que bed", "couch", "bath"). Pieces whose own name matches
 * come first; the rest stay in catalogue order. Everything, for nothing typed.
 */
export function searchCatalog(query: string): CatalogItem[] {
  const q = words(query)
  if (!q.length) return [...CATALOG]
  const hits = CATALOG.filter(c => {
    const hay = haystack(c)
    return q.every(w => hay.some(h => h.startsWith(w)))
  })
  const inName = (c: CatalogItem) => q.every(w => words(c.name).some(h => h.startsWith(w)))
  return [...hits.filter(inName), ...hits.filter(c => !inName(c))]
}
