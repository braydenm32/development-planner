// Batters in words. Earthworks › Cut & fill keeps a batter as its run (1 in N); the "Retaining wall"
// choice stores 0, which means the edge is held up by a wall rather than sloped back, so it's never
// "1 in 0". The checks, the DA pack and Options › Compare all word a batter from here.

/** A batter of 0 (or less) is held by retaining walls, not sloped. */
export const isRetained = (run: number) => !(run > 0)

/** "a 1 in 2 batter", or "a vertical edge" where a retaining wall holds it. */
export const batterText = (run: number) => (isRetained(run) ? 'a vertical edge' : `a 1 in ${run} batter`)

/** Both sides: "Cut 1 in 2, fill 1 in 2", "Cut: held by retaining walls; fill 1 in 2". */
export function battersText(cut: number, fill: number): string {
  if (isRetained(cut) && isRetained(fill)) return 'Cut and fill: held by retaining walls'
  if (isRetained(cut)) return `Cut: held by retaining walls; fill 1 in ${fill}`
  if (isRetained(fill)) return `Cut 1 in ${cut}; fill: held by retaining walls`
  return `Cut 1 in ${cut}, fill 1 in ${fill}`
}
