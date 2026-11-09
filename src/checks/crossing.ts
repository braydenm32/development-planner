// The driveway crossing checks: can a car get from the street to the garage? The grades along
// the drive, the footpath crossing's fall, the changes of grade where the drive meets the
// footpath and the garage, whether a car's underside scrapes, and whether a car can turn in.
// The council's numbers come first (its DCP and crossing drawings, in ./councils), and
// AS/NZS 2890.1:2004 fills in the rest, with the same marks for how sure the research is
// (docs/research/compliance-and-swept-path-sources.md). The geometry is src/plan/crossing.ts.

import { gradeText } from '../lib/drape'
import {
  driveProfile,
  gradeBreaks,
  kerbFromBoundary,
  rampOf,
  scrapeAlong,
  segmentsOf,
  simplify,
  turnIn,
  type ClearanceTemplate,
  type CrossingShape,
  type DriveLine,
  type DriveProfile,
  type GradeBreak,
  type Scrape,
  type Segment,
  type TurnIn,
  type TurningCar,
} from '../plan/crossing'
import type { Council, RuleSource } from './councils/types'
import type { CheckResult, CheckStatus, Source } from './types'

// ---------------------------------------------------------------------------
// AS/NZS 2890.1 and the design cars, as the research has them

/**
 * AS/NZS 2890.1:2004, the standard the Housing Code (cl 3.16(2)) and the councils call up. It's a
 * paid standard the research hasn't read; its domestic driveway numbers are from the 2024 public
 * comment draft's summary, as councils commonly restate them.
 */
const AS = (clause: string, confidence: Source['confidence'] = 'secondary', asAt = 'from the 2024 draft’s summary, as councils restate the 2004 edition'): Source => ({
  clause: `AS/NZS 2890.1:2004 ${clause}`,
  confidence,
  asAt,
})

/** The steepest grade (1 in 4), and steeper than 1 in 5 wants a non-slip finish. */
export const AS_MAX_GRADE = 0.25
export const NON_SLIP_GRADE = 0.2
/** A change of grade over these needs a transition: summits (crests) and sags (dips). */
export const SUMMIT = 0.125
export const SAG = 0.15
/** Transition length: about 2 m up to an 18% change, 3 m beyond. */
export const transitionLength = (change: number) => (change <= 0.18 ? 2 : 3)
/** Across the footpath, about 1 in 33 (the council's drawing decides). */
export const AS_FALL = 0.03
/** The narrowest domestic driveway. */
export const MIN_WIDTH = 3
/** A garage door for one car, at least. */
export const MIN_DOOR = 2.5

/**
 * The B99 ground clearance template (2004 Appendix C). The 120 mm clearance is read (the 2004
 * foreword); the car's size is the commonly quoted 2004 B99 (5.20 m long, wheelbase 3.05 m,
 * unverified), its overhangs split in the B85's proportion. The template's approach and departure
 * angles weren't read: the app takes a low 10° each, which is stricter than most cars.
 */
export const B99: ClearanceTemplate = { wheelbase: 3.05, front: 0.92, rear: 1.23, clearance: 0.12, approach: 10, departure: 10 }

/** The B85 car for turning (2024 draft A.3 and Table 2.6): 4.9 × 1.9 m, overhangs 0.82 and 1.10 m, an 11.5 m turning circle. */
export const B85: TurningCar = { length: 4.9, width: 1.9, wheelbase: 2.98, front: 0.82, circle: 11.5 }

/** The app's own assumptions, until the council's drawing is in the app or the person measures it. */
const ASSUMED = {
  /** Kerb to boundary (m): the footpath on Wollongong's crossing drawing C30. */
  footpath: 3.5,
  /** A layback like Wollongong's C30: a level 450 mm kerb break, then 1.52 m at 1 in 8. */
  ramp: [
    { length: 0.45, grade: 0 },
    { length: 1.52, grade: 0.125 },
  ],
  /** Splays either side of the crossing at the kerb (m each): Wollongong's C30 widens 3.0 m to 5.6 m. */
  splay: 1.3,
  /** The road rising away from the gutter, for the car's wheels: a typical 3% crossfall. */
  road: 0.03,
  /** The car's side off the kerb as it comes along the road (m). */
  gap: 0.5,
  /** About a lane (m): a turn that needs more swings over the middle of the road. */
  lane: 3.5,
}

