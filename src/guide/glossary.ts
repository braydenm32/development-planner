// The planning and building words the app uses, each said plainly in a line or two. The guide's
// Words section lists them all; a dotted underline on a label or a key-number chip shows one on
// hover, focus or tap; and ⌘K finds each by its short and long names.
//
// The definitions are general (NSW, where the checks come from); the checks panel has the exact
// clauses.

export interface Term {
  id: string
  /** As the app writes it: "FFL". */
  short: string
  /** Its long name, when it is an abbreviation. */
  long?: string
  /** One or two plain sentences. */
  says: string
  /** Words in a label that mean this term (whole words). Leave out to match `short` alone. */
  match?: RegExp
}

export const TERMS: Term[] = [
  { id: 'ffl', short: 'FFL', long: 'Finished floor level', says: 'The height of the top of a finished floor, as an RL. The ground floor’s FFL sets how high or low the house sits on the block.', match: /\bFFL\b/ },
  { id: 'rl', short: 'RL', long: 'Reduced level', says: 'A height in metres above a fixed datum, usually AHD. Every level on a survey is an RL, so RL 45.50 is 45.5 m above it.', match: /\bRL\b/ },
  { id: 'ahd', short: 'AHD', long: 'Australian Height Datum', says: 'The datum most Australian surveys measure heights from: roughly mean sea level.', match: /\bAHD\b/ },
  { id: 'cdc', short: 'CDC', long: 'Complying development certificate', says: 'A quick approval for a house that meets fixed rules (in NSW, the Housing Code). A council or a registered certifier issues it, without a full council assessment.', match: /\bCDC\b/ },
  { id: 'da', short: 'DA', long: 'Development application', says: 'The usual council approval. The council weighs the design against its LEP and DCP, and neighbours can comment. It’s the way to go when a design doesn’t fit the CDC rules.', match: /\bDA\b/ },
  { id: 'lep', short: 'LEP', long: 'Local environmental plan', says: 'The council’s legal planning rules: zones, and limits such as building height and floor space ratio.', match: /\bLEP\b/ },
  { id: 'dcp', short: 'DCP', long: 'Development control plan', says: 'The council’s detailed guidelines for a DA: setbacks, landscaping, privacy, cut and fill and the like.', match: /\bDCP\b/ },
  { id: 'fsr', short: 'FSR', long: 'Floor space ratio', says: 'Gross floor area divided by the block’s area. A ratio of 0.5:1 on a 600 m² block allows 300 m² of floor.', match: /\bFSR\b|floor space ratio/i },
  { id: 'gfa', short: 'GFA', long: 'Gross floor area', says: 'The floor area of every storey, measured to the inside of the outside walls. The rules say what counts: one garage space, for example, often doesn’t.', match: /\bGFA\b|gross floor area/i },
  { id: 'height', short: 'Building height', says: 'The most the house rises above the natural ground under it: the ground as it was before any digging. The rules set a limit.', match: /\bbuilding height\b|\babove ground\b/i },
  { id: 'storey', short: 'Storey', says: 'A floor of the house. A split level, where floors step up the slope side by side, can still count as one storey if no floor sits over another.', match: /\bstoreys?\b/i },
  { id: 'cut-fill', short: 'Cut and fill', says: 'Cut is earth dug away to make level ground for the house; fill is earth put back to build ground up. Both are measured in cubic metres (m³).', match: /\bcut and fill\b|\bcut · fill\b|\bcut\b|\bfill\b/i },
  { id: 'out-of-balance', short: 'Out of balance', says: 'When the cut and the fill are far from equal, so earth has to be trucked away or brought in. Raising or lowering the floor can balance them.', match: /out of balance/i },
  { id: 'batter', short: 'Batter', says: 'A slope of earth left at the edge of a cut or fill instead of a wall. 2:1 means 2 m across for every 1 m up or down: the bigger the number, the gentler the slope.', match: /\bbatters?\b/i },
  { id: 'retaining-wall', short: 'Retaining wall', says: 'A wall that holds back ground that’s higher on one side. Taller ones (often over 1 m, or near a boundary) need an engineer.', match: /\bretaining walls?\b|\btallest wall\b/i },
  { id: 'setback', short: 'Setback', says: 'How far the house sits from a boundary. The rules set a least distance at the front, the sides and the rear.', match: /\bsetbacks?\b/i },
  { id: 'building-line', short: 'Building line', says: 'The line a house must sit behind, a set distance back from the front boundary. A lot’s width is measured along it.', match: /\bbuilding line\b/i },
  { id: 'battle-axe', short: 'Battle-axe lot', says: 'A block behind another, reached by a long, narrow driveway (the handle). Its setbacks are often worked out differently.', match: /\bbattle-axe\b/i },
  { id: 'landscaped', short: 'Landscaped area', says: 'The part of the block that’s planted, like lawn and garden beds, not built on or paved. The rules ask for a least share of the block.', match: /\blandscaped area\b|\blandscaped\b/i },
  { id: 'private-open-space', short: 'Private open space', says: 'An outdoor area for the house’s own use, usually out the back off the living rooms, with a least size and width.', match: /\bprivate open space\b/i },
  { id: 'tpz', short: 'TPZ', long: 'Tree protection zone', says: 'The ground round a tree to keep clear of digging and building so the tree survives: a circle about 12 times its trunk’s width.', match: /\bTPZ\b|tree protection zone/i },
  { id: 'easement', short: 'Easement', says: 'A strip of the block that someone else has a right to use, often for drains or sewer pipes. Building over one usually isn’t allowed.', match: /\beasements?\b/i },
  { id: 'basix', short: 'BASIX', says: 'The NSW sustainability index. Every new house needs a BASIX certificate setting what it must achieve for water, energy and comfort.', match: /\bBASIX\b/ },
  { id: 'contour', short: 'Contour', says: 'A line joining ground at the same level. Close together means steep; far apart means gentle.', match: /\bcontours?\b/i },
  { id: 'fall', short: 'Fall', says: 'How much the ground drops across a distance. A block that falls 3 m front to back is 3 m lower at the back.', match: /\bfall\b|\bcross-fall\b/i },
  { id: 'slab', short: 'Slab on ground', says: 'A concrete floor poured on a level pad of ground. On a slope, the pad is made by cutting and filling.', match: /\bslab\b/i },
  { id: 'piers', short: 'Piers', says: 'Posts or footings that hold a framed floor up off the ground, so the ground under it can stay as it is.', match: /\bpiers\b/i },
]

