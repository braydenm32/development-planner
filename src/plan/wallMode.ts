// The Wall tool's two ways of drawing: wall by wall, a click a corner, or a rectangle room in one
// go (two corners make four walls and their room). W picks the first and Shift+W the second.

import { create } from 'zustand'
import { usePlan } from './store'

export type WallMode = 'line' | 'rect'

export const useWallMode = create<{ mode: WallMode }>(() => ({ mode: 'line' }))

export const setWallMode = (mode: WallMode) => useWallMode.setState({ mode })

/** Pick the Wall tool, set to draw rectangle rooms (the tool card's switch, Shift+W and search do this). */
export function pickRectangleRoom() {
  setWallMode('rect')
  usePlan.getState().setTool('wall')
}