/** The numbers the crossing checks use, each with its source: the council's where it has one, AS/NZS 2890.1's otherwise. */
export interface CrossingStandard {
  maxGrade: { max: number; generally: boolean; source: Source }
  footpath: {
    width: number
    fall: number
    maxFall: number | null
    firm: boolean
    steepest: { fall: number; says: string } | null
    note?: string
    ramp: { length: number; grade: number }[]
    assumed: boolean
    source: Source
  }
  transitions: { summit: number; sag: number; length: ((change: number) => number); source: Source }
  width: { boundary: number | null; kerb: number | null; source: Source | null }
  road: number
}

const cite = (c: Council, r: RuleSource): Source => ({ clause: `${c.instruments[r.in].cite} ${r.clause}`, confidence: r.sure, asAt: r.version ?? c.instruments[r.in].version })

/** The crossing standard for a council (or none): its own numbers, then AS/NZS 2890.1's. */
export function crossingStandard(c: Council | null): CrossingStandard {
  const r = c?.crossing
  const fp = r?.footpath
  const tr = r?.transitions
  return {
    maxGrade: r?.maxGrade && c ? { max: r.maxGrade.max, generally: !!r.maxGrade.generally, source: cite(c, r.maxGrade.source) } : { max: AS_MAX_GRADE, generally: false, source: AS('cl 2.6.2') },
    footpath: {
      width: fp?.width ?? ASSUMED.footpath,
      fall: fp?.fall ?? AS_FALL,
      maxFall: fp?.maxFall ?? null,
      firm: !!fp?.firm,
      steepest: fp?.steepest ?? null,
      note: fp?.note,
      ramp: fp?.ramp ?? ASSUMED.ramp,
      assumed: !fp?.ramp,
      source: fp && c ? cite(c, fp.source) : AS('cl 2.6.2 (across the footpath, about 1 in 33)'),
    },
    transitions: {
      summit: tr?.change ?? SUMMIT,
      sag: tr?.change ?? SAG,
      length: tr ? (ch: number) => Math.max(tr.length, transitionLength(ch)) : transitionLength,
      source: tr && c ? cite(c, tr.source) : AS('cl 2.6.2 (changes of grade)'),
    },
    width: r?.width && c ? { boundary: r.width.boundary, kerb: r.width.kerb, source: cite(c, r.width.source) } : { boundary: null, kerb: null, source: null },
    road: ASSUMED.road,
  }
}

/** The crossing's shape for a drive: the footpath the person gave, or the standard's. */
export function shapeOf(std: CrossingStandard, line: DriveLine): CrossingShape {
  const footpath = line.facts.footpath && line.facts.footpath > 0 ? line.facts.footpath : std.footpath.width
  return { footpath, ramp: std.footpath.ramp, fall: std.footpath.fall, road: std.road }
}

// ---------------------------------------------------------------------------
// The kerb's level

export type KerbSource = 'typed' | 'chosen' | 'survey' | 'state'

export interface Kerb {
  rl: number
  from: KerbSource
  /** With `survey`: the survey's level at the boundary it was worked out from. */
  boundary?: number
}

/**
 * The kerb's level where the drive meets the road, in order: the level the person typed; the
 * survey's level at the boundary, down a standard crossing; the state's elevation data at the
 * kerb point (about ±0.9 m), once it's been read. A kerb chosen as the drive's street end level comes
 * second, after a typed one. Null when there's none: the crossing checks then
 * need a fact.
 */
export function kerbLevel(line: DriveLine, shape: CrossingShape): Kerb | null {
  const k = line.facts.kerb
  if (k?.from === 'typed') return { rl: k.rl, from: 'typed' }
  // The kerb picked as the drive's street end level: the crossing uses the same one.
  if (line.chosenKerb !== undefined) return { rl: line.chosenKerb, from: 'chosen' }
  if (line.natural !== null && line.boundary) return { rl: kerbFromBoundary(line.natural, shape), from: 'survey', boundary: line.natural }
  if (k?.from === 'state') return { rl: k.rl, from: 'state' }
  return null
}

