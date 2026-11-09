// The retaining wall panel's words, in one place so they can be changed together.

/** The labels the panel uses: plain words, the earth behind the wall and the open ground in front. */
export const SIDE_WORDS = {
  earth: 'Ground behind the wall (earth side)',
  open: 'Ground in front (open side)',
  top: 'Top of wall',
  question: 'How high is the earth behind it?',
  details: 'Exact levels and wall details',
} as const

/** The one sentence the panel leads its numbers with: "Holds back 0.60 m of earth; wall 0.70 m high." */
export const holdsBackSentence = (held: number, exposed: number) => `Holds back ${held.toFixed(2)} m of earth; wall ${exposed.toFixed(2)} m high.`

/** What one side of the wall looks like at the section, for its label. */
export interface SideLook {
  /** Uphill, Downhill, or the compass side. */
  slope: string
  /** The level the wall gives this side, in words ("RL 80.45", "house pad, RL 83.70"), or null for none. */
  level: string | null
  /** Most the finished ground is below and above the natural ground along the wall (m, both ≥ 0). */
  cut: number
  fill: number
  /** Which way it mostly goes: the mean of finished less natural (m). */
  net: number
  /** What changed the side when the wall gives it no level ("house pad"), or null. */
  by: string | null
}

/**
 * A side's label under the section, in two lines: the side and its level, then what was done to the
 * ground there, read from the finished ground against the natural ground (so a filled side never
 * says "cut", and a side the house pad cuts never says "kept natural").
 */
export function sideLabel(o: SideLook): { head: string; change: string } {
  const head = o.level ? `${o.slope} · ${o.level}` : o.slope
  const big = (v: number) => v >= 0.03
  let change: string
  if (!big(o.cut) && !big(o.fill)) change = o.level ? 'level with the ground' : 'kept natural'
  else {
    const fill = big(o.fill) && (!big(o.cut) || o.net >= 0)
    const most = (fill ? o.fill : o.cut).toFixed(2)
    change = big(o.cut) && big(o.fill) ? `mostly ${fill ? 'fill' : 'cut'}, up to ${most} m` : `${fill ? 'filled' : 'cut'} ${most} m`
    if (!o.level) change += o.by ? ` by the ${o.by}` : ' by other earthworks'
  }
  return { head, change }
}
