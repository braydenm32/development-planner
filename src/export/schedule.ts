// The door and window schedule: every door, window, opening and garage door on the plan, with
// the floor, the rooms either side of its wall, and its size. Pure, so it is tested without a page.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { planarFaces, roomShape } from '../plan/geometry'
import { OPENING_NAMES, levelById, pointOnWall, sortedLevels, wallDir, wallLength, type OpeningKind, type Plan } from '../plan/model'
import { EXPORT_CAVEAT } from './exportCaveat'

export interface ScheduleRow {
  /** The mark: D1, W1, … numbered in order down the schedule, by kind, so a builder can call one out. */
  id: string
  floor: string
  type: string
  /** Rooms either side of its wall, "Hall / Study"; "Outside" for a wall with no room behind it. */
  room: string
  /** The wall it is in, "External wall, 4.50 m". */
  wall: string
  width: number
  height: number
  /** Height of the bottom above the floor (m). */
  sill: number
}

const MARK: Record<OpeningKind, string> = { door: 'D', window: 'W', opening: 'O', garage: 'G' }
const KIND_ORDER: OpeningKind[] = ['door', 'window', 'opening', 'garage']
/** How far either side of a wall's centreline to look for the rooms it divides (m). */
const SIDE = 0.15

export function doorWindowSchedule(plan: Plan): ScheduleRow[] {
  const levels = sortedLevels(plan)
  const walls = new Map(plan.walls.map(w => [w.id, w]))
  const faces = new Map(levels.map(l => [l.id, planarFaces(plan.walls.filter(w => w.level === l.id))]))
  const rows: ScheduleRow[] = []
  const count: Record<OpeningKind, number> = { door: 0, window: 0, opening: 0, garage: 0 }
  // Floor by floor, then doors before windows, then along the wall order.
  const ordered = plan.openings
    .map(o => ({ o, w: walls.get(o.wall) }))
    .filter((x): x is { o: (typeof plan.openings)[number]; w: NonNullable<typeof x.w> } => !!x.w)
    .sort((a, b) => levels.findIndex(l => l.id === a.w.level) - levels.findIndex(l => l.id === b.w.level) || KIND_ORDER.indexOf(a.o.kind) - KIND_ORDER.indexOf(b.o.kind))
  for (const { o, w } of ordered) {
    const c = pointOnWall(w, o.offset)
    const d = wallDir(w)
    const sides: Vec2[] = [
      [c[0] - d[1] * SIDE, c[1] + d[0] * SIDE],
      [c[0] + d[1] * SIDE, c[1] - d[0] * SIDE],
    ]
    const names: string[] = []
    for (const r of plan.rooms.filter(r => r.level === w.level)) {
      const shape = roomShape(r, faces.get(w.level) ?? [])
      if (shape && sides.some(p => pointInPolygon(p[0], p[1], shape.centre)) && !names.includes(r.name)) names.push(r.name)
    }
    count[o.kind]++
    rows.push({
      id: `${MARK[o.kind]}${count[o.kind]}`,
      floor: levelById(plan, w.level)?.name ?? '',
      type: OPENING_NAMES[o.kind],
      room: names.length ? names.join(' / ') : 'Outside',
      wall: `${w.kind === 'internal' ? 'Internal' : w.kind === 'retaining' ? 'Retaining' : 'External'} wall, ${wallLength(w).toFixed(2)} m`,
      width: o.width,
      height: o.height,
      sill: o.sill,
    })
  }
  return rows
}

/** One CSV field: quoted when it has a comma, quote mark or line break. */
const field = (v: string | number) => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const SCHEDULE_HEAD = ['Mark', 'Floor', 'Type', 'Room', 'Wall', 'Width (mm)', 'Height (mm)', 'Sill height (mm)']

const mm = (m: number) => String(Math.round(m * 1000))

/** The schedule as a CSV file for a spreadsheet: sizes in millimetres, the caveat on the last line. */
export function scheduleCsv(rows: ScheduleRow[]): string {
  const lines = [SCHEDULE_HEAD, ...rows.map(r => [r.id, r.floor, r.type, r.room, r.wall, mm(r.width), mm(r.height), mm(r.sill)])]
  return `${lines.map(l => l.map(field).join(',')).join('\r\n')}\r\n\r\n${field(EXPORT_CAVEAT)}\r\n`
}