/** Where the kerb's level came from, in a sentence. */
export function kerbText(k: Kerb, shape: CrossingShape): string {
  if (k.from === 'typed') return `The kerb level, RL ${k.rl.toFixed(2)}, is the one you typed.`
  if (k.from === 'chosen') return `The kerb level, RL ${k.rl.toFixed(2)}, is the kerb chosen for the drive’s street end, read off the survey’s kerb line.`
  if (k.from === 'state') return `The kerb level, RL ${k.rl.toFixed(2)}, is from the state’s elevation data, about ±0.9 m: type the real one when you have it.`
  return `The kerb level, RL ${k.rl.toFixed(2)}, is worked out from the survey’s level at the boundary (RL ${k.boundary!.toFixed(2)}) down a standard crossing (${pctText(shape.fall)} across the footpath): type the real one to be sure.`
}

// ---------------------------------------------------------------------------
// The drive, worked out

export interface DriveCrossing {
  line: DriveLine
  std: CrossingStandard
  shape: CrossingShape
  kerb: Kerb | null
  /** Garage to gutter, once there's a kerb level and the drive reaches the street. */
  profile: DriveProfile | null
  /** The drive's own grades, garage end to the boundary (or its street end). */
  own: Segment[]
  breaks: GradeBreak[]
  scrape: Scrape | null
}

export function analyseDrive(line: DriveLine, std: CrossingStandard): DriveCrossing {
  const shape = shapeOf(std, line)
  const kerb = line.boundary ? kerbLevel(line, shape) : null
  const profile = kerb ? driveProfile(line.along, kerb.rl, shape) : null
  const own = segmentsOf(profile ? profile.points.filter(p => p.x <= profile.boundary + 1e-6) : simplify(line.along))
  // Without the kerb, the changes of grade on the drive itself and at the garage can still be read.
  const breaks = profile ? gradeBreaks(profile) : gradeBreaks({ points: simplify(line.along), boundary: Infinity, gutter: 0, kerb: 0, boundaryRL: 0, footpathFall: 0 }).filter(b => b.x < (line.along[line.along.length - 1]?.x ?? 0) - 1e-6)
  return { line, std, shape, kerb, profile, own, breaks, scrape: profile ? scrapeAlong(profile, B99, std.road) : null }
}

// ---------------------------------------------------------------------------
// Words

const pctText = (g: number) => `${(Math.abs(g) * 100).toFixed(1).replace(/\.0$/, '')}%`
const oneIn = (g: number) => (Math.abs(g) < 0.005 ? 'level' : `1 in ${(1 / Math.abs(g)).toFixed(1).replace(/\.0$/, '')}`)
/** "1 in 40 (2.5%)": a fall or grade, finer than gradeText for the gentle ones across a footpath. */
export const fallText = (g: number) => (Math.abs(g) < 0.0005 ? 'level (0%)' : `${oneIn(g)} (${pctText(g)})`)
const mm = (m: number) => `${Math.round(Math.abs(m) * 1000)} mm`
const metres = (m: number) => `${m.toFixed(1)} m`

/** Where along the drive a chainage is, in words. */
export function whereText(p: DriveProfile | null, x: number, boundary = p?.boundary ?? Infinity): string {
  const near = 0.6
  if (p && x >= p.gutter - near) return 'at the gutter'
  const top = p?.points.find(q => q.mark === 'layback')
  if (top && Math.abs(x - top.x) < near) return 'at the top of the layback'
  if (Math.abs(x - boundary) < near) return 'at the boundary'
  if (x > boundary) return 'on the footpath'
  if (x < near) return 'at the garage'
  return `${metres(boundary - x)} in from the boundary`
}

const PART: Record<Scrape['part'], string> = { front: 'the front bumper', rear: 'the rear bumper', middle: 'underneath, between the wheels' }

const BREAK_AT = (b: GradeBreak, p: DriveProfile | null) =>
  b.mark === 'garage' || b.x < 0.05 ? 'at the garage' : b.mark === 'boundary' ? 'at the boundary' : p ? whereText(p, b.x) : `${metres(b.x)} from the garage`
const BREAK_TEXT = (b: GradeBreak, p: DriveProfile | null) => `a ${pctText(b.change)} ${b.kind} ${BREAK_AT(b, p)}`

// ---------------------------------------------------------------------------
// The checks

export const DRIVE_CHECKS = ['drive-grade', 'drive-footpath', 'drive-transitions', 'drive-scrape', 'drive-turn'] as const
const TITLES: Record<(typeof DRIVE_CHECKS)[number], string> = {
  'drive-grade': 'Driveway grade',
  'drive-footpath': 'Footpath crossing',
  'drive-transitions': 'Changes of grade',
  'drive-scrape': 'Scraping (B99 car)',
  'drive-turn': 'Turning in (B85 car)',
}

