// What is typed while a wall, an outline side or a sketch line is being drawn from a point:
//   4500        a length in mm, towards the pointer
//   4.5 or 4.5m metres, as the number boxes read them (src/components/readNumber.ts)
//   3000<45     a length at an angle: 0° is along the house's x (to the right with the house
//               square on the page), turning anticlockwise, as the tag by the pointer shows it
//   @3000,-500  across and up from the last point, in mm
// One reader for the Wall, Retaining wall, Area, Roof and Sketch tools, so they agree.

import type { Vec2 } from '../lib/geom'
import { readNumber } from '../components/readNumber'

/** The most characters an entry takes. */
const MAX = 16

/**
 * What was typed with one more key, or null when the key isn't part of an entry (so it can be a
 * shortcut, when nothing has been typed yet). `angles` false leaves out `<` and `@` (a circle's radius).
 */
export function typedKey(typed: string, key: string, angles = true): string | null {
  if (key.length !== 1 || typed.length >= MAX) return null
  const k = key.toLowerCase()
  const at = typed.startsWith('@')
  // The part being typed now: after the `<`, the `,` or the `@`.
  const part = typed.slice(Math.max(typed.lastIndexOf('<'), typed.lastIndexOf(','), at ? 0 : -1) + 1)
  const afterAngle = typed.includes('<')
  if (/^[0-9]$/.test(k)) return /m$/.test(part) ? null : typed + k
  if (k === '.') return part.includes('.') || /m$/.test(part) ? null : typed + k
  // A minus sign starts an angle or an offset, never a length.
  if (k === '-') return part === '' && (afterAngle || at) ? typed + k : null
  // m or mm after a length's digits.
  if (k === 'm') return !afterAngle && /\d$|\dm$/.test(part) && !/mm$/.test(part) ? typed + k : null
  if (!angles) return null
  if (k === '<') return !at && !afterAngle && /\d/.test(typed) ? typed + k : null
  if (k === '@') return typed === '' ? '@' : null
  if (k === ',') return at && !typed.includes(',') && /\d/.test(part) ? typed + k : null
  return null
}

/** A typed length in metres ("4500", "4.5", "4.5m", "4500mm"), or null. */
function lengthOf(text: string): number | null {
  const r = readNumber(text, 'mm', false)
  return r.ok ? r.value : null
}

/**
 * Where the entry puts the next point from `a`: at the typed length towards `toward`, at the typed
 * angle, or at the typed offset. Null while it can't be read yet (nothing typed, a zero length).
 */
export function typedPoint(a: Vec2, toward: Vec2, typed: string): Vec2 | null {
  if (typed.startsWith('@')) {
    const [xs, ys] = typed.slice(1).split(',')
    if (ys === undefined) return null
    const x = lengthOf(xs)
    const y = lengthOf(ys)
    if (x === null || y === null || Math.hypot(x, y) < 1e-6) return null
    return [a[0] + x, a[1] + y]
  }
  const [lenText, angText] = typed.split('<')
  const len = lengthOf(lenText)
  if (len === null || !(len > 0)) return null
  let dir: Vec2
  if (angText !== undefined && angText !== '' && angText !== '-') {
    const t = (parseFloat(angText) * Math.PI) / 180
    if (!Number.isFinite(t)) return null
    dir = [Math.cos(t), Math.sin(t)]
  } else {
    const l = Math.hypot(toward[0] - a[0], toward[1] - a[1])
    if (l < 1e-6) return null
    dir = [(toward[0] - a[0]) / l, (toward[1] - a[1]) / l]
  }
  return [a[0] + dir[0] * len, a[1] + dir[1] * len]
}

/** The entry as the tag by the pointer shows it while it's typed: plain mm keeps its unit, the rest read as typed. */
export const typedLabel = (typed: string): string => (/^[0-9]+$/.test(typed) ? `${typed}▌ mm` : `${typed}▌`)
