// Whether "Check everything" is open, the step it shows, and the item last gone to (so the list
// can say where you are as you work down it). Kept for this visit only.

import { create } from 'zustand'
import type { StepId } from './model'

interface StepsPanel {
  open: boolean
  /** The step opened in the list; null until one is picked, when it opens at the first with something left. */
  step: StepId | null
  /** The item last gone to. */
  last: string | null
}

export const useStepsPanel = create<StepsPanel>(() => ({ open: false, step: null, last: null }))

export const openSteps = () => useStepsPanel.setState({ open: true })
export const closeSteps = () => useStepsPanel.setState({ open: false })
export const toggleSteps = () => useStepsPanel.setState(s => ({ open: !s.open }))
export const showStep = (step: StepId) => useStepsPanel.setState({ step })
export const wentTo = (last: string) => useStepsPanel.setState({ last })
