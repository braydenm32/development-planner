// The rules, one list per approval pathway. Every number and clause comes from the research
// in docs/research (compliance-and-swept-path-sources.md and councils/wollongong.md), with
// the same marks for how sure it is. Nothing here is legal advice.

import type { Vec2 } from '../lib/geom'
import type { Edge, Measures } from './measure'
import { E17_REMOVAL_DISTANCE, encroachment, MINOR_ENCROACHMENT } from './trees'
import { activeCouncil } from './councils'
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
const LEP = (clause: string, confidence: Source['confidence'] = 'read'): Source => ({ clause: `Wollongong LEP 2009 ${clause}`, confidence, asAt: 'version of 2 Oct 2026' })
const DCP = (clause: string, confidence: Source['confidence'] = 'read', asAt = 'chapter B1, in force 14 Dec 2016'): Source => ({ clause: `Wollongong DCP ${clause}`, confidence, asAt })

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

/** Wollongong DCP B1 4.4.2(2): maximum site coverage by site area. */
export const dcpCoverage = (area: number) => (area < 450 ? 0.55 : area < 900 ? 0.5 : 0.4)

/** Wollongong DCP B1 4.5.2(2): minimum landscaped area (m²) by site area. */
export function dcpLandscaped(area: number): number {
  if (area < 600) return 0.2 * area
  if (area <= 900) return 120 + 0.3 * (area - 600)
  return 210 + 0.4 * (area - 900)
}

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