/** Words a field label explains by itself; everyday words (cut, fill, slab) only where asked. */
export const LABEL_TERMS = ['ffl', 'rl', 'ahd', 'cdc', 'da', 'lep', 'dcp', 'fsr', 'gfa', 'batter', 'setback', 'building-line', 'battle-axe', 'landscaped', 'private-open-space', 'tpz', 'easement', 'basix']

const BY_ID = new Map(TERMS.map(t => [t.id, t]))

export const termById = (id: string): Term | undefined => BY_ID.get(id)

/** "FFL: finished floor level" or "Batter". */
export const termTitle = (t: Term): string => (t.long ? `${t.short}: ${t.long.toLowerCase()}` : t.short)

/**
 * The first term a label mentions, and where: "Floor level (FFL)" finds FFL. Earlier in the
 * label wins, then the longer match, so "Ground behind the wall, finished RL" finds RL, and
 * "Holds back up to" finds nothing.
 */
export function findTerm(text: string, only?: string[]): { term: Term; start: number; end: number } | null {
  let best: { term: Term; start: number; end: number } | null = null
  for (const term of TERMS) {
    if (only && !only.includes(term.id)) continue
    const m = (term.match ?? new RegExp(`\\b${term.short}\\b`)).exec(text)
    if (!m) continue
    const start = m.index
    const end = start + m[0].length
    if (!best || start < best.start || (start === best.start && end - start > best.end - best.start)) best = { term, start, end }
  }
  return best
}
