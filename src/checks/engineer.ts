// When a retaining wall needs an engineer: one figure for the whole app (the wall panel, the plan's
// flags, the summary strip, Check everything, the suggested and implied walls, the hc-retaining
// check, the How accurate page and the glossary), so they never disagree. Every label reads its
// words from here; src/nav/features.json can't import, so a test holds it to the same figure.

/**
 * A retaining wall holding back more than this needs a professional engineer's certificate:
 * Housing Code cl 3.30, as the hc-retaining check cites (m).
 */
export const ENGINEER_HEIGHT = 0.6

/** Heights are shown to 10 mm: a wall that reads as the figure itself ("0.60 m") is at it, not over it (m). */
const AT_THE_FIGURE = 0.005

/** The figure in words, for labels: "600 mm". */
export const ENGINEER_TEXT = `${Math.round(ENGINEER_HEIGHT * 1000)} mm`

/** Where the figure comes from, for places that aren't the Housing Code's own check. */
export const ENGINEER_SOURCE = 'NSW Housing Code cl 3.30'

/**
 * Does a wall holding back `h` metres need an engineer? Only over the figure, as every label says
 * ("over 600 mm", the Housing Code's "more than 600 mm"): a wall built to sit at 600 mm does not.
 */
export const needsEngineer = (h: number) => h > ENGINEER_HEIGHT + AT_THE_FIGURE

/** The one sentence on it, as the hc-retaining check says it. */
export const ENGINEER_NOTE = `Over ${ENGINEER_TEXT}: needs a professional engineer’s certificate.`

/** The same, for a tooltip or a page that should say whose rule it is and that a council's can differ. */
export const ENGINEER_RULE = `A retaining wall holding back over ${ENGINEER_TEXT} needs a professional engineer’s certificate (${ENGINEER_SOURCE}). A council’s own rule for a DA can differ; Approvals › Checks says so where it does.`
