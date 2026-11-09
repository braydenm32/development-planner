// What the panels need from the app: the survey, the plan's earthworks, the view and print
// settings, and the app's own actions. App owns all of it; the shell only passes it down.

import { createContext, useContext } from 'react'
import type { HoverInfo } from '../components/SiteView'
import type { PrintState } from '../components/ShareSections'
import type { SavedProject, ViewSettings } from '../lib/storage'
import type { LayerInfo, LayerRole, Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Earth } from '../plan/useEarthworks'
import type { PrintPrefs } from '../print/prefs'

export interface ShellData {
  project: SavedProject
  layers: LayerInfo[]
  onRoleChange: (layer: string, role: LayerRole) => void
  /** Null while the survey can't be read; the Site area still shows its layers to fix it. */
  survey: Survey | null
  terrain: Terrain | null
  siteError: string | null
  earth: Earth | null
  view: ViewSettings
  changeView: (v: ViewSettings) => void
  changeUp: (up: 'house' | number) => void
  resetCamera: () => void
  printPrefs: PrintPrefs
  changePrintPrefs: (patch: Partial<PrintPrefs>) => void
  print: PrintState
  hover: HoverInfo | null
  /**
   * Open a file the way the one Open does (src/safety): a project file opens as a new project
   * after a light review, and the one open now stays under All projects.
   */
  openProject: (file: File) => void
  /** Replace the survey: choose a DXF, then a review shows how the block and house line up. */
  replaceSurvey: () => void
}

export const ShellContext = createContext<ShellData | null>(null)

export function useShell(): ShellData {
  const s = useContext(ShellContext)
  if (!s) throw new Error('useShell outside the app shell')
  return s
}
