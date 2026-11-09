// Spot levels from a text file: rows of easting, northing and RL (and maybe a point number and
// a code), with or without a header, separated by commas, tabs, semicolons or spaces.
//
// Which column is which comes from the header's names when there is one. Without a header it
// is a guess from the values, and the person is asked to confirm it (see src/formats), because
// swapping easting and northing would turn the site round without any error.

import { surveyFromPoints, type SurveyPoints } from './pointsToSurvey'
import type { SavedProject } from './storage'

export type ColumnRole = 'e' | 'n' | 'rl' | 'code' | 'id' | 'skip'

export const COLUMN_LABELS: Record<ColumnRole, string> = {
  e: 'Easting',
  n: 'Northing',
  rl: 'RL (level)',
  code: 'Code',
  id: 'Point number',
  skip: 'Ignore',
}

export interface PointsTable {
  rows: string[][]
  /** The first row holds column names. */
  header: boolean
  delimiter: string
}

export interface ColumnGuess {
  /** One role per column. */
  roles: ColumnRole[]
  /** Names, or values, were clear enough to go ahead without asking. */
  sure: boolean
}

/** Coded points that draw the lot boundary, in the order they were taken. */
const BOUNDARY_CODE = /^(bdy|boundary|bndry|lot|lotbdy|title|cadastral|prop(erty)?|pb|bdry)\d*$/i

const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.trim().replace(/,/g, '')))
const num = (s: string) => Number(s.trim())

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/)
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === delimiter && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Split text into rows and columns. Throws if there is nothing to read. */
export function readTable(text: string): PointsTable {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('//'))
  if (!lines.length) throw new Error('That file is empty.')
  const sample = lines.slice(0, 20)
  const has = (d: string) => sample.filter(l => l.includes(d)).length >= Math.ceil(sample.length / 2)
  const delimiter = has('\t') ? '\t' : has(';') ? ';' : has(',') ? ',' : ' '
  const rows = lines.map(l => splitLine(l, delimiter))
  const width = Math.max(...rows.map(r => r.length))
  if (width < 3) throw new Error('Spot levels need at least three columns: easting, northing and RL.')
  // A header has words and no more than a couple of numbers.
  const first = rows[0]
  const header = first.filter(isNum).length < 2 && first.some(c => /[a-z]/i.test(c))
  return { rows, header, delimiter }
}

const HEADER_NAMES: [ColumnRole, RegExp][] = [
  ['id', /^(id|pt|pts|point|points|pointno|point ?(no|num|number|id|name)|no|num|number|name|pn|stn|station)$/],
  ['e', /^(e|east|easting|eastings|x|e\(m\)|easting\(m\)|e ?\(m\))$/],
  ['n', /^(n|north|northing|northings|y|n\(m\)|northing\(m\)|n ?\(m\))$/],
  ['rl', /^(rl|r\.l\.|z|elev|elevation|level|height|h|ele|elv|reduced ?level|ahd|rl ?\(m\)|z ?\(m\)|elevation ?\(m\))$/],
  ['code', /^(code|codes|desc|description|feature|fc|fcode|note|notes|remark|remarks|comment|label|layer)$/],
]

function columnStats(rows: string[][], c: number) {
  const vals = rows.map(r => r[c] ?? '').filter(v => v !== '')
  const numeric = vals.filter(isNum).map(v => num(v.replace(/,/g, '')))
  const isNumeric = vals.length > 0 && numeric.length >= vals.length * 0.9
  const min = Math.min(...numeric)
  const max = Math.max(...numeric)
  const ints = isNumeric && numeric.every(Number.isInteger)
  const unique = new Set(numeric).size === numeric.length
  const median = numeric.length ? [...numeric].sort((a, b) => a - b)[numeric.length >> 1] : 0
  return { isNumeric, spread: max - min, ints, unique, median, count: vals.length }
}

/** Whether text reads as rows of numbers (three or more numeric columns), as opposed to prose. */
export function looksLikePoints(text: string): boolean {
  try {
    const t = readTable(text)
    const body = t.rows.slice(t.header ? 1 : 0)
    return body.length > 0 && Array.from({ length: Math.max(...t.rows.map(r => r.length)) }, (_, c) => columnStats(body, c)).filter(s => s.isNumeric).length >= 3
  } catch {
    return false
  }
}

