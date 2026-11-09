import type { MapPlace } from './model'

/** How well the survey sits on the lot, in words. */
export function fitWords(p: MapPlace): { text: string; loose: boolean } {
  const cm = (m: number) => (m < 1 ? `${Math.max(1, Math.round(m * 100))} cm` : `${m.toFixed(1)} m`)
  if (p.onGrid) return { text: `Your survey is already on the state’s grid (MGA), so it stays where it is. It sits within about ${cm(p.rms)} of the lot’s lines.`, loose: p.rms > 1.5 }
  const loose = p.rms > 1.5
  return {
    text: loose
      ? `That’s a loose fit: the survey’s boundary sits about ${cm(p.rms)} from the lot’s lines on average. Check it’s the right lot, or nudge it into place.`
      : `The survey’s boundary sits within about ${cm(p.rms)} of the lot’s lines on average${p.worst > 1 ? `, ${cm(p.worst)} at the worst point` : ''}. The state’s lot lines are often a little off, so a few tens of centimetres is normal.`,
    loose,
  }
}


/** The word for picking something on the map: Tap with a finger, Click with a mouse. */
export function pointWord(): 'Tap' | 'Click' {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click'
}