function treeChecks(ms: Measures, pathway: Pathway): CheckResult[] {
  return ms.trees.map(t => {
    const e = encroachment(t, ms)
    const id = `tree:${t.id}`
    const title = `${t.neighbour ? 'Neighbour’s tree' : 'Tree'}${t.label ? ` ${t.label}` : ''}`
    if (t.remove && !t.neighbour) {
      const near = e.toHouse !== null && e.toHouse <= E17_REMOVAL_DISTANCE
      const note =
        pathway === 'da'
          ? near
            ? `Its base is ${m(e.toHouse!)} from the house, within ${E17_REMOVAL_DISTANCE} m, so once the DA is approved it may be removed without another application, if council’s tree officer agrees (E17 13.3). Replacement planting applies (E17 s9).`
            : `It’s more than ${E17_REMOVAL_DISTANCE} m from the house, so the DA has to make the case for removing it, with an arborist report (E17 13.1).`
          : cdcRemoval(t.height, e.toHouse)
      return {
        id,
        title,
        tree: t.id,
        removable: true,
        status: 'pending',
        value: 'Marked for removal (pending DA or CDC)',
        note,
        source: pathway === 'da' ? DCP('E17 13.3', 'read', 'chapter E17, in force 1 Jul 2023') : HC('cl 3.33(1)'),
      }
    }
    const zoneStatus: CheckStatus = e.share === 0 ? 'pass' : e.inSrz || e.share > MINOR_ENCROACHMENT ? 'fail' : 'warn'
    const zone = `${m(e.tpz)} protection zone`
    if (pathway === 'cdc') {
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
      limit: `Up to ${pct(MINOR_ENCROACHMENT)}, and none in the ${m(e.srz)} root zone`,
      note:
        status === 'pass'
          ? undefined
          : status === 'warn'
            ? 'A minor encroachment: the arborist report has to show the tree stays viable.'
            : t.neighbour
              ? 'More than a minor encroachment needs root investigation by an AQF level 5 arborist or a design change. It’s the neighbour’s tree, so removing it is theirs to apply for, not yours.'
              : 'More than a minor encroachment needs root investigation by an AQF level 5 arborist, a design change, or the tree marked for removal.',
      source: { clause: 'Wollongong DCP E17 13.2, 13.4; AS 4970-2009', confidence: 'secondary', asAt: 'E17 in force 1 Jul 2023; AS 4970 numbers from council manuals' },
    }
  })
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
    status: !ms.hasHouse ? 'pass' : ms.grossArea <= gfa ? 'pass' : ms.roomsArea <= gfa ? 'warn' : 'fail',
    value: ms.hasHouse ? `${m2(ms.grossArea)} to the outside of the walls (rooms ${m2(ms.roomsArea)})` : 'No floors yet',
    limit: `${m2(gfa)} on a ${m2(area)} lot`,
    note: 'Gross floor area is measured to the inside of the outside walls, so the true figure sits between these two. One garage space up to 18 m² doesn’t count. Check the table against the current text.',
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
      value: f ? (f.clearance === null ? 'No house yet' : `${m(f.clearance)} to the ${f.label.toLowerCase()}`) : undefined,
      limit: '3 m from the rear boundary of the lot in front',
      note: f ? undefined : NEED_FRONT,
      source: HC('cl 3.10(15)'),
    })
  } else {
    const need = hcRoadSetback(area)
    out.push({
      id: 'hc-front',
      title: 'Front setback',
      status: !f ? 'unknown' : f.clearance === null ? 'pass' : f.clearance + 1e-6 >= need ? 'pass' : 'warn',
      value: f && f.clearance !== null ? `${m(f.clearance)} to the ${f.label.toLowerCase()}` : undefined,
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
      value: sideMin === null ? 'No house yet' : `${m(sideMin)} to the ${c?.label.toLowerCase()}`,
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
      value: low === null ? 'No house yet' : `${m(low)} to the ${r.label.toLowerCase()}${twoStorey && high !== null ? `, upper floor ${m(high)}` : ''}`,
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

  return [...out, ...treeChecks(ms, 'cdc')]
}

// ---------------------------------------------------------------------------
// Wollongong LEP and DCP (DA)

function wollongong(ms: Measures): CheckResult[] {
  const out: CheckResult[] = []
  const s = ms.settings
  const H = ms.height
  const lot = ms.lotArea
  const title = s.titleArea && s.titleArea > lot + 0.5 ? s.titleArea : null

  const lepH = s.lepHeight ?? 9
  out.push({
    id: 'da-height',
    title: 'Building height',
    status: !ms.hasHouse ? 'pass' : atMost(H, lepH),
    value: ms.hasHouse ? `${m(H)} above existing ground` : undefined,
    limit: `${m(lepH)}${s.lepHeight === undefined ? ' (B1’s figure for R2; look up this lot’s map value)' : ' (Height of Buildings Map)'}`,
    note: 'Measured straight down to the natural ground at the roof’s corners and ridges and the tops of the walls.',
    source: s.lepHeight === undefined ? DCP('B1 4.1 (LEP map value not looked up)', 'secondary') : LEP('cl 4.3(2)'),
  })

  out.push({
    id: 'da-storeys',
    title: 'Storeys',
    status: ms.storeys > 2 ? 'fail' : s.battleAxe && ms.storeys > 1 ? 'warn' : 'pass',
    value: storeysText(ms),
    limit: s.battleAxe ? 'One storey on a battle-axe lot unless the objectives are met; two at most' : 'Two',
    note: s.battleAxe && ms.storeys > 1 ? 'A second storey needs a case against B1 4.1.2’s objectives in the DA. The CDC route has no battle-axe storey limit.' : undefined,
    source: DCP(s.battleAxe ? 'B1 4.1, 4.1.2(1)' : 'B1 4.1'),
  })

  const r = rear(ms)
  if (ms.storeys > 1) {
    out.push({
      id: 'da-rear-upper',
      title: 'Upper floor out of the rear 8 m',
      status: !r ? 'unknown' : r.upperClearance === null ? 'pass' : atLeast(r.upperClearance, 8),
      value: r && r.upperClearance !== null ? `${m(r.upperClearance)} to the ${r.label.toLowerCase()}` : undefined,
      limit: 'Single storey only within 8 m of the rear boundary',
      note: r ? undefined : NEED_FRONT,
      source: DCP('B1 4.1.2(4)'),
    })
  }

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
    source: LEP('cl 4.4(2), 4.5(3)'),
  })

  const f = front(ms)
  out.push({
    id: 'da-front',
    title: 'Front setback',
    status: s.battleAxe || !f ? 'unknown' : f.clearance === null ? 'pass' : atLeast(f.clearance, 6),
    value: f && f.clearance !== null ? `${m(f.clearance)} to the ${f.label.toLowerCase()}` : undefined,
    limit: '6 m to the front facade (infill); garages 5.5 m',
    note: s.battleAxe
      ? 'B1 measures this from the primary street frontage, and a battle-axe lot reaches the street only by its handle. B1 has no battle-axe front setback of its own, so ask council which boundary it treats as the front.'
      : f
        ? undefined
        : NEED_FRONT,
    source: DCP('B1 4.2.2(1)'),
  })

  const others = ms.edges.filter(e => e.role !== 'front')
  const need = H > 7 ? 3 : 0.9
  const c = closest(others)
  const sideMin = minClear(others)
  out.push({
    id: 'da-side-rear',
    title: 'Side and rear setbacks',
    status: sideMin === null ? 'pass' : atLeast(sideMin, need),
    value: sideMin === null ? 'No house yet' : `${m(sideMin)} to the ${c?.label.toLowerCase()}`,
    limit: '0.9 m to walls; 3 m where walls are over 7 m high',
    note: f ? (H > 7 ? 'The house rises over 7 m, so this uses 3 m throughout; lower walls may need less.' : undefined) : 'Until the front is picked under Lot facts, every side is held to this.',
    source: DCP('B1 4.3.2(1), (2)'),
  })

  const cover = (a: number) => dcpCoverage(a) * a
  out.push({
    id: 'da-coverage',
    title: 'Site coverage',
    status: ms.footprint <= cover(lot) + 1e-6 ? 'pass' : title && ms.footprint <= cover(title) + 1e-6 ? 'warn' : 'fail',
    value: `${m2(ms.footprint)} (${pct(ms.footprint / lot)})`,
    limit: `${m2(cover(lot))} on ${m2(lot)}${title ? `, or ${m2(cover(title))} on the ${m2(title)} title` : ''}`,
    note: title ? 'Whether B1 counts the access handle in the site area wasn’t checked, so both are shown.' : undefined,
    source: DCP('B1 4.4.2(2)'),
  })

  const land = lot - ms.hardArea
  const landNeed = dcpLandscaped(lot)
  const landTitle = title ? title - ms.hardArea : null
  const landNeedTitle = title ? dcpLandscaped(title) : null
  out.push({
    id: 'da-landscaped',
    title: 'Landscaped area',
    status: land + 1e-6 >= landNeed ? (landTitle === null || landTitle + 1e-6 >= landNeedTitle! ? 'pass' : 'warn') : 'fail',
    value: `About ${m2(land)}`,
    limit: `${m2(landNeed)} on ${m2(lot)}${title ? `, ${m2(landNeedTitle!)} on the title` : ''}; half behind the building line`,
    note: 'Everything outside the house, slabs, driveways and decks counts here; paths and paving drawn as areas count against it.',
    source: DCP('B1 4.5.2(2)'),
  })

  const e = ms.earth
  out.push({
    id: 'da-batters',
    title: 'Batter slopes',
    status: !e ? 'pass' : e.cutBatter + 1e-6 >= 4 && e.fillBatter + 1e-6 >= 4 ? 'pass' : 'fail',
    value: e ? `Cut 1 in ${e.cutBatter}, fill 1 in ${e.fillBatter}` : 'No cut and fill',
    limit: 'No steeper than 1 in 4',
    note: e && (e.cutBatter < 4 || e.fillBatter < 4) ? 'Set the batters to 1 in 4 under Earthworks › Cut & fill. The volumes grow.' : undefined,
    source: DCP('E19 4.3', 'read', 'chapter E19, in force 12 Jan 2018'),
  })

  const deep = e ? Math.max(e.maxCut, e.maxFill) : 0
  const steep = ms.slopePct >= 15
  out.push({
    id: 'da-geotech',
    title: 'Geotechnical report',
    status: deep > 1 || steep ? 'warn' : 'pass',
    value: `Deepest cut or fill ${m(deep)}; block slope ${ms.slopePct.toFixed(1)}%`,
    limit: 'Needed for earthworks over 1 m high or on land of 15% or more',
    note:
      (deep > 1 || steep ? 'Not a fail: E19 says the DA will generally need a geotechnical report. ' : '') +
      'Separately, E12 asks for one wherever council’s records or an inspection suggest the land may be unstable; it has no slope number of its own, so ask council what its property records say.',
    source: DCP('E19 4.1 cl 5; E12 4.1', 'read', 'E19 in force 12 Jan 2018; E12 19 Jul 2021'),
  })

  const disturbed = e ? e.disturbed : ms.footprint
  out.push({
    id: 'da-erosion',
    title: 'Erosion and sediment control',
    status: 'pass',
    value: `About ${m2(disturbed)} of ground disturbed`,
    limit: disturbed < 1000 ? 'A basic erosion and sediment control plan (under 1,000 m²)' : disturbed <= 2500 ? 'An erosion and sediment control plan (1,000 to 2,500 m²)' : 'A soil and water management plan (over 2,500 m²)',
    note: 'What the DA has to include; a fuller plan is needed within 50 m of a watercourse or next to sensitive land. The disturbed area counts the cut and fill and the house’s footprint.',
    source: DCP('E22 3(1)', 'read', 'chapter E22, in force 12 Jan 2018'),
  })

  const bad = ms.walls.filter(w => w.height > (w.toBoundary <= 0.9 ? 0.6 : 1) + 1e-6)
  const eng = ms.walls.filter(w => w.height > 1)
  out.push({
    id: 'da-retaining',
    title: 'Retaining walls',
    status: bad.length ? 'fail' : 'pass',
    value: ms.walls.length ? `Tallest holds back ${m(Math.max(...ms.walls.map(w => w.height)))}` : 'None',
    limit: '600 mm within 900 mm of a side or rear boundary, 1 m elsewhere; over 1 m terraced and engineered',
    note: bad.length ? `${bad.length} wall${bad.length > 1 ? 's are' : ' is'} over the limit${eng.length ? '; walls over 1 m need an engineer and justification' : ''}.` : undefined,
    source: DCP('B1 4.17.3'),
  })

  return [...out, ...treeChecks(ms, 'da')]
}

