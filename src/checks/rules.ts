// The rules, one list per approval pathway. Every number and clause comes from the research
// in docs/research (compliance-and-swept-path-sources.md and the councils folder), with the
// same marks for how sure it is. The Housing Code is state-wide and lives here; each council's
// LEP and DCP numbers are a data table in ./councils that the DA checks below read. Nothing here
// is legal advice.

import type { Vec2 } from '../lib/geom'
import type { Edge, Measures } from './measure'
import { encroachment, MINOR_ENCROACHMENT } from './trees'
import { activeCouncil, COUNCIL_TABLES } from './councils'
import {
  CONTROLS,
  type AreaBand,
  type ControlKey,
  type Council,
  type CoverageRule,
  type CutFillRule,
  type FrontRule,
  type LandscapedRule,
  type RuleSource,
  type SetbackRule,
} from './councils/types'
import { WOLLONGONG } from './councils/wollongong'
import { crossingChecks } from './crossing'
import { overRuns, overText, roomsText, STUDY_FROM, STUDY_TO } from '../sun/facts'
import { hourText } from '../sun/solar'
import type { CheckResult, CheckStatus, CouncilId, Pathway, Source } from './types'

const m = (v: number) => `${v.toFixed(2)} m`
const m2 = (v: number) => `${v.toFixed(1)} m²`
const pct = (v: number) => `${Math.round(v * 100)}%`

// Sources, as the research marks them.
/** Housing Code clauses read in the official text as at 29 Aug 2025 (an export from the NSW legislation site). */
const HC = (clause: string): Source => ({ clause: `Housing Code ${clause}`, confidence: 'read', asAt: 'NSW legislation, as at 29 Aug 2025' })
/** Housing Code tables: the 2025 export drops its tables, so their numbers are still from AustLII's July 2024 copy. */
const HC_TABLE = (clause: string): Source => ({ clause: `Housing Code ${clause} (table)`, confidence: 'read', asAt: 'table from AustLII, as at 5 Jul 2024; text as at 29 Aug 2025' })

/** Housing Code cl 3.33(1): a CDC covers removing a tree under this height (m) within 3 m of a building over 25 m². */
export const CDC_REMOVABLE_HEIGHT = 8
/** A council rule's source as a finding shows it: the instrument's cite and the clause, how sure, and the version read. */
const cite = (c: Council, r: RuleSource, after = ''): Source => ({ clause: `${c.instruments[r.in].cite} ${r.clause}${after}`, confidence: r.sure, asAt: r.version ?? c.instruments[r.in].version })

// ---------------------------------------------------------------------------
// Tables

/** Housing Code cl 3.9: maximum gross floor area of all buildings by lot area. */
export function hcMaxGfa(area: number): number {
  if (area <= 250) return 0.78 * area
  if (area <= 300) return 0.75 * area
  if (area <= 350) return 235
  if (area <= 450) return 0.25 * area + 150
  if (area <= 560) return 290
  if (area <= 600) return 0.25 * area + 150
  if (area <= 740) return 335
  if (area <= 900) return 0.25 * area + 150
  if (area <= 920) return 380
  if (area <= 1000) return 0.25 * area + 150
  return 400
}

/** Housing Code cl 3.13: minimum landscaped area as a share of the lot. */
export function hcLandscapedShare(area: number): number {
  if (area <= 300) return 0.1
  if (area <= 450) return 0.15
  if (area <= 600) return 0.2
  if (area <= 900) return 0.3
  if (area <= 1500) return 0.4
  return 0.45
}

/** Housing Code cl 3.10: minimum side setback by lot width at the building line and building height. */
export function hcSideSetback(width: number, height: number): number {
  if (width <= 10) return height <= 5.5 ? 0.9 : 0.9 + (height - 5.5) / 4
  if (width <= 18) return height <= 4.5 ? 0.9 : 0.9 + (height - 4.5) / 4
  if (width <= 24) return height <= 4.5 ? 1.5 : 1.5 + (height - 4.5) / 4
  return 2.5
}

/** Housing Code cl 3.10: minimum rear setback for a lot of this area, up to 4.5 m high and above it. */
export function hcRearSetback(area: number): [number, number] {
  if (area <= 300) return [3, 10]
  if (area <= 900) return [3, 8]
  if (area <= 1500) return [5, 12]
  return [10, 15]
}

/** Housing Code cl 3.10: primary road setback when there aren't two houses within 40 m to average. */
export function hcRoadSetback(area: number): number {
  if (area <= 300) return 3
  if (area <= 900) return 4.5
  if (area <= 1500) return 6.5
  return 10
}

/** The band of a council's table an area falls in. */
export function bandOf<T>(bands: AreaBand<T>[], area: number): T {
  const b = bands.find(b => (b.below !== undefined ? area < b.below : b.upTo !== undefined ? area <= b.upTo : true))
  return (b ?? bands[bands.length - 1]).value
}

/** A council's maximum site coverage, as a share, for a site area. */
export const coverageShare = (r: CoverageRule, area: number) => bandOf(r.bands, area)

/** A council's minimum landscaped area (m²) for a site area. */
export function landscapedNeed(r: LandscapedRule, area: number): number {
  const { base, share, over } = bandOf(r.bands, area)
  return base + share * (area - over)
}

/** Wollongong DCP B1 4.4.2(2): maximum site coverage by site area (from Wollongong's table). */
export const dcpCoverage = (area: number) => coverageShare(WOLLONGONG.coverage!, area)

/** Wollongong DCP B1 4.5.2(2): minimum landscaped area (m²) by site area (from Wollongong's table). */
export const dcpLandscaped = (area: number) => landscapedNeed(WOLLONGONG.landscaped!, area)

/** Narrowest width of a lot outline: the smallest of its widths measured square to each edge. */
export function minWidth(ring: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9) continue
    const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]
    let lo = Infinity
    let hi = -Infinity
    for (const p of ring) {
      const d = (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    best = Math.min(best, hi - lo)
  }
  return best
}

// ---------------------------------------------------------------------------
// Helpers

const front = (ms: Measures) => ms.edges.find(e => e.role === 'front')
const rear = (ms: Measures) => ms.edges.find(e => e.role === 'rear')
const sides = (ms: Measures) => ms.edges.filter(e => e.role === 'side')
const minClear = (es: Edge[], upper = false) => {
  const ds = es.map(e => (upper ? e.upperClearance : e.clearance)).filter((d): d is number => d !== null)
  return ds.length ? Math.min(...ds) : null
}
const closest = (es: Edge[]) => es.reduce<Edge | null>((b, e) => (e.clearance !== null && (!b || e.clearance < (b.clearance ?? Infinity)) ? e : b), null)
const NEED_FRONT = 'Pick the side that faces the lot in front (or the street) under Lot facts, and this can be checked.'
/** A distance to the boundary, or how far over it the house goes: "1.20 m", "0.40 m over". */
const dist = (d: number) => (d >= 0 ? m(d) : `${m(-d)} over`)
/** "1.20 m to the west side", or "0.40 m over the west side" where the house goes past it. */
const toEdge = (d: number, e: Edge | null | undefined) => `${dist(d)}${d >= 0 ? ' to' : ''} the ${e?.label.toLowerCase()}`

