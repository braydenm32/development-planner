// What the plan's <svg> carries for the keyboard and screen readers (see ./PlanWords.tsx).

export const PLAN_NAME_ID = 'plan-summary'
export const PLAN_HELP_ID = 'plan-help'

/** A picture, named and described by PlanWords, that Tab stops on. */
export const PLAN_CANVAS = { role: 'img', 'aria-labelledby': PLAN_NAME_ID, 'aria-describedby': PLAN_HELP_ID, tabIndex: 0 } as const

/** How far an arrow key moves the plan's view, and with Shift (px on screen). */
export const KEY_PAN = { step: 60, big: 240 }