/** Said when the drive's garage end follows the ground: the step up or down to the floor is the one thing not drawn. */
const FLOOR_NOTE = 'Its garage end follows the ground, so the step to the garage floor isn’t checked: give it the garage’s slab level under Levels.'

const SCRAPE_SOURCE = AS('Appendix C (ground clearance template)', 'unverified', '120 mm clearance read (foreword); the car’s size and angles not read')
const TURN_SOURCE = AS('cl 2.6.1 and the B85 car (turning circle)', 'secondary', 'from the 2024 draft’s Appendix A and Table 2.6')

/** Why the crossing can't be checked, as a row: the battle-axe handle, the drive not reaching the street, or no kerb level. */
function cantCheck(line: DriveLine, kerb: Kerb | null): Pick<CheckResult, 'status' | 'value' | 'note'> | null {
  if (line.why === 'battle-axe')
    return {
      status: 'unknown',
      value: 'The crossing is at the end of the access handle',
      note: 'On a battle-axe lot the drive meets the street at the end of the handle, which the survey leaves out. Check it against the council’s crossing drawing.',
    }
  if (line.why === 'not-to-street')
    return { status: 'incomplete', value: 'Draw the drive out to the street boundary to check this.', note: 'Its centreline doesn’t reach the street side of the block.' }
  if (!kerb)
    return {
      status: 'unknown',
      value: 'Needs the kerb level where the drive meets the road',
      note: 'Type it under Earthworks › Driveway (the gutter’s lowest point, from the survey or the council), or place the block under Site › Map to read it from the state’s elevation data.',
    }
  return null
}

/**
 * The crossing checks for one drive. `suffix` tells drives apart when there's more than one. A
 * council's "generally" warns rather than fails, as the other checks do.
 */