/** Pass when `value` is at least `min` (or at most, with `max`). */
/** "1 storey", or "1 storey (2 levels)" when some levels sit beside each other rather than stacked. */
const storeysText = (ms: Measures) =>
  `${ms.storeys} storey${ms.storeys === 1 ? '' : 's'}${ms.levels > ms.storeys ? ` (${ms.levels} levels)` : ''}`
const STOREYS_NOTE =
  'Counts the levels stacked over any one point, so split levels side by side on a slope are one storey. A basement counts as a storey; the upper floor is the levels that sit over a lower one.'

const atLeast = (value: number, min: number): CheckStatus => (value + 1e-6 >= min ? 'pass' : 'fail')
const atMost = (value: number, max: number): CheckStatus => (value <= max + 1e-6 ? 'pass' : 'fail')

/** The lot width readings in play: the width set under Lot facts, or both edge lengths when it isn't. */
function lotWidths(ms: Measures): { width: number; label: string }[] {
  const f = front(ms)
  if (!f) return []
  const sideLen = Math.max(0, ...sides(ms).map(e => e.length))
  const along = { width: f.length, label: `${m(f.length)} along the front` }
  const across = { width: sideLen, label: `${m(sideLen)} along the sides` }
  const w = ms.settings.lotWidth
  if (w !== undefined && w > 0) return [{ width: w, label: `${m(w)} wide at the building line` }]
  return [along, across]
}

// ---------------------------------------------------------------------------
// Trees, on both pathways

/** Housing Code cl 3.33(2): development at least this far from a protected tree's trunk (m). */
export const CDC_TREE_SETBACK = 3

/** Whether a CDC itself covers removing a tree (cl 3.33(1)), in words. */
function cdcRemoval(height: number | undefined, toHouse: number | null): string {
  const near = toHouse !== null && toHouse <= 3
  const short = height !== undefined && height < CDC_REMOVABLE_HEIGHT
  if (near && short) return `The CDC covers removing it: it’s under ${CDC_REMOVABLE_HEIGHT} m tall and within 3 m of the house (cl 3.33(1)), unless it’s on council’s significant tree register.`
  const why = [
    height === undefined ? 'its height isn’t known' : !short ? `it’s ${height} m tall (the CDC covers trees under ${CDC_REMOVABLE_HEIGHT} m)` : '',
    toHouse === null ? '' : !near ? `it’s ${m(toHouse)} from the house (the CDC covers trees within 3 m)` : '',
  ].filter(Boolean)
  return `The CDC doesn’t cover removing it: ${why.join(' and ')} (cl 3.33(1)). It needs council’s approval, and council says permits aren’t for development, so in practice a DA (E17 8.3, 11.4).`
}

/** A council's note with {name} filled in from `vars`. */
const fill = (note: string, vars: Record<string, string>) => note.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all)

/** The trees, on the CDC route, or on the DA route by the rules in council `c`'s table. */
function treeChecks(ms: Measures, pathway: Pathway, c?: Council): CheckResult[] {
  // On the DA route the council's table says how trees are treated; without it there's nothing to check them against.
  const da = pathway === 'da' && c?.trees ? { c, rule: c.trees } : null
  if (pathway === 'da' && !da) return []
  return ms.trees.map(t => {
    const e = encroachment(t, ms)
    const id = `tree:${t.id}`
    const title = `${t.neighbour ? 'Neighbour’s tree' : 'Tree'}${t.label ? ` ${t.label}` : ''}`
    if (t.remove && !t.neighbour) {
      const r = da?.rule.removal
      const near = r !== undefined && e.toHouse !== null && e.toHouse <= r.within
      const note = r ? fill(near ? r.near : r.far, { toHouse: e.toHouse === null ? '' : m(e.toHouse), within: `${r.within}` }) : cdcRemoval(t.height, e.toHouse)
      return {
        id,
        title,
        tree: t.id,
        removable: true,
        status: 'pending',
        value: 'Marked for removal (pending DA or CDC)',
        note,
        source: da ? cite(da.c, da.rule.removal.source) : HC('cl 3.33(1)'),
      }
    }
    const minor = da ? da.rule.zone.minor : MINOR_ENCROACHMENT
    const zoneStatus: CheckStatus = e.share === 0 ? 'pass' : e.inSrz || e.share > minor ? 'fail' : 'warn'
    const zone = `${m(e.tpz)} protection zone`
    if (!da) {
      // The Housing Code's own rule is 3 m from the trunk; AS 4970's zone isn't a Housing Code standard, so it only warns.
      const close = e.toHouse !== null && e.toHouse < CDC_TREE_SETBACK
      const status: CheckStatus = close ? 'fail' : zoneStatus === 'pass' ? 'pass' : 'warn'
      return {
        id,
        title,
        tree: t.id,
        removable: !t.neighbour,
        status,
        value: `${e.toHouse === null ? 'No house yet' : `${m(e.toHouse)} from the house`}; ${e.share === 0 ? `clear of its ${zone}` : `${pct(e.share)} of its ${zone}`}`,
        limit: `${m(CDC_TREE_SETBACK)} from the trunk`,
        note: close
          ? 'The house must be at least 3 m from every protected tree on the lot or next door. Driveways, paths and paving may come closer if they cut or fill no more than 150 mm.'
          : e.share > 0
            ? 'Clear of the 3 m, but inside the tree’s AS 4970 protection zone: expect the arborist to ask for protection or a design change.'
            : undefined,
        source: HC('cl 3.33(2), (3)'),
      }
    }
    const status = zoneStatus
    return {
      id,
      title,
      tree: t.id,
      removable: !t.neighbour,
      status,
      value: e.share === 0 ? `Clear of its ${zone}` : `${pct(e.share)} of its ${zone}${e.inSrz ? ', and into its root zone' : ''}`,
      limit: `Up to ${pct(minor)}, and none in the ${m(e.srz)} root zone`,
      note:
        status === 'pass'
          ? undefined
          : status === 'warn'
            ? 'A minor encroachment: the arborist report has to show the tree stays viable.'
            : t.neighbour
              ? 'More than a minor encroachment needs root investigation by an AQF level 5 arborist or a design change. It’s the neighbour’s tree, so removing it is theirs to apply for, not yours.'
              : 'More than a minor encroachment needs root investigation by an AQF level 5 arborist, a design change, or the tree marked for removal.',
      source: cite(da.c, da.rule.zone.source),
    }
  })
}

