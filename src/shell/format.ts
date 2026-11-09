// Number formats the strip and the Overview share with the panels (CALM 8).

/** Floor areas, as the Rooms & areas panel shows them. */
export const m2 = (v: number) => `${v.toFixed(2)} m²`

export { andList } from '../plan/keyNumbers'

/** What's left over after levelling, as the Cut & fill panel words it: "160.2 m³ to take away". */
export const netText = (net: number) => `${Math.abs(net).toFixed(1)} m³ ${net >= 0 ? 'to take away' : 'to bring in'}`

/** Where a number already shows, as a short pointer for a chip: "in the panel" reads as "→ panel". */
export const whereShown = (shown: string) => `→ ${shown.replace(/^(in the|on the|on) /, '')}`