export function driveChecks(d: DriveCrossing, suffix = ''): CheckResult[] {
  const { line, std, profile, kerb, shape } = d
  const id = (k: (typeof DRIVE_CHECKS)[number]) => `${k}${suffix ? `:${line.id}` : ''}`
  const title = (k: (typeof DRIVE_CHECKS)[number]) => `${TITLES[k]}${suffix}`
  const out: CheckResult[] = []
  const blocked = cantCheck(line, kerb)
  const guessed = line.guessed ? ' The street side isn’t set, so it’s taken as the side the drive runs to: set it under Lot facts.' : ''
  const kerbNote = kerb ? ` ${kerbText(kerb, shape)}` : ''

  // Grade along the drive, on the property.
  const max = std.maxGrade.max
  const long = d.own.filter(s => s.x1 - s.x0 >= 0.5)
  const steep = (long.length ? long : d.own).reduce<Segment | null>((b, s) => (!b || Math.abs(s.grade) > Math.abs(b.grade) ? s : b), null)
  const end = line.along[line.along.length - 1]?.x ?? 0
  const first = d.own.filter(s => s.x1 > end - 3 + 1e-6).reduce((g, s) => Math.max(g, Math.abs(s.grade)), 0)
  if (steep) {
    const g = Math.abs(steep.grade)
    const status: CheckStatus = g > max + 1e-6 ? (std.maxGrade.generally ? 'warn' : 'fail') : g > NON_SLIP_GRADE + 1e-6 ? 'warn' : 'pass'
    // Where, unless it's most of the drive; and the first 3 m in from the street when that's different.
    const where = steep.x1 - steep.x0 < 0.8 * end ? `, ${steep.x1 > end - 0.6 ? `the ${(steep.x1 - steep.x0).toFixed(1)} m ${line.boundary ? 'inside the boundary' : 'at the street end'}` : `${metres(end - steep.x1)} to ${metres(end - steep.x0)} in from the ${line.boundary ? 'boundary' : 'street end'}`}` : ''
    const entry = gradeText(first) !== gradeText(g) ? `; ${gradeText(first)} over the first 3 m ${line.boundary ? 'inside the boundary' : 'at the street end'}` : ''
    out.push({
      id: id('drive-grade'),
      title: title('drive-grade'),
      status,
      value: `Steepest ${gradeText(g)}${where}${entry}`,
      limit: `Up to ${gradeText(max)}; steeper than 1 in 5 (20%) needs a non-slip finish`,
      note:
        [
          status === 'fail' ? 'Too steep to drive: lower the garage, raise the street end or lengthen the drive.' : null,
          status === 'warn' && g > max ? `The council says “generally”, so a steeper drive needs a case.` : null,
          status === 'warn' && g <= max ? 'Steeper than 1 in 5: give it a broom or exposed finish so tyres grip in the wet.' : null,
          'Down the drive’s centreline on the finished ground, garage end to the boundary.',
          line.floor === null ? FLOOR_NOTE : null,
        ]
          .filter(Boolean)
          .join(' ') + guessed,
      source: std.maxGrade.source,
    })
  }

  // The footpath crossing's fall towards the road.
  const fp = std.footpath
  if (blocked || !profile) out.push({ id: id('drive-footpath'), title: title('drive-footpath'), ...blocked!, source: fp.source })
  else {
    const fall = profile.footpathFall
    const r = rampOf(shape)
    const run = shape.footpath - r.length
    const target = profile.kerb + r.rise + fp.fall * run
    const band = fp.maxFall ?? null
    const wrongWay = fall < -0.0005
    // Judged on the level at the boundary, with a little for building it: 20 mm over the most the
    // council allows, or 50 mm either way of the standard's level where it has no band of its own.
    const off = band !== null ? profile.boundaryRL > profile.kerb + r.rise + band * run + 0.02 : Math.abs(profile.boundaryRL - target) > 0.05
    const tooSteep = !!fp.steepest && fall > fp.steepest.fall + 0.0005
    const status: CheckStatus = wrongWay || tooSteep ? 'fail' : off ? (fp.firm ? 'fail' : 'warn') : 'pass'
    const fix = Math.abs(profile.boundaryRL - target) > 0.01 ? ` To meet the standard crossing, the drive wants to be at about RL ${target.toFixed(2)} at the boundary (it’s RL ${profile.boundaryRL.toFixed(2)}).` : ''
    out.push({
      id: id('drive-footpath'),
      title: title('drive-footpath'),
      status,
      value: wrongWay ? `Falls ${fallText(fall)} towards the lot` : `Falls ${fallText(fall)} to the road over ${run.toFixed(2)} m`,
      limit: band !== null ? `Up to ${fallText(band)} towards the road` : `About ${fallText(fp.fall)} towards the road; the council’s crossing drawing decides`,
      note: [
        wrongWay ? 'Water from the street would run into the drive: the footpath has to fall to the kerb.' : null,
        tooSteep ? `Too steep to walk across: ${fp.steepest!.says}.` : null,
        status === 'warn' && fp.note ? fp.note : null,
        status !== 'pass' ? fix.trim() : null,
        `Across ${shape.footpath.toFixed(1)} m of footpath, from the boundary to the top of the kerb’s layback (${r.length.toFixed(2)} m, ${mm(r.rise)} up from the gutter${fp.assumed ? ', a typical one' : ''}).${kerbNote}${guessed}`,
      ]
        .filter(Boolean)
        .join(' '),
      source: fp.source,
    })
  }

  // Changes of grade: at the garage, along the drive and where it meets the footpath.
  const tr = std.transitions
  const limit = (b: GradeBreak) => (b.kind === 'summit' ? tr.summit : tr.sag)
  const need = d.breaks.filter(b => b.change > limit(b) + 1e-6)
  // Room for each transition: half each side of the change, all of it on the drive side at the garage.
  const segs = profile ? segmentsOf(profile.points) : segmentsOf(simplify(line.along))
  const claims = segs.map(() => 0)
  for (const b of need) {
    const t = tr.length(b.change)
    const i = segs.findIndex(s => Math.abs(s.x0 - b.x) < 1e-6)
    if (i < 0) continue
    if (b.x < 1e-6) claims[i] += t
    else {
      claims[i] += t / 2
      if (i > 0) claims[i - 1] += t / 2
    }
  }
  const short = segs.map((s, i) => ({ s, need: claims[i] })).filter(c => c.need > c.s.x1 - c.s.x0 + 0.05)
  const biggest = d.breaks.reduce<GradeBreak | null>((b, x) => (!b || x.change > b.change ? x : b), null)
  const trLimit = `Over ${pctText(tr.summit)} at a summit or ${pctText(tr.sag)} at a sag needs a transition, about 2 m long (3 m for over 18%)`
  if (blocked && !need.length) out.push({ id: id('drive-transitions'), title: title('drive-transitions'), ...blocked, source: tr.source })
  else {
    const status: CheckStatus = short.length ? 'fail' : need.length ? 'warn' : blocked ? blocked.status : 'pass'
    out.push({
      id: id('drive-transitions'),
      title: title('drive-transitions'),
      status,
      value: need.length
        ? `${need.length > 1 ? 'Transitions' : 'A transition'} needed: ${need.map(b => BREAK_TEXT(b, profile)).join(', ')}`
        : blocked
          ? blocked.value
          : biggest
            ? `Biggest change ${BREAK_TEXT(biggest, profile)}`
            : 'No changes of grade',
      limit: trLimit,
      note: [
        short.length
          ? `No room for ${need.length > 1 ? 'them' : 'it'}: the stretch ${whereText(profile, (short[0].s.x0 + short[0].s.x1) / 2, profile?.boundary ?? end + 100)} is ${(short[0].s.x1 - short[0].s.x0).toFixed(1)} m long and its transitions need ${short[0].need.toFixed(1)} m. Lengthen the drive or bring its levels closer.`
          : null,
        need.length && !short.length ? 'The app draws the drive as straight grades meeting at sharp changes: build a transition (a short stretch at an in-between grade, or a curve) at each one.' : null,
        blocked && need.length ? blocked.note : null,
        line.floor === null ? FLOOR_NOTE : 'From the garage floor (level) to where the drive meets the footpath; the layback and gutter are the council’s standard.',
      ]
        .filter(Boolean)
        .join(' '),
      source: tr.source,
    })
  }

  // Scraping: the B99 template along the long section.
  if (blocked || !d.scrape || !profile) out.push({ id: id('drive-scrape'), title: title('drive-scrape'), ...blocked!, source: SCRAPE_SOURCE })
  else {
    const s = d.scrape
    const where = whereText(profile, s.x)
    const hits = s.clearance < -0.0005
    const fixAt = need.find(b => Math.abs(b.x - s.x) < 2.5)
    out.push({
      id: id('drive-scrape'),
      title: title('drive-scrape'),
      status: hits ? 'fail' : 'pass',
      value: hits ? `Scrapes ${mm(s.clearance)} ${where} (${PART[s.part]})` : `Clears by ${mm(s.clearance)}; tightest ${where}`,
      limit: `${mm(B99.clearance)} under a B99 car (wheelbase ${B99.wheelbase.toFixed(2)} m, overhangs ${B99.front.toFixed(2)} and ${B99.rear.toFixed(2)} m), driving in and reversing in`,
      note: [
        hits && fixAt ? `The change of grade there needs a transition (see Changes of grade), which is what fixes it.` : null,
        hits && !fixAt ? 'Ease the change of grade there, or ask the designer to run the council’s template.' : null,
        `Run along the long section in 50 mm steps, from the garage floor across the footpath and down the layback to the road (rising ${pctText(std.road)} from the gutter). Past the wheels the template’s underside rises at ${B99.approach}° to the bumpers, lower than most cars; the standard’s own angles aren’t read yet.${kerbNote}`,
      ]
        .filter(Boolean)
        .join(' '),
      source: SCRAPE_SOURCE,
    })
  }

  out.push(turnCheck(d, id('drive-turn'), title('drive-turn'), guessed))
  return out
}

