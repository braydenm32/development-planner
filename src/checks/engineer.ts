// When a retaining wall needs an engineer: one figure for the whole app (the wall panel, the plan's
// flags, the summary strip, the suggested walls and the hc-retaining check), so they never disagree.

/**
 * A retaining wall holding back this much or more needs a professional engineer's certificate:
 * Housing Code cl 3.30, as the hc-retaining check cites (m).
 */
export const ENGINEER_HEIGHT = 0.6

/** The figure in words, for labels: "600 mm". */
export const ENGINEER_TEXT = `${Math.round(ENGINEER_HEIGHT * 1000)} mm`

/** Does a wall holding back `h` metres need an engineer? At the figure itself it does. */
export const needsEngineer = (h: number) => h >= ENGINEER_HEIGHT - 1e-9

/** The one sentence on it, as the hc-retaining check says it. */
export const ENGINEER_NOTE = `Over ${ENGINEER_TEXT}: needs a professional engineer’s certificate.`