// ---------------------------------------------------------------------------
// Sun on 21 June (src/sun): what the shadow does to the neighbours, and the sun your own
// living areas get, which no rule here sets a number for.

const DAY = `${hourText(STUDY_FROM)} and ${hourText(STUDY_TO)} on 21 June`

/** A council's rule for the neighbours' winter sun, and the shadow diagrams it asks for (Wollongong DCP B1 4.7.2). */
function neighbourSun(ms: Measures, c: Council): CheckResult[] {
  const rule = c.sun
  if (!rule) return []
  const out: CheckResult[] = []
  const f = ms.sun
  if (f && ms.hasHouse && !f.empty) {
    const over = overRuns(f.over).length > 0
    out.push({
      id: 'da-sun-neighbours',
      title: 'Sun to the neighbours',
      status: over ? 'warn' : 'pass',
      value: overText(f),
      limit: `Neighbours’ living room windows keep ${num(rule.hours)} hours of continuous sun, and at least half their private open space ${num(rule.hours)} hours, between ${DAY}`,
      note: over
        ? `The app knows where the shadow falls next door, not where the neighbours’ windows and open space are. Use the shadow diagram (in the PDF plans) to show they keep ${num(rule.hours)} hours, or ask council how it reads the rule where they had less already.`
        : 'The shadow never reaches next door between 9 am and 3 pm, so the house can’t take the neighbours’ sun. Trees, fences and their own house aren’t counted.',
      source: cite(c, rule.source),
    })
  }
  if (rule.diagrams) {
    out.push({
      id: 'da-shadow-diagrams',
      title: 'Shadow diagrams',
      status: 'info',
      value: ms.storeys > 1 ? 'Needed: the house is two storeys' : 'Asked for two-storey houses; this one is single storey',
      limit: 'Shadows at 9 am, 12 pm and 3 pm on 21 June',
      note: 'The PDF plans (Share › Plans) include a shadow diagram sheet at those times.',
      source: cite(c, rule.diagrams),
    })
  }
  return out
}

/** The winter sun on the living areas' windows, for information on either pathway. */
function livingSun(ms: Measures, pathway: Pathway, c?: Council): CheckResult[] {
  const rooms = ms.sun?.rooms ?? []
  if (!rooms.length) return []
  const whose = c ? (c.name.endsWith('s') ? `${c.name}’` : `${c.name}’s`) : ''
  return [
    {
      id: 'sun-living',
      title: 'Winter sun to your living areas',
      status: 'info',
      value: `${roomsText(rooms)} of sun on the windows between ${DAY}`,
      note:
        'For your information: the hours when at least one window has sun on half its glass or more. It counts windows (not glass doors), the house itself and the ground, not trees, fences or the neighbours’ houses. ' +
        (pathway === 'cdc'
          ? 'The Housing Code has no sun standard for your own house.'
          : c?.sun
            ? `${whose} sun rule (${c.sun.source.clause}) is about the neighbours’ sun.`
            : `${whose} rules in the app have no sun standard for your own house.`),
      source: { clause: 'No rule for a house’s own winter sun in the research notes (Housing Code, council DCPs)', confidence: 'unverified', asAt: 'research notes, Nov 2026' },
    },
  ]
}

// ---------------------------------------------------------------------------
// Housing Code (CDC)

