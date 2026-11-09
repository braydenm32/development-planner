// Replace survey changes the survey, which no history keeps, as well as the plan, which the
// plan's own does. So it also leaves a "file step" here: until anything else changes, the top
// bar's Undo and ⌘Z take the whole replace back (survey, plan and site features together), the
// same as the toast's Undo, rather than only the plan's half of it.

import { create } from 'zustand'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { projectsNow } from '../projects/session'
import { useSiteStore, type SiteData } from '../site/store'

export interface FileStep {
  /** What it was, for the Undo button's tip: "Replace survey". */
  label: string
  project: string
  /** The plan and site features just after it; any later change to either ends the step. */
  plan: Plan | null
  site: SiteData
  undo: () => Promise<void> | void
}

export const useFileStep = create<{ step: FileStep | null }>(() => ({ step: null }))

/** Remember a file change for Undo, as it stands now. */
export function rememberFileStep(step: Omit<FileStep, 'plan' | 'site' | 'project'>) {
  const project = projectsNow().currentId
  if (!project) return
  useFileStep.setState({ step: { ...step, project, plan: usePlan.getState().plan, site: useSiteStore.getState().data } })
}

export const forgetFileStep = () => useFileStep.setState({ step: null })

/** The file step Undo would take back now: only while nothing has changed since. */
export function fileStepNow(): FileStep | null {
  const s = useFileStep.getState().step
  if (!s) return null
  if (s.project !== projectsNow().currentId || s.plan !== usePlan.getState().plan || s.site !== useSiteStore.getState().data) return null
  return s
}

/** Take the file step back (once). */
export async function undoFileStep() {
  const s = fileStepNow()
  if (!s) return
  forgetFileStep()
  await s.undo()
}

// Anything else done since ends it, so a later Undo is that thing's.
usePlan.subscribe((st, prev) => {
  const s = useFileStep.getState().step
  if (s && st.plan !== prev.plan && st.plan !== s.plan) forgetFileStep()
})
useSiteStore.subscribe((st, prev) => {
  const s = useFileStep.getState().step
  if (s && st.data !== prev.data && st.data !== s.site) forgetFileStep()
})
