// The wall whose length is being typed on the plan (src/pointer/useDimLabels.tsx), opened by a
// click on its label or from the right-click menu.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'

/** The wall, and where the box sits (house frame): on its label, or where the menu was opened. */
export const useDimEdit = create<{ open: { wall: string; at: Vec2 } | null }>(() => ({ open: null }))

/** Open the box on a wall's length, at a point on the plan. */
export const editWallLength = (wall: string, at: Vec2) => useDimEdit.setState({ open: { wall, at } })
export const closeDimEdit = () => useDimEdit.setState({ open: null })