/** Each council's own rules (its LEP and DCP), for the DA pathway. */
const COUNCIL_RULES: Record<CouncilId, (ms: Measures) => CheckResult[]> = { wollongong }

/**
 * Every check for a pathway, in the order the panel lists them. The DA checks are the council's own
 * rules, so with no council switched on there are none.
 */
export function runChecks(ms: Measures, pathway: Pathway, council: CouncilId | null = activeCouncil(ms.settings)?.id ?? null): CheckResult[] {
  if (pathway === 'cdc') return housingCode(ms)
  return council ? COUNCIL_RULES[council](ms) : []
}

export interface CheckCounts {
  fail: number
  warn: number
  unknown: number
  pass: number
  pending: number
}

export function countChecks(rs: CheckResult[]): CheckCounts {
  const c: CheckCounts = { fail: 0, warn: 0, unknown: 0, pass: 0, pending: 0 }
  for (const r of rs) c[r.status]++
  return c
}

/** What the checks don't cover yet, by pathway (DA: Wollongong's): shown under the list so a clean run isn't read as approval. */
export const NOT_CHECKED: Record<Pathway, string[]> = {
  cdc: [
    'Whether the land can use a CDC at all (zone, heritage, flood, bushfire and other exclusions)',
    'Private open space (24 m², 3 × 3 m, 1 in 50)',
    'Privacy screens, balconies and decks',
    'Garage door width and garage setback; parking to AS/NZS 2890.1',
    'Walls within 900 mm of a side boundary',
    'Building over a registered easement (not allowed, cl 3.2(1)(d)); landslide risk land is excluded (cl 3.2(1)(h))',
    'A battle-axe lot’s parking must let cars leave forwards (cl 3.16(3))',
  ],
  da: [
    'Zone and the LEP map values (height, floor space ratio, overlays)',
    'Private open space (24 m², 4 m wide, 1 in 50)',
    'Sun to the neighbours on 21 June',
    'Garage doors, parking and driveway width',
    'Fences, pools and storage',
    'Easements',
    'Bush fire prone land: check council’s map (E16, in force 19 Aug 2024); if it applies, the DA needs a bush fire assessment',
    'B1 asks battle-axe handles to be at least 6 m wide as a driveway reserve (B1 5.6, written for multi-dwelling sites)',
  ],
}