function housingCode(ms: Measures): CheckResult[] {
  const out: CheckResult[] = []
  const s = ms.settings
  const area = ms.lotArea
  const H = ms.height

  if (s.battleAxe) {
    const w = minWidth(ms.edges.map(e => e.a))
    out.push({
      id: 'hc-lot-shape',
      title: 'Battle-axe lot at least 12 × 12 m',
      status: atLeast(w, 12),
      value: `Narrowest ${m(w)}, handle left out`,
      limit: '12 m × 12 m, and an access handle at least 3 m wide',
      note: 'The handle’s width isn’t on the survey boundary; check it on the survey plan.',
      source: HC('cl 3.1(3)(f)'),
    })
  }

  const gfa = hcMaxGfa(area)
  out.push({
    id: 'hc-gfa',
    title: 'Gross floor area',
    // Over the limit to the outside of the walls, the rooms decide it: with none drawn, it can't be told.
    status: !ms.hasHouse || ms.grossArea <= gfa ? 'pass' : !ms.hasRooms ? 'incomplete' : ms.roomsArea <= gfa ? 'warn' : 'fail',
    value: !ms.hasHouse
      ? 'No floors yet'
      : !ms.hasRooms && ms.grossArea > gfa
        ? `${m2(ms.grossArea)} to the outside of the walls. ${DRAW.rooms}`
        : `${m2(ms.grossArea)} to the outside of the walls${ms.hasRooms ? ` (rooms ${m2(ms.roomsArea)})` : ''}`,
    limit: `${m2(gfa)} on a ${m2(area)} lot`,
    note: 'Gross floor area is measured to the inside of the outside walls, so the true figure sits between the rooms and the outside of the walls. One garage space up to 18 m² doesn’t count. Check the table against the current text.',
    source: HC_TABLE('cl 3.9'),
  })

  out.push({
    id: 'hc-height',
    title: 'Building height',
    status: !ms.hasHouse ? 'pass' : atMost(H, 8.5),
    value: ms.hasHouse ? `${m(H)} above existing ground` : undefined,
    limit: '8.5 m',
    note: 'Measured straight down to the natural ground at the roof’s corners and ridges and the tops of the walls.',
    source: HC('cl 3.8'),
  })

  out.push({
    id: 'hc-storeys',
    title: 'Storeys',
    status: atMost(ms.storeys, 2),
    value: storeysText(ms),
    limit: '2 at any point',
    note: STOREYS_NOTE,
    source: HC('cl 3.1(1)(a), (2)'),
  })

  const f = front(ms)
  if (s.battleAxe) {
    out.push({
      id: 'hc-front',
      title: 'Setback from the lot in front',
      status: !f ? 'unknown' : f.clearance === null ? 'pass' : atLeast(f.clearance, 3),
      value: f ? (f.clearance === null ? 'No house yet' : toEdge(f.clearance, f)) : undefined,
      limit: '3 m from the rear boundary of the lot in front',
      note: f ? undefined : NEED_FRONT,
      source: HC('cl 3.10(15)'),
    })
  } else {
    const need = hcRoadSetback(area)
    out.push({
      id: 'hc-front',
      title: 'Front setback',
      // Short of the fallback only warns (the neighbours may allow it), but over the front boundary fails.
      status: !f ? 'unknown' : f.clearance === null ? 'pass' : f.clearance + 1e-6 >= need ? 'pass' : f.clearance < 0 ? 'fail' : 'warn',
      value: f && f.clearance !== null ? toEdge(f.clearance, f) : undefined,
      limit: `The average of the two nearest houses within 40 m, else ${m(need)}`,
      note: f ? 'The neighbours’ setbacks aren’t known, so this uses the fallback distance.' : NEED_FRONT,
      source: HC_TABLE('cl 3.10(1), (3)'),
    })
  }

  // Side setbacks, by lot width. With the width reading unknown, both readings are shown.
  const widths = lotWidths(ms)
  const sideEdges = sides(ms)
  const sideMin = minClear(sideEdges)
  if (!f) {
    out.push({ id: 'hc-side', title: 'Side setbacks', status: 'unknown', note: NEED_FRONT, source: HC_TABLE('cl 3.10(4)') })
  } else {
    const needs = widths.map(w => ({ ...w, need: hcSideSetback(w.width, H) }))
    const hi = Math.max(...needs.map(n => n.need))
    const lo = Math.min(...needs.map(n => n.need))
    const c = closest(sideEdges)
    out.push({
      id: 'hc-side',
      title: 'Side setbacks',
      status: sideMin === null ? 'pass' : sideMin + 1e-6 >= hi ? 'pass' : sideMin + 1e-6 >= lo ? 'warn' : 'fail',
      value: sideMin === null ? 'No house yet' : toEdge(sideMin, c),
      limit: needs.map(n => `${m(n.need)} if the lot is ${n.label}`).join('; '),
      note:
        needs.length > 1
          ? 'How the lot width at the building line is read on a battle-axe lot isn’t confirmed; enter the width under Lot facts to settle it. Uses the house’s tallest point.'
          : 'Uses the house’s tallest point, so a lower wall may need less.',
      source: HC_TABLE('cl 3.10(4)'),
    })
  }

  const r = rear(ms)
  const [rearLow, rearHigh] = hcRearSetback(area)
  if (!r) {
    out.push({ id: 'hc-rear', title: 'Rear setback', status: 'unknown', note: NEED_FRONT, source: HC_TABLE('cl 3.10(10)') })
  } else {
    const twoStorey = ms.storeys > 1
    const low = r.clearance
    const high = twoStorey ? r.upperClearance : H > 4.5 ? r.clearance : null
    const ok = (low === null || low + 1e-6 >= rearLow) && (high === null || high + 1e-6 >= rearHigh)
    out.push({
      id: 'hc-rear',
      title: 'Rear setback',
      status: low === null ? 'pass' : ok ? 'pass' : 'fail',
      value: low === null ? 'No house yet' : `${toEdge(low, r)}${twoStorey && high !== null ? `, upper floor ${dist(high)}` : ''}`,
      limit: `${m(rearLow)} up to 4.5 m high, ${m(rearHigh)} above`,
      note:
        (s.battleAxe ? 'A battle-axe lot’s rear boundary is the one opposite the side the house faces (cl 3.3(2)). ' : '') +
        (twoStorey ? 'Takes the upper floor as the part over 4.5 m high.' : H > 4.5 ? 'The house rises over 4.5 m above the ground, so the whole of it is held to the higher setback.' : ''),
      source: HC_TABLE('cl 3.10(10)'),
    })
  }

  const landNeed = hcLandscapedShare(area) * area
  const land = area - ms.hardArea
  out.push({
    id: 'hc-landscaped',
    title: 'Landscaped area',
    status: atLeast(land, landNeed),
    value: `About ${m2(land)} (${pct(land / area)})`,
    limit: `${m2(landNeed)} (${pct(hcLandscapedShare(area))}), half behind the building line`,
    note: 'Everything outside the house, slabs, driveways and decks counts here. Strips under 1.5 m wide and the split either side of the building line aren’t checked yet.',
    source: HC_TABLE('cl 3.13'),
  })

  const e = ms.earth
  out.push({
    id: 'hc-cut',
    title: 'Depth of cut',
    status: !e ? 'pass' : e.cutNear <= 1 + 1e-6 && e.cutMid <= 2 + 1e-6 && e.cutFar <= 3 + 1e-6 ? 'pass' : 'fail',
    value: e ? `${m(e.cutNear)} within 1 m of the boundary, ${m(e.cutMid)} at 1 to 1.5 m, ${m(e.cutFar)} beyond` : 'No cut and fill',
    limit: '1 m, 2 m and 3 m',
    note: 'Measured on the levelled ground, so pier holes don’t count (since the Oct 2024 update they’re left out where an engineer supports them). Limited to 1 m on class 3 or 4 acid sulfate soils or within 40 m of a natural waterbody (not looked up yet).',
    source: HC('cl 3.30'),
  })
  out.push({
    id: 'hc-fill',
    title: 'Fill outside the house',
    status: !e ? 'pass' : atMost(e.fillOutside, 1),
    value: e ? `${m(e.fillOutside)} at most` : 'No cut and fill',
    limit: '1 m above existing ground',
    note: 'No limit under the house itself. Fill over 150 mm can cover at most half the landscaped area (not checked yet).',
    source: HC('cl 3.30'),
  })
  out.push({
    id: 'hc-works-boundary',
    title: 'Earthworks clear of the boundary',
    status: !e || e.closestWorks === null ? 'pass' : e.closestWorks > 1 ? 'pass' : 'fail',
    value: e && e.closestWorks !== null ? `Closest ${m(e.closestWorks)} from the boundary` : 'No cut and fill',
    limit: 'Toe or top of each embankment more than 1 m from side and rear boundaries',
    source: HC('cl 3.30'),
  })
  const tall = ms.walls.filter(w => w.height > 0.6)
  out.push({
    id: 'hc-retaining',
    title: 'Retaining walls',
    status: tall.length ? 'warn' : 'pass',
    value: ms.walls.length ? `Tallest holds back ${m(Math.max(...ms.walls.map(w => w.height)))}` : 'None',
    limit: 'Over 600 mm needs a professional engineer’s certificate; walls at least 2 m apart, no taller than the cut or fill they hold',
    note: tall.length ? `${tall.length} wall${tall.length > 1 ? 's' : ''} over 600 mm: allowed with an engineer’s certificate.` : undefined,
    source: HC('cl 3.30'),
  })

  return [lotCheck(ms), ...out, ...livingSun(ms, 'cdc'), ...treeChecks(ms, 'cdc')]
}