/** Turning in from the road and into the garage: what a simple check can say, and never a pass. */
function turnCheck(d: DriveCrossing, id: string, title: string, guessed: string): CheckResult {
  const { line, std, shape } = d
  if (line.why) {
    const b = cantCheck(line, d.kerb ?? { rl: 0, from: 'typed' })!
    return { id, title, ...b, source: TURN_SOURCE }
  }
  const drive = line.width.street
  const atBoundary = std.width.boundary !== null ? Math.min(std.width.boundary, drive) : drive
  const atKerb = std.width.kerb ?? atBoundary + 2 * ASSUMED.splay
  const t: TurnIn = turnIn(B85, { kerbHalf: atKerb / 2, boundaryHalf: atBoundary / 2, footpath: shape.footpath }, ASSUMED.gap)
  const fails: string[] = []
  const checks: string[] = []
  if (!t.fits) fails.push(`a B85 car (${B85.width.toFixed(1)} m wide) can’t turn in at full lock and stay on the crossing: it’s ${atKerb.toFixed(1)} m wide at the kerb and ${atBoundary.toFixed(1)} m at the boundary`)
  else checks.push(`Turning in at full lock from the near side of the road, its inner rear wheel passes ${t.inner.toFixed(2)} m from the drive’s centreline at the kerb (the crossing is ${atKerb.toFixed(1)} m wide there), and it starts with its far side ${t.road.toFixed(1)} m out from the kerb${t.road > ASSUMED.lane ? ', more than a lane, so it swings over the middle of the road' : ''}.`)
  if (t.corner !== null) checks.push(`Its front corner swings ${t.corner.toFixed(1)} m out from the centreline as it crosses the boundary: keep fences, walls and letterboxes clear there.`)
  if (line.width.min < MIN_WIDTH - 0.005) checks.push(`The drive is ${line.width.min.toFixed(2)} m at its narrowest, under the ${MIN_WIDTH.toFixed(1)} m a driveway needs.`)
  const door = line.door
  if (!door) checks.push('No garage door found at the drive’s garage end, so getting into the garage isn’t checked.')
  else {
    if (door.width < B85.width + 0.3) fails.push(`the garage door is ${door.width.toFixed(2)} m wide, too narrow for a ${B85.width.toFixed(1)} m car`)
    else if (door.width < MIN_DOOR) checks.push(`The garage door is ${door.width.toFixed(2)} m wide, under the ${MIN_DOOR.toFixed(1)} m a single garage wants.`)
    if (door.skew > 20) checks.push(`The garage door is turned ${Math.round(door.skew)}° to the drive, so the car turns again to get in: that turn isn’t checked.`)
    else if (door.offset > Math.max(0, (door.width - B85.width) / 2)) checks.push(`The garage door’s middle is ${door.offset.toFixed(2)} m off the drive’s centreline, so the car has to angle in.`)
    else checks.push(`The garage door (${door.width.toFixed(2)} m) is square to the drive.`)
  }
  const status: CheckStatus = fails.length ? 'fail' : 'warn'
  return {
    id,
    title,
    status,
    value: fails.length ? `${fails[0][0].toUpperCase()}${fails[0].slice(1)}` : 'Check with the designer',
    limit: `A B85 car (${B85.length.toFixed(1)} × ${B85.width.toFixed(1)} m, ${B85.circle} m turning circle) in from the road and into the garage; driveways at least ${MIN_WIDTH.toFixed(1)} m wide`,
    note: [
      ...fails.slice(1).map(f => `Also, ${f}.`),
      ...checks,
      `Not checked: a full swept path, bends in the drive, reversing out, the far side of the road, parked cars, and poles or street trees by the crossing.${std.width.kerb === null ? ' The crossing’s width at the kerb is taken as a typical one; the council’s drawing has the real one.' : ''}${guessed}`,
    ].join(' '),
    source: std.width.source ? { ...TURN_SOURCE, clause: `${TURN_SOURCE.clause}; ${std.width.source.clause}` } : TURN_SOURCE,
  }
}

/** Placeholder rows for a plan with no driveway: waitForDesign turns them into "Not drawn yet". */
export function noDriveChecks(std: CrossingStandard): CheckResult[] {
  const src: Record<(typeof DRIVE_CHECKS)[number], Source> = {
    'drive-grade': std.maxGrade.source,
    'drive-footpath': std.footpath.source,
    'drive-transitions': std.transitions.source,
    'drive-scrape': SCRAPE_SOURCE,
    'drive-turn': TURN_SOURCE,
  }
  return DRIVE_CHECKS.map(k => ({ id: k, title: TITLES[k], status: 'pass' as const, source: src[k] }))
}

/** Every drive's crossing checks, against a council's numbers (or AS/NZS 2890.1's alone). */
export function crossingChecks(lines: DriveLine[], council: Council | null): CheckResult[] {
  const std = crossingStandard(council)
  if (!lines.length) return noDriveChecks(std)
  return lines.flatMap((l, i) => driveChecks(analyseDrive(l, std), lines.length > 1 ? ` · ${l.name || `Driveway ${i + 1}`}` : ''))
}

/** Whether a check is one of the driveway crossing checks. */
export const isDriveCheck = (id: string) => DRIVE_CHECKS.some(k => id === k || id.startsWith(`${k}:`))