/** Which column is which: from header names, else guessed from the values. `sure` is false when the person should confirm. */
export function guessColumns(table: PointsTable): ColumnGuess {
  const width = Math.max(...table.rows.map(r => r.length))
  const body = table.rows.slice(table.header ? 1 : 0)
  const roles: ColumnRole[] = Array(width).fill('skip')
  if (table.header) {
    const used = new Set<ColumnRole>()
    table.rows[0].forEach((name, c) => {
      const key = name.toLowerCase().replace(/[_\s]+/g, ' ').trim()
      for (const [role, re] of HEADER_NAMES) {
        if (re.test(key) && !used.has(role)) {
          roles[c] = role
          used.add(role)
          break
        }
      }
    })
    if (used.has('e') && used.has('n') && used.has('rl')) return { roles, sure: body.length > 0 && columnsAreNumbers(body, roles) }
  }
  // By values. Text columns: the first is a point number, a later one a code.
  const stats = Array.from({ length: width }, (_, c) => columnStats(body, c))
  const numericCols = stats.map((s, c) => (s.isNumeric ? c : -1)).filter(c => c >= 0)
  const guess: ColumnRole[] = Array(width).fill('skip')
  let pool = numericCols.filter(c => roles[c] === 'skip' || !table.header)
  if (table.header) {
    // Keep what the names settled and fill only what's missing.
    for (let c = 0; c < width; c++) guess[c] = roles[c]
    pool = numericCols.filter(c => roles[c] === 'skip')
  }
  const taken = new Set(guess.filter(r => r !== 'skip'))
  // A whole-number, always-different first column of four or more numbers is a point number.
  if (!taken.has('id') && numericCols.length >= 4 && stats[numericCols[0]].ints && stats[numericCols[0]].unique && pool.includes(numericCols[0])) {
    guess[numericCols[0]] = 'id'
    pool = pool.filter(c => c !== numericCols[0])
    taken.add('id')
  }
  const free = pool.filter(c => guess[c] === 'skip')
  // RL is the number that varies least (levels change by metres where coordinates change by hundreds).
  if (!taken.has('rl') && free.length) {
    const rl = [...free].sort((a, b) => stats[a].spread - stats[b].spread)[0]
    guess[rl] = 'rl'
    taken.add('rl')
    free.splice(free.indexOf(rl), 1)
  }
  // Grid coordinates: northing is usually the bigger number (MGA, 7 digits against 6); otherwise it is only a guess.
  let ambiguous = false
  if (!taken.has('e') || !taken.has('n')) {
    const [a, b] = free
    if (a !== undefined && b !== undefined && !taken.has('e') && !taken.has('n')) {
      const [lo, hi] = stats[a].median <= stats[b].median ? [a, b] : [b, a]
      guess[lo] = 'e'
      guess[hi] = 'n'
      ambiguous = !(stats[lo].median >= 100000 && stats[hi].median / (stats[lo].median || 1) >= 3) || table.header
    } else if (a !== undefined) {
      guess[a] = taken.has('e') ? 'n' : 'e'
      ambiguous = true
    }
  }
  // A text column after the numbers is a code, before them a point number.
  for (let c = 0; c < width; c++) {
    if (guess[c] !== 'skip' || stats[c].isNumeric || stats[c].count === 0) continue
    const role: ColumnRole = c < Math.min(...numericCols) && !guess.includes('id') ? 'id' : !guess.includes('code') ? 'code' : 'skip'
    guess[c] = role
  }
  const complete = guess.includes('e') && guess.includes('n') && guess.includes('rl')
  return { roles: guess, sure: complete && !ambiguous && !!numericCols.length && body.length > 0 && columnsAreNumbers(body, guess) }
}

function columnsAreNumbers(body: string[][], roles: ColumnRole[]): boolean {
  return (['e', 'n', 'rl'] as const).every(r => {
    const c = roles.indexOf(r)
    return c >= 0 && columnStats(body, c).isNumeric
  })
}

/** Points and boundary from a table once each column's role is known. Throws a plain message. */
export function pointsFromTable(table: PointsTable, roles: ColumnRole[]): SurveyPoints {
  const col = (r: ColumnRole) => roles.indexOf(r)
  const [ce, cn, cz, cc] = [col('e'), col('n'), col('rl'), col('code')]
  if (ce < 0 || cn < 0 || cz < 0) throw new Error('Pick an easting, a northing and an RL column.')
  if (new Set([ce, cn, cz]).size < 3) throw new Error('Easting, northing and RL need to be three different columns.')
  const body = table.rows.slice(table.header ? 1 : 0)
  const points: [number, number, number][] = []
  const ring: [number, number][] = []
  let skipped = 0
  for (const r of body) {
    const vals = [r[ce], r[cn], r[cz]]
    if (!vals.every(v => v !== undefined && isNum(v))) {
      skipped++
      continue
    }
    const [e, n, z] = vals.map(v => num(v!.replace(/,/g, '')))
    points.push([e, n, z])
    if (cc >= 0 && BOUNDARY_CODE.test((r[cc] ?? '').trim())) ring.push([e, n])
  }
  const notes: string[] = []
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? ' was' : 's were'} left out because the easting, northing or RL wasn’t a number.`)
  const boundaries = ring.length >= 3 ? [ring] : []
  if (!boundaries.length) {
    notes.push('Spot levels only make the ground. There’s no boundary in the file (points coded BDY or BOUNDARY make one), so the outline of the points is used.')
  }
  return { points, boundaries, notes }
}

/** Thrown when the columns need confirming; carries what the confirming step shows. */
export class NeedColumns extends Error {
  readonly fileName: string
  readonly table: PointsTable
  readonly guess: ColumnRole[]
  constructor(fileName: string, table: PointsTable, guess: ColumnRole[]) {
    super(`Which column is which in ${fileName}?`)
    this.fileName = fileName
    this.table = table
    this.guess = guess
  }
}

/** A survey record from text. Throws NeedColumns when the columns aren't certain and none were given. */
export function readPointsCsv(name: string, text: string, confirmed?: { roles: ColumnRole[]; header: boolean }): SavedProject {
  const table = readTable(text)
  if (confirmed) {
    table.header = confirmed.header
    return surveyFromPoints(name, pointsFromTable(table, confirmed.roles))
  }
  const g = guessColumns(table)
  if (!g.sure) throw new NeedColumns(name, table, g.roles)
  return surveyFromPoints(name, pointsFromTable(table, g.roles))
}