// ---------------------------------------------------------------------------
// A council's LEP and DCP (DA), from its data table in ./councils

/** A small number as the limits write it: 6, 5.5, 0.9. */
const num = (v: number) => `${v}`
/** A height as the limits write it: 600 mm, 1 m. */
const len = (v: number) => (v < 1 ? `${Math.round(v * 1000)} mm` : `${v} m`)
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five']
const word = (n: number) => WORDS[n] ?? `${n}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The setback a rule asks for from a house this high (m). */
function setbackNeed(r: SetbackRule, H: number): number {
  const t = r.tall
  if (!t || H <= t.over) return r.min
  return t.perMetre !== undefined ? r.min + t.perMetre * (H - t.over) : (t.min ?? r.min)
}

/** What a setback rule allows, in words. */
function setbackLimit(r: SetbackRule): string {
  if (r.upper !== undefined) return `${num(r.min)} m for single-storey parts, ${num(r.upper)} m for two-storey parts`
  const t = r.tall
  if (!t) return `${num(r.min)} m to walls`
  if (t.perMetre !== undefined) return `${num(r.min)} m to walls up to ${num(t.over)} m high, plus ${t.perMetre === 0.25 ? 'a quarter' : pct(t.perMetre)} of the height above ${num(t.over)} m`
  return `${num(r.min)} m to walls; ${num(t.min ?? r.min)} m where walls are over ${num(t.over)} m high`
}

/** Why a taller house is held to more. */
const tallNote = (r: SetbackRule) =>
  r.tall?.perMetre !== undefined
    ? 'Uses the house’s tallest point, so a lower wall may need less.'
    : `The house rises over ${num(r.tall!.over)} m, so this uses ${num(r.tall!.min ?? r.min)} m throughout; lower walls may need less.`

/** A setback from one kind of boundary (the sides, or the rear), which needs the front picked to tell them apart. */
function setbackCheck(ms: Measures, c: Council, r: SetbackRule, id: string, title: string, es: Edge[]): CheckResult {
  if (!front(ms) || !es.length) return { id, title, status: 'unknown', limit: setbackLimit(r), note: NEED_FRONT, source: cite(c, r.source) }
  const need = setbackNeed(r, ms.height)
  const low = minClear(es)
  const high = r.upper !== undefined ? minClear(es, true) : null
  const near = closest(es)
  const ok = (low === null || low + 1e-6 >= need) && (high === null || high + 1e-6 >= r.upper!)
  return {
    id,
    title,
    status: low === null ? 'pass' : ok ? 'pass' : 'fail',
    value: low === null ? 'No house yet' : `${toEdge(low, near)}${high !== null ? `, upper floor ${dist(high)}` : ''}`,
    limit: setbackLimit(r),
    note: [need > r.min ? tallNote(r) : '', r.note ?? ''].filter(Boolean).join(' ') || undefined,
    source: cite(c, r.source),
  }
}

/** The front setback, by the band of site area the lot is in, or from the lot in front on a battle-axe lot. */
function frontCheck(ms: Measures, c: Council, fr: FrontRule, f: Edge | undefined): CheckResult {
  const s = ms.settings
  const at = f && f.clearance !== null ? toEdge(f.clearance, f) : undefined
  const ba = fr.battleAxe
  if (s.battleAxe && 'min' in ba) {
    return {
      id: 'da-front',
      title: 'Setback from the lot in front',
      status: !f ? 'unknown' : f.clearance === null ? 'pass' : atLeast(f.clearance, ba.min),
      value: at,
      limit: `${num(ba.min)} m from the rear boundary of the lot in front`,
      note: f ? ba.note : NEED_FRONT,
      source: cite(c, ba.source),
    }
  }
  const b = bandOf(fr.bands, ms.lotArea)
  const garage = fr.garage ? `; ${fr.garage}` : ''
  const who = fr.neighbours ?? 'the two nearest houses'
  const limit =
    b.average === 'instead'
      ? `${cap(who)}, else ${num(b.min)} m${garage}`
      : b.average === 'or-greater'
        ? `${num(b.min)} m or ${who}, whichever is greater${garage}`
        : `${num(b.min)} m ${fr.to}${garage}`
  // Without the neighbours' setbacks, an 'instead' fallback only warns when short, and an 'or-greater' one can't pass outright.
  // Over the front boundary fails whatever the neighbours do.
  const short = f && f.clearance !== null ? f.clearance + 1e-6 < b.min : false
  const over = f && f.clearance !== null ? f.clearance < 0 : false
  const status: CheckStatus =
    s.battleAxe || !f ? 'unknown' : f.clearance === null ? 'pass' : over ? 'fail' : b.average === 'instead' ? (short ? 'warn' : 'pass') : short ? 'fail' : b.average === 'or-greater' ? 'warn' : 'pass'
  const why =
    b.average === 'instead'
      ? 'The neighbours’ setbacks aren’t known, so this uses the fallback distance.'
      : b.average === 'or-greater'
        ? `The neighbours’ setbacks aren’t known: if their average is more than ${num(b.min)} m, that applies.`
        : ''
  return {
    id: 'da-front',
    title: 'Front setback',
    status,
    value: at,
    limit,
    note: s.battleAxe ? ba.note : f ? [why, fr.note ?? ''].filter(Boolean).join(' ') || undefined : NEED_FRONT,
    source: cite(c, fr.source),
  }
}

/** The depth of cut and the height of fill, against a council's limits. */
function cutFillCheck(ms: Measures, c: Council, r: CutFillRule): CheckResult {
  const e = ms.earth
  const limit = `${r.nearCut !== undefined ? `Cut ${len(r.nearCut)} within 1 m of a boundary, ${len(r.cut)} elsewhere` : `Cut ${len(r.cut)}`}; fill ${len(r.fill)}${r.outsideHouse ? ', outside the house' : ''}`
  if (!e) return { id: 'da-cut-fill', title: 'Depth of cut and fill', status: 'pass', value: 'No cut and fill', limit, source: cite(c, r.source) }
  const cut = r.outsideHouse ? e.cutOutside : r.nearCut !== undefined ? Math.max(e.cutMid, e.cutFar) : e.maxCut
  const fill = r.outsideHouse ? e.fillOutside : e.maxFill
  const over = cut > r.cut + 1e-6 || fill > r.fill + 1e-6 || (r.nearCut !== undefined && e.cutNear > r.nearCut + 1e-6)
  return {
    id: 'da-cut-fill',
    title: 'Depth of cut and fill',
    status: over ? (r.generally ? 'warn' : 'fail') : 'pass',
    value: `${r.nearCut !== undefined ? `Cut ${m(e.cutNear)} within 1 m of the boundary, ${m(cut)} elsewhere` : `Cut ${m(cut)}`}; fill ${m(fill)}${r.outsideHouse ? ', outside the house' : ''}`,
    limit,
    note: `${over && r.generally ? 'The DCP says “generally”, so more needs a case in the DA. ' : ''}Measured from the natural ground to the levelled ground.`,
    source: cite(c, r.source),
  }
}

/**
 * The DA checks for council `c`: each control its table holds, in the order the panel lists them.
 * A control the table leaves out (its source couldn't be read) isn't checked; notChecked lists it.
 */
export function councilChecks(ms: Measures, c: Council): CheckResult[] {
  const out: CheckResult[] = []
  const s = ms.settings
  const H = ms.height
  const lot = ms.lotArea
  const title = s.titleArea && s.titleArea > lot + 0.5 ? s.titleArea : null

  if (c.height) {
    // Until the lot's map value is entered, the DCP's own figure if it has one.
    const fallback = s.lepHeight === undefined ? c.height.fallback : undefined
    const lepH = s.lepHeight ?? fallback?.max
    out.push({
      id: 'da-height',
      title: 'Building height',
      status: lepH === undefined ? 'unknown' : !ms.hasHouse ? 'pass' : atMost(H, lepH),
      value: ms.hasHouse ? `${m(H)} above existing ground` : undefined,
      limit: lepH === undefined ? 'The Height of Buildings Map value for this lot' : `${m(lepH)}${fallback ? ` (${fallback.says}; look up this lot’s map value)` : ' (Height of Buildings Map)'}`,
      note: `${lepH === undefined ? 'Enter the map value under Lot facts once it’s looked up. ' : ''}Measured straight down to the natural ground at the roof’s corners and ridges and the tops of the walls.`,
      source: fallback ? cite(c, fallback.source, ' (LEP map value not looked up)') : cite(c, c.height.source),
    })
  }

  if (c.storeys) {
    const r = c.storeys
    const ba = s.battleAxe ? r.battleAxe : undefined
    const over = ms.storeys > r.max
    out.push({
      id: 'da-storeys',
      title: 'Storeys',
      status: over ? (r.generally ? 'warn' : 'fail') : ba && ms.storeys > ba.max ? 'warn' : 'pass',
      value: storeysText(ms),
      limit: ba ? `${cap(word(ba.max))} storey${ba.max === 1 ? '' : 's'} on a battle-axe lot unless the objectives are met; ${word(r.max)} at most` : cap(word(r.max)),
      note: over && r.generally ? r.generally : ba && ms.storeys > ba.max ? ba.note : undefined,
      source: cite(c, ba ? ba.source : r.source),
    })
  }

  const r = rear(ms)
  if (ms.storeys > 1 && c.rearUpper) {
    out.push({
      id: 'da-rear-upper',
      title: `Upper floor out of the rear ${num(c.rearUpper.min)} m`,
      status: !r ? 'unknown' : r.upperClearance === null ? 'pass' : atLeast(r.upperClearance, c.rearUpper.min),
      value: r && r.upperClearance !== null ? toEdge(r.upperClearance, r) : undefined,
      limit: `Single storey only within ${num(c.rearUpper.min)} m of the rear boundary`,
      note: r ? undefined : NEED_FRONT,
      source: cite(c, c.rearUpper.source),
    })
  }

  if (c.fsr) {
    const fsrArea = title ?? lot
    const ratio = ms.grossArea / fsrArea
    out.push({
      id: 'da-fsr',
      title: 'Floor space ratio',
      status: s.lepFsr === undefined ? 'unknown' : atMost(ratio, s.lepFsr),
      value: `${ratio.toFixed(2)}:1 on ${m2(fsrArea)}`,
      limit: s.lepFsr === undefined ? 'The Floor Space Ratio Map value for this lot' : `${s.lepFsr.toFixed(2)}:1`,
      note:
        (s.lepFsr === undefined ? 'Enter the map value under Lot facts once it’s looked up. ' : '') +
        (s.battleAxe && !title ? 'The LEP measures this against the whole lot, handle included: enter the title area under Lot facts.' : 'Measured against the whole lot, handle included (cl 4.5(3)).'),
      source: cite(c, c.fsr.source),
    })
  }

  const f = front(ms)
  if (c.front) out.push(frontCheck(ms, c, c.front, f))

  if (c.sideRear) {
    const sr = c.sideRear
    const others = ms.edges.filter(e => e.role !== 'front')
    const need = setbackNeed(sr, H)
    const tall = need > sr.min
    const closestSide = closest(others)
    const sideMin = minClear(others)
    out.push({
      id: 'da-side-rear',
      title: 'Side and rear setbacks',
      status: sideMin === null ? 'pass' : atLeast(sideMin, need),
      value: sideMin === null ? 'No house yet' : toEdge(sideMin, closestSide),
      limit: setbackLimit(sr),
      note: f ? (tall ? tallNote(sr) : undefined) : 'Until the front is picked under Lot facts, every side is held to this.',
      source: cite(c, sr.source),
    })
  }
  if (c.side) out.push(setbackCheck(ms, c, c.side, 'da-side', 'Side setbacks', sides(ms)))
  if (c.rear) {
    const r = rear(ms)
    out.push(setbackCheck(ms, c, c.rear, 'da-rear', 'Rear setback', r ? [r] : []))
  }

  if (c.coverage) {
    const cv = c.coverage
    const cover = (a: number) => Math.max(coverageShare(cv, a) * a, cv.atLeast ?? 0)
    out.push({
      id: 'da-coverage',
      title: 'Site coverage',
      status: ms.footprint <= cover(lot) + 1e-6 ? 'pass' : title && ms.footprint <= cover(title) + 1e-6 ? 'warn' : 'fail',
      value: `${m2(ms.footprint)} (${pct(ms.footprint / lot)})`,
      limit: `${m2(cover(lot))} on ${m2(lot)}${title ? `, or ${m2(cover(title))} on the ${m2(title)} title` : ''}`,
      note: title ? cv.handleNote : undefined,
      source: cite(c, cv.source),
    })
  }

  if (c.landscaped) {
    const ls = c.landscaped
    const land = lot - ms.hardArea
    const landNeed = landscapedNeed(ls, lot)
    const landTitle = title ? title - ms.hardArea : null
    const landNeedTitle = title ? landscapedNeed(ls, title) : null
    const behind = ls.behindBuildingLine === undefined ? '' : `; ${ls.behindBuildingLine === 0.5 ? 'half' : pct(ls.behindBuildingLine)} behind the building line`
    out.push({
      id: 'da-landscaped',
      title: ls.name ?? 'Landscaped area',
      status: land + 1e-6 >= landNeed ? (landTitle === null || landTitle + 1e-6 >= landNeedTitle! ? 'pass' : 'warn') : 'fail',
      value: `About ${m2(land)}`,
      limit: `${m2(landNeed)} on ${m2(lot)}${title ? `, ${m2(landNeedTitle!)} on the title` : ''}${behind}`,
      note: 'Everything outside the house, slabs, driveways and decks counts here; paths and paving drawn as areas count against it.',
      source: cite(c, ls.source),
    })
  }

  const e = ms.earth
  if (c.batters) {
    const run = c.batters.run
    out.push({
      id: 'da-batters',
      title: 'Batter slopes',
      status: !e ? 'pass' : e.cutBatter + 1e-6 >= run && e.fillBatter + 1e-6 >= run ? 'pass' : 'fail',
      value: e ? `Cut 1 in ${e.cutBatter}, fill 1 in ${e.fillBatter}` : 'No cut and fill',
      limit: `No steeper than 1 in ${num(run)}${c.batters.prefer ? ` (1 in ${num(c.batters.prefer)} preferred)` : ''}`,
      note: e && (e.cutBatter < run || e.fillBatter < run) ? `Set the batters to 1 in ${num(run)} under Earthworks › Cut & fill. The volumes grow.` : undefined,
      source: cite(c, c.batters.source),
    })
  }

  if (c.cutFill) out.push(cutFillCheck(ms, c, c.cutFill))

  if (c.geotech) {
    const g = c.geotech
    const deep = e ? Math.max(e.maxCut, e.maxFill) : 0
    const steep = ms.slopePct >= g.slope
    const hit = deep > g.depth || steep
    out.push({
      id: 'da-geotech',
      title: 'Geotechnical report',
      status: hit ? 'warn' : 'pass',
      value: `Deepest cut or fill ${m(deep)}; block slope ${ms.slopePct.toFixed(1)}%`,
      limit: `Needed for earthworks over ${num(g.depth)} m high or on land of ${num(g.slope)}% or more`,
      note: `${hit ? `Not a fail: ${g.why}. ` : ''}${g.also ?? ''}` || undefined,
      source: cite(c, g.source),
    })
  }

  if (c.erosion) {
    const disturbed = e ? e.disturbed : ms.footprint
    out.push({
      id: 'da-erosion',
      title: 'Erosion and sediment control',
      status: 'pass',
      value: `About ${m2(disturbed)} of ground disturbed`,
      limit: bandOf(c.erosion.bands, disturbed),
      note: [c.erosion.note, 'The disturbed area counts the cut and fill and the house’s footprint.'].filter(Boolean).join(' '),
      source: cite(c, c.erosion.source),
    })
  }

  if (c.retaining) {
    const rw = c.retaining
    const near = rw.near !== undefined && rw.nearMax !== undefined ? { within: rw.near, max: rw.nearMax } : null
    const bad = ms.walls.filter(w => w.height > (near && w.toBoundary <= near.within ? near.max : rw.max) + 1e-6)
    const eng = rw.tall ? ms.walls.filter(w => w.height > rw.tall!.over) : []
    const heights = near ? `${len(near.max)} within ${len(near.within)} of ${rw.nearWhat ?? 'a side or rear boundary'}, ${len(rw.max)} elsewhere` : `${len(rw.max)}`
    const many = bad.length > 1 ? 's are' : ' is'
    out.push({
      id: 'da-retaining',
      title: 'Retaining walls',
      status: bad.length ? (rw.engineer ? 'warn' : 'fail') : 'pass',
      value: ms.walls.length ? `Tallest holds back ${m(Math.max(...ms.walls.map(w => w.height)))}` : 'None',
      limit: rw.engineer ? `Over ${heights}: designed by a professional engineer` : `${near ? heights : `Up to ${heights}`}${rw.tall ? `; over ${len(rw.tall.over)} ${rw.tall.limit}` : ''}`,
      note: !bad.length
        ? undefined
        : rw.engineer
          ? `${bad.length} wall${many} over these heights, so ${bad.length > 1 ? 'they need' : 'it needs'} a professional engineer’s design.`
          : `${bad.length} wall${many} over the limit${eng.length ? `; walls over ${len(rw.tall!.over)} ${rw.tall!.note}` : ''}.`,
      source: cite(c, rw.source),
    })
  }

  out.push(...neighbourSun(ms, c))

  return [lotCheck(ms), ...out, ...livingSun(ms, 'da', c), ...treeChecks(ms, 'da', c)]
}

// ---------------------------------------------------------------------------
// What a check needs drawn before it can pass

/** The parts of the design a check measures. */
export type Part = 'outline' | 'roof' | 'rooms' | 'driveway'

const has = (ms: Measures, p: Part) => (p === 'outline' ? ms.hasHouse : p === 'roof' ? ms.hasRoof : p === 'rooms' ? ms.hasRooms : (ms.drives ?? []).length > 0)

/** What to draw, for the first part a check is waiting on. */
const DRAW: Record<Part, string> = {
  outline: 'Draw the outside walls as a closed outline to check this.',
  roof: 'Add a roof to check this.',
  rooms: 'Add rooms to check this.',
  driveway: 'Draw a driveway (Area tool, kind Driveway) to check this.',
}

/**
 * What each check measures of the design: it waits for these before it can pass. The height and
 * the setbacks that grow with it wait for a roof, since the walls alone stand lower.
 */
const NEEDS: Record<string, Part[]> = {
  'lot-inside': ['outline'],
  'hc-gfa': ['outline'],
  'hc-height': ['outline', 'roof'],
  'hc-storeys': ['outline'],
  'hc-front': ['outline'],
  'hc-side': ['outline', 'roof'],
  'hc-rear': ['outline', 'roof'],
  'hc-landscaped': ['outline'],
  'hc-cut': ['outline'],
  'hc-fill': ['outline'],
  'hc-works-boundary': ['outline'],
  'hc-retaining': ['outline'],
  'da-height': ['outline', 'roof'],
  'da-storeys': ['outline'],
  'da-fsr': ['outline'],
  'da-front': ['outline'],
  'da-side-rear': ['outline', 'roof'],
  // A council's side or rear rule can grow with the house's height, which the roof sets.
  'da-side': ['outline', 'roof'],
  'da-rear': ['outline', 'roof'],
  'da-rear-upper': ['outline'],
  'da-coverage': ['outline'],
  'da-landscaped': ['outline'],
  'da-batters': ['outline'],
  'da-cut-fill': ['outline'],
  'da-geotech': ['outline'],
  'da-erosion': ['outline'],
  'da-retaining': ['outline'],
  // The shadow is the house's, so it waits for the walls and the roof that cast it.
  'da-sun-neighbours': ['outline', 'roof'],
  // The driveway crossing checks (./crossing.ts), on either pathway.
  'drive-grade': ['driveway'],
  'drive-footpath': ['driveway'],
  'drive-transitions': ['driveway'],
  'drive-scrape': ['driveway'],
  'drive-turn': ['driveway'],
}

/** A tree is measured against the house; retaining walls once there are some, house or not. */
const partsOf = (r: CheckResult, ms: Measures): Part[] => (r.tree ? ['outline'] : r.id.endsWith('-retaining') && ms.walls.length ? [] : (NEEDS[r.id] ?? []))

/**
 * A check can't pass on a design that's missing what it measures (an empty plan used to show
 * "8 pass", and walls without a roof a passing height): it says what to draw instead. A fail
 * or a warning stands, since drawing more only adds to the house.
 */
export function waitForDesign(r: CheckResult, ms: Measures): CheckResult {
  const missing = partsOf(r, ms).find(p => !has(ms, p))
  if (!missing || r.status !== 'pass') return r
  const sofar = missing !== 'outline' && r.value ? `So far: ${r.value}.` : ''
  return { ...r, status: 'incomplete', value: DRAW[missing], note: [sofar, r.note].filter(Boolean).join(' ') || undefined }
}

/** The survey's boundary, which every pathway's setbacks are measured from. */
const LOT: Source = { clause: 'Lot boundary, from the survey', confidence: 'read', asAt: 'the survey you imported' }

/** The house inside the lot: a hard fail on every pathway when any of it is over the boundary. */
function lotCheck(ms: Measures): CheckResult {
  const o = ms.outside
  if (!o) return { id: 'lot-inside', title: 'Building inside the lot', status: 'pass', value: 'Inside the survey boundary', source: LOT }
  const over = ms.edges.filter(e => e.clearance !== null && e.clearance < 0).sort((a, b) => a.clearance! - b.clearance!)
  return {
    id: 'lot-inside',
    title: o.all ? 'The building is outside the lot' : 'Part of the building is outside the lot',
    status: 'fail',
    value: over.length ? over.map(e => toEdge(e.clearance!, e)).join(', ') : 'A corner of the lot is inside the house',
    limit: 'All of the building inside the lot',
    note: 'Move the house under Earthworks › Place: type a distance to a side there to slide the house square to it.',
    source: LOT,
  }
}

/**
 * Every check for a pathway, in the order the panel lists them. The DA checks are the council's own
 * rules, so with no council switched on there are none. The driveway crossing checks come last on
 * either pathway (the Housing Code calls up AS/NZS 2890.1 too, cl 3.16(2)), with the council's
 * crossing numbers where it has them: the crossing is on the council's footpath either way.
 */
export function runChecks(ms: Measures, pathway: Pathway, council: CouncilId | null = activeCouncil(ms.settings)?.id ?? null): CheckResult[] {
  const rs = pathway === 'cdc' ? housingCode(ms) : council ? councilChecks(ms, COUNCIL_TABLES[council]) : []
  const crossingCouncil = pathway === 'da' && council ? COUNCIL_TABLES[council] : activeCouncil(ms.settings)
  const drive = rs.length ? crossingChecks(ms.drives ?? [], crossingCouncil) : []
  return [...rs, ...drive].map(r => waitForDesign(r, ms))
}

export interface CheckCounts {
  fail: number
  warn: number
  unknown: number
  /** Waiting for more of the design (see waitForDesign). */
  incomplete: number
  pass: number
  pending: number
  info: number
}

export function countChecks(rs: CheckResult[]): CheckCounts {
  const c: CheckCounts = { fail: 0, warn: 0, unknown: 0, incomplete: 0, pass: 0, pending: 0, info: 0 }
  for (const r of rs) c[r.status]++
  return c
}

/**
 * The CDC checks' biggest gap, pinned at the top of Checks so a clean run isn't read as a CDC:
 * whether the land can use one at all. The section 10.7 planning certificate says (docs/research).
 */
export const CDC_LAND =
  'Not checked: whether this land can use a CDC at all (zone, heritage, flood, bushfire and other exclusions). Place the block under Site › Map to read them from the NSW planning maps. The council’s section 10.7 planning certificate says for sure.'

/** The same note once the planning maps have been read for the placed lot. */
export const CDC_LAND_MAPPED =
  'Zone, heritage, bushfire, flood and landslide are read from the NSW planning maps for your lot (below). Other exclusions aren’t checked: the council’s section 10.7 planning certificate says for sure.'

/** What the Housing Code checks don't cover yet: shown under the list so a clean run isn't read as approval. */
export const NOT_CHECKED: { cdc: string[] } = {
  // Whether the land can use a CDC at all is pinned at the top of Checks instead (CDC_LAND).
  cdc: [
    'Private open space (24 m², 3 × 3 m, 1 in 50)',
    'Privacy screens, balconies and decks',
    'Garage door width and garage setback; parking to AS/NZS 2890.1',
    'Walls within 900 mm of a side boundary',
    'Building over a registered easement (not allowed, cl 3.2(1)(d)); landslide risk land is excluded (cl 3.2(1)(h))',
    'A battle-axe lot’s parking must let cars leave forwards (cl 3.16(3))',
  ],
}

/**
 * The controls a council's table leaves out because the research couldn't read them from its own
 * text (not the ones its text doesn't have, which there's nothing to check against).
 */
export const missingControls = (c: Council): ControlKey[] => CONTROLS.filter(k => !k.has(c) && !c.absent?.includes(k.key)).map(k => k.key)

/** How many of the controls a council has rules for, of the ones its text could have: 9 of 11. */
export function controlCount(c: Council): { have: number; of: number } {
  const have = CONTROLS.filter(k => k.has(c)).length
  return { have, of: have + missingControls(c).length }
}

/**
 * What the checks don't cover yet: the Housing Code's list on the CDC route; on the DA route, the
 * controls the council's table leaves out, then the council's own list.
 */
export function notChecked(pathway: Pathway, council: Council | null): string[] {
  if (pathway === 'cdc' || !council) return NOT_CHECKED.cdc
  const title = (k: ControlKey) => CONTROLS.find(x => x.key === k)!.title
  const whose = council.name.endsWith('s') ? `${council.name}’` : `${council.name}’s`
  return [...missingControls(council).map(k => `${title(k)}: ${whose} own rule isn’t in the app yet`), ...council.notChecked]
}
