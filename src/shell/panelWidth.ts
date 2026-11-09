// How wide the tab panel and inspector are on a desktop, as shell.css sets them, so
// the plan and the 3D view frame what they show clear of them.

export const PANEL_W = 332
export const INSPECTOR_W = 300

/** Check everything's list down the right of the canvas (src/steps; steps.css sets it from --steps-w). */
export const STEPS_W = 340

/** Site › Features, a retaining wall's card and the sections' drawings have the most to read: they get a wider panel (px). */
export const WIDE_W = 440

/** The tabs whose panel is wide. A retaining wall's card is wide in the inspector too. */
export const WIDE_TABS: ReadonlySet<string> = new Set(['site/features', 'earthworks/retaining-walls', 'design/sections'])

/** The Costs area's panels are wider still: an estimate line has its quantity, rate and amount side by side (px). */
export const COSTS_W = 560

/** The materials card beside the plan on Costs › Estimate (px). */
export const COSTS_ASIDE_W = 360
