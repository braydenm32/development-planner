// How big the grid's squares are at a zoom (src/pointer/PlanGrid.tsx draws them).

/** Square sizes (m), smallest first. */
const STEPS = [0.1, 0.5, 1, 5, 10, 50]
/** A square is drawn once it is at least this many pixels across. */
const MIN_PX = 16
/** The bold square that goes with each fine one. */
const BOLD: Record<number, number> = { 0.1: 1, 0.5: 1, 1: 5, 5: 10, 10: 50, 50: 100 }

/** The fine and the bold square size at this zoom (pixels to the metre). */
export function gridSteps(k: number): { fine: number; bold: number } {
  const fine = STEPS.find(s => s * k >= MIN_PX) ?? STEPS[STEPS.length - 1]
  return { fine, bold: BOLD[fine] }
}
