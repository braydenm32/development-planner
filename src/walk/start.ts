// Starting a walk-through from anywhere: the 3D view's button, search, or a room's menu and card.
// From the plan it opens the 3D view, which starts the walk once it's ready.

import { switchView } from '../shell/useSite'
import { useWalk } from './walkStore'
import { leavePhotoView, usePhotoView } from '../photoview/store'

/** Walk through the house, in a room (its id) or from the front door. */
export function walkThrough(room: string | null = null) {
  // The photo view gives the camera back first, so the walk starts from the view as it was.
  if (usePhotoView.getState().active) leavePhotoView()
  useWalk.getState().start(room)
  switchView('3d')
}
