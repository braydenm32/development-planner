// Number formats the strip and the Overview share with the panels (CALM 8).
//
// The house rules, so a figure can be matched by eye from one screen to the next (AX-35, LD-27,
// LF-21):
// - Floor and room areas: m² to 2 decimals (`m2`), headings and chips included.
// - The block's own area: whole m² (`siteM2`), as Site › Block, the Overview and the PDF write it.
// - Heights, depths and distances read off the design: metres to 2 decimals. Millimetres are for
//   what is typed or built to (number boxes, wall and opening sizes, lengths drawn on the plan).
// - Levels: always "RL" first, to 2 decimals.
// - Grades: "1 in 7.9 (13%)" (gradeText in src/lib/drape.ts); batters stay "1 in 2".
// - Money: src/costs/format.ts.

/** Floor areas, as the Rooms & areas panel shows them. */
export const m2 = (v: number) => `${v.toFixed(2)} m²`

/** The block's area, in whole square metres: "810 m²". */
export const siteM2 = (v: number) => `${Math.round(v)} m²`

/** To the cent, as an area is shown: totals add the shown values, so a column adds up by hand. */
export const shownArea = (v: number) => Math.round(v * 100) / 100

export { andList } from '../plan/keyNumbers'

/** What's left over after levelling, as the Cut & fill panel words it: "160.2 m³ to take away". */
/** The earth left over when it's no more than the slab's own bed: said plainly, never as a warning. */
export const slabBedText = (net: number, bed: number) => `${Math.abs(net).toFixed(1)} m³ to take away is the slab’s own ${Math.round(bed * 1000)} mm bed (the site scrape under it)`

export const netText = (net: number) => `${Math.abs(net).toFixed(1)} m³ ${net >= 0 ? 'to take away' : 'to bring in'}`

/** Where a number already shows, as a short pointer for a chip: "in the panel" reads as "→ panel". */
export const whereShown = (shown: string) => `→ ${shown.replace(/^(in the|on the|on) /, '')}`
