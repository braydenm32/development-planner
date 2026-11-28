// Where the desktop app keeps files, and which slicer prints go to. Kept in the app's own
// storage (it stays with the app on this computer), with the folders filled in from the app the
// first time: Documents/Contour and Gable/Projects and …/Exports.

import { create } from 'zustand'
import type { DesktopInfo, Slicer } from './bridge'

const KEY = 'cg-desktop'

/** "default": the computer's own app for .3mf files. */
export type SlicerChoice = Slicer | 'default' | null

export interface DesktopSettings {
  info: DesktopInfo | null
  projectsDir: string | null
  exportsDir: string | null
  slicer: SlicerChoice
  /** Write the open project's file into the projects folder as you work, as well as keeping it in the app. */
  keepCopy: boolean
}

type Saved = Pick<DesktopSettings, 'projectsDir' | 'exportsDir' | 'slicer' | 'keepCopy'>

function read(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
  } catch {
    return {}
  }
}

export const useDesktop = create<DesktopSettings>(() => ({ info: null, projectsDir: null, exportsDir: null, slicer: null, keepCopy: true, ...read() }))

/** Change a setting, and keep it. */
export function setDesktop(patch: Partial<Saved>): void {
  useDesktop.setState(patch)
  const { projectsDir, exportsDir, slicer, keepCopy } = useDesktop.getState()
  try {
    localStorage.setItem(KEY, JSON.stringify({ projectsDir, exportsDir, slicer, keepCopy }))
  } catch {
    // Storage refused: the settings last until the app closes.
  }
}

/** The app's own facts and default folders, once it has said them. */
export function setInfo(info: DesktopInfo): void {
  const s = useDesktop.getState()
  useDesktop.setState({ info, projectsDir: s.projectsDir ?? info.projectsDir, exportsDir: s.exportsDir ?? info.exportsDir })
}

export const projectsDir = () => useDesktop.getState().projectsDir ?? useDesktop.getState().info?.projectsDir ?? ''
export const exportsDir = () => useDesktop.getState().exportsDir ?? useDesktop.getState().info?.exportsDir ?? ''

/** A folder as the person would say it: the end of its path ("Exports"). */
export const folderLabel = (dir: string): string => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
