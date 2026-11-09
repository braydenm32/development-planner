// The 3D view's Show menu (C18), as data: what it has switched off.

import type { ViewSettings } from '../lib/storage'

/** How many of the Show menu's switches are off, for the house's levels as they are now. */
export function hiddenCount(view: ViewSettings, levels: { id: string }[]): number {
  const hidden = new Set(view.hiddenLevels)
  return (view.showRoof ? 0 : 1) + (view.showTrees ? 0 : 1) + (view.showFurniture ? 0 : 1) + (levels.length > 1 ? levels.filter(l => hidden.has(l.id)).length : 0)
}
