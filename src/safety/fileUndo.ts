// Replace survey changes the survey, which no history keeps, as well as the plan, which the
// plan's own does. So it also leaves a "file step" here: until anything else changes, the top
// bar's Undo and ⌘Z take the whole replace back (survey, plan and site features together), the
// same as the toast's Undo, rather than only the plan's half of it.
//
// Opening the example or a project file leaves one too (`opened`), so their Undo isn't only in a
// toast that goes after a few seconds: it stays on the top bar's Undo until the next change.

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
  /**
   * It opened the project it is in (the example, a project file). The project settling in as it
   * opens isn't a change, so this one ends with the first undo step made in it instead.
   */
  opened?: boolean
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
  if (s.project !== projectsNow().currentId) return null
  if (!s.opened && (s.plan !== usePlan.getState().plan || s.site !== useSiteStore.getState().data)) return null
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
  if (!s) return
  if (s.opened ? st.past.length > prev.past.length : st.plan !== prev.plan && st.plan !== s.plan) forgetFileStep()
})
useSiteStore.subscribe((st, prev) => {
  const s = useFileStep.getState().step
  if (!s) return
  if (s.opened ? st.past.length > prev.past.length : st.data !== prev.data && st.data !== s.site) forgetFileStep()
})
