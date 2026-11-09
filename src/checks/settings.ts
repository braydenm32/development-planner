import { usePlan } from '../plan/store'
import { DEFAULT_CHECK_SETTINGS, type CheckSettings, type Pathway } from './types'

export const PATHWAYS: { id: Pathway; label: string; long: string }[] = [
  { id: 'cdc', label: 'CDC', long: 'Housing Code (complying development)' },
  { id: 'da', label: 'DA', long: 'Wollongong LEP and DCP (development application)' },
]

/** Change the checks' settings as one undoable step. */
export function setCheckSettings(patch: Partial<CheckSettings>) {
  usePlan.getState().commit(p => ({ ...p, checks: { ...DEFAULT_CHECK_SETTINGS, ...p.checks, ...patch } }))
}
