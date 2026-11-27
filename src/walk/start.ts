// Starting a walk-through from anywhere: the 3D view's button, search, or a room's menu and card.
// From the plan it opens the 3D view, which starts the walk once it's ready.

import { switchView } from '../shell/useSite'
import { useWalk } from './walkStore'

/** Walk through the house, in a room (its id) or from the front door. */
export function walkThrough(room: string | null = null) {
  useWalk.getState().start(room)
  switchView('3d')
}
