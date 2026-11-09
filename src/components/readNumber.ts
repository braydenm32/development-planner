// Reading what was typed in a number box (src/components/fields.tsx).

export type NumUnit = 'mm' | 'm' | '°' | 'RL' | 'm²' | ':1'

/** What a length box made of what was typed: a value in metres, or what to tell the person. */
export type Reading = { ok: true; value: number; /** Said back while typing ("= 900 mm"), when we read it as something other than plain mm. */ said?: string } | { ok: false; hint: string }

const RANGE_UNIT = (unit: NumUnit) => (unit === 'RL' ? '' : ` ${unit}`)

/**
 * Read what was typed in a number box. In an mm box a number with "m" or "mm" after it says what it
 * is, and a bare number under 10 is metres ("0.9" is 900 mm), since nobody means a part of a millimetre.
 */
export function readNumber(text: string, unit: NumUnit, exact: boolean, min?: number, max?: number): Reading {
  const t = text.trim().toLowerCase().replace(',', '.')
  let v: number
  let said: string | undefined
  if (unit === 'mm' && !exact) {
    const m = /^(-?\d*\.?\d+)\s*(mm|m)?$/.exec(t)
    if (!m) return { ok: false, hint: 'Enter a number' }
    const n = Number(m[1])
    const metres = m[2] === 'm' || (m[2] === undefined && Math.abs(n) < 10)
    v = metres ? n : n / 1000
    if (metres) said = `= ${Number((v * 1000).toFixed(1))} mm`
  } else {
    v = parseFloat(t)
    if (!Number.isFinite(v)) return { ok: false, hint: 'Enter a number' }
  }
  // The range is in the box's own units (mm for lengths).
  const shown = (x: number) => String(Number(((unit === 'mm' && !exact ? x * 1000 : x)).toFixed(3))) + RANGE_UNIT(unit)
  if (min !== undefined && v < min - 1e-9) return { ok: false, hint: `Min ${shown(min)}` }
  if (max !== undefined && v > max + 1e-9) return { ok: false, hint: `Max ${shown(max)}` }
  return { ok: true, value: v, said }
}

