// The end of the selected wall that will move when its length is typed, lit on the plan while
// the length box (or its "End that moves" choice) has focus.

import { create } from 'zustand'
import type { WallEnd } from './wallJoins'

export const useMovingEnd = create<{ at: { wall: string; end: WallEnd } | null }>(() => ({ at: null }))

export const showMovingEnd = (at: { wall: string; end: WallEnd } | null) => useMovingEnd.setState({ at })
