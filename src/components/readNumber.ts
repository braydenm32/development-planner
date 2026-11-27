// Reading what was typed in a number box (src/components/fields.tsx).

export type NumUnit = 'mm' | 'm' | '°' | 'RL' | 'm²' | ':1' | 'L'

/** What a length box made of what was typed: a value in metres, or what to tell the person. */
export type Reading = { ok: true; value: number; /** Said back while typing ("= 900 mm"), when we read it as something other than plain mm. */ said?: string } | { ok: false; hint: string }

const RANGE_UNIT = (unit: NumUnit) => (unit === 'RL' ? '' : ` ${unit}`)

/**
 * The digits of what was typed, with a thousands comma or space taken out ("12,000" and "12 000"
 * are 12000) and a decimal comma read as a point ("2,4" is 2.4). `grouped` says separators went.
 */
function plainDigits(t: string): { text: string; grouped: boolean } {
  if (/^-?\d{1,3}([,\s  ]\d{3})+(\.\d+)?$/.test(t)) return { text: t.replace(/[,\s  ]/g, ''), grouped: true }
  return { text: /^-?\d*,\d+$/.test(t) ? t.replace(',', '.') : t, grouped: false }
}

/**
 * Read what was typed in a number box. In an mm box a bare whole number is millimetres, whatever
 * its size ("9" is 9 mm). Metres are said outright: an "m" after it ("9m") or a decimal point
 * ("0.9", "9.0"); "mm" says millimetres. `check` gives a reason the value can't be used, or null.
 */
export function readNumber(text: string, unit: NumUnit, exact: boolean, min?: number, max?: number, check?: (v: number) => string | null): Reading {
  const t = text.trim().toLowerCase()
  let v: number
  let said: string | undefined
  /** A bare whole number in an mm box: what it would be if metres were meant. */
  let asMetres: number | undefined
  if (unit === 'mm' && !exact) {
    const m = /^(.*?)\s*(mm|m)?$/.exec(t)
    const d = plainDigits(m?.[1] ?? '')
    if (!m || !/^-?\d*\.?\d+$/.test(d.text)) return { ok: false, hint: 'Enter a number' }
    const n = Number(d.text)
    const metres = m[2] === 'm' || (m[2] === undefined && d.text.includes('.'))
    v = metres ? n : n / 1000
    if (metres || d.grouped) said = `= ${Number((v * 1000).toFixed(1))} mm`
    if (m[2] === undefined && !metres && !d.grouped) asMetres = n
  } else {
    v = parseFloat(plainDigits(t).text)
    if (!Number.isFinite(v)) return { ok: false, hint: 'Enter a number' }
  }
  // The range is in the box's own units (mm for lengths).
  const shown = (x: number) => String(Number(((unit === 'mm' && !exact ? x * 1000 : x)).toFixed(3))) + RANGE_UNIT(unit)
  const inRange = (x: number) => (min === undefined || x >= min - 1e-9) && (max === undefined || x <= max + 1e-9)
  if (min !== undefined && v < min - 1e-9) {
    // A small bare number was probably meant in metres: say how to type that (where the box has a top limit to judge by).
    const metres = asMetres !== undefined && max !== undefined && inRange(asMetres) ? ` (for ${asMetres} m, type ${asMetres}m)` : ''
    return { ok: false, hint: `Min ${shown(min)}${metres}` }
  }
  if (max !== undefined && v > max + 1e-9) return { ok: false, hint: `Max ${shown(max)}` }
  const why = check?.(v)
  if (why) return { ok: false, hint: why }
  return { ok: true, value: v, said }
}
