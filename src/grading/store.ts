// The grading brush's settings while it's in use: Cut, Fill or the eraser, the level it paints to
// and its size. Kept for the session, not with the plan; what it paints goes into the plan.

import { create } from 'zustand'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { housePadRL } from '../plan/platforms'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { BRUSH_DEFAULT, BRUSH_MAX, BRUSH_MIN, type BrushMode } from './model'

/** The key that starts and stops the brush (every other plan letter is taken). */
export const BRUSH_KEY = 'B'

export interface BrushUi {
  /** The brush has the plan: a drag paints. */
  on: boolean
  mode: BrushMode
  /** The level it paints to (RL); none until one is set. */
  rl: number | null
  /** Radius (m). */
  radius: number
  /** The next click on the plan picks the level, from a contour or the ground there. */
  picking: boolean
}

export const useBrush = create<BrushUi>(() => ({ on: false, mode: 'cut', rl: null, radius: BRUSH_DEFAULT, picking: false }))

/** The level to start from: the house pad's, to the 10 mm. */
const startLevel = (plan: Plan | null) => (plan ? Math.round(housePadRL(plan) * 100) / 100 : null)

/** Whether Earthworks › Cut & fill is open. */
export const onCutFill = (r: ReturnType<typeof useRouter.getState>['route']) => r.kind === 'app' && r.area === 'earthworks' && r.tab === 'cut-fill'

/** Pick up the brush: from the panel, the B key or search. Opens Earthworks › Cut & fill on the plan, where the brush lives. */
export function beginBrush(mode?: BrushMode) {
  const r = useRouter.getState().route
  if (!onCutFill(r) || (r.kind === 'app' && r.view !== 'plan')) navigate({ ...tabRoute(r, 'earthworks', 'cut-fill'), view: 'plan' })
  const st = usePlan.getState()
  if (st.tool !== 'select') st.setTool('select')
  useBrush.setState(s => ({ on: true, picking: false, mode: mode ?? s.mode, rl: s.rl ?? startLevel(st.plan) }))
}

/** Put the brush down. */
export const stopBrush = () => useBrush.setState({ on: false, picking: false })

export const setBrushMode = (mode: BrushMode) => useBrush.setState({ mode })

export const setBrushLevel = (rl: number) => {
  if (Number.isFinite(rl)) useBrush.setState({ rl: Math.round(rl * 1000) / 1000, picking: false })
}

export const setBrushRadius = (r: number) => useBrush.setState({ radius: Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(r * 10) / 10)) })

/** Bigger or smaller by a step that suits the size: [ and ]. */
export const stepBrushRadius = (dir: 1 | -1) => {
  const r = useBrush.getState().radius
  setBrushRadius(r + dir * (r < 2 ? 0.25 : r < 5 ? 0.5 : 1))
}

/** The next click picks the level (the brush stays up). */
export const startLevelPick = () => {
  const st = usePlan.getState()
  useBrush.setState(s => ({ on: true, picking: true, rl: s.rl ?? startLevel(st.plan) }))
}
export const stopLevelPick = () => useBrush.setState({ picking: false })
