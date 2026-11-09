// What the menu's actions do. Each calls the same code as its button in a panel, with the
// same review steps; ⌘K, the summary strip and the project menu all come here.

import { cloudActions } from '../cloud/state'
import { balanceCutFill } from '../components/planNumbers'
import { downloadPlan, startNewPlan } from '../components/planFile'
import { save3mf, saveDaPack, savePlansPdf, saveProjectFile, saveStls } from '../components/printFiles'
import { saveDxf, savePicture, saveScheduleCsv } from '../export/files'
import { openExample } from '../example/open'
import { startContourPick } from '../flow/store'
import { showHintsAgain } from '../guide/hints'
import { WORDS_ID } from '../guide/sections'
import { openGuide } from '../guide/store'
import type { ActionId } from '../nav/menu'
import { NEW_PROJECT, pageRoute, PROJECTS } from '../nav/route'
import { navigate } from '../nav/router'
import { usePlan, type Tool } from '../plan/store'
import { zoomPlan } from '../plan/viewMemory'
import { pickFile } from '../safety/store'
import { beginSectionLine } from '../sections/SectionMarks'
import { beginBrush } from '../grading/store'
import type { ShellData } from './context'
import { openKeyboardHelp } from './keyboardHelpStore'
import { undoTarget } from './undoTarget'
import { pickTool, planShowing, showPlan, switchView } from './useSite'

export interface ActionContext {
  shell: ShellData
  /** Say what happened, briefly. */
  toast: (msg: string) => void
  openOverview: () => void
  /** The shell's own file inputs; the file actions use the one picker in src/safety instead. */
  pickFile: (kind: 'project' | 'plan') => void
}

/** Run an action. Returns false when it can't run yet (nothing loaded, or the print parts still being made). */
export function runAction(a: ActionId, c: ActionContext): boolean {
  const st = usePlan.getState()
  const { shell } = c
  const plan = st.plan

  if (a.startsWith('tool:')) {
    pickTool(a.slice(5) as Tool)
    return true
  }
  if (a.startsWith('term:')) {
    openGuide(`term-${a.slice(5)}`)
    return true
  }

  switch (a) {
    // The same history as the top bar's buttons (./undoTarget.ts).
    case 'undo':
      undoTarget('undo').undo()
      return true
    case 'redo':
      undoTarget('redo').redo()
      return true
    case 'view-plan':
    case 'view-3d':
      switchView(a === 'view-plan' ? 'plan' : '3d')
      return true
    case 'overview':
      c.openOverview()
      return true
    case 'keyboard-help':
      openKeyboardHelp()
      return true
    case 'balance': {
      const msg = balanceCutFill(shell.earth)
      if (!msg) {
        c.toast('Draw walls on the lowest level, or a concrete slab, to see cut and fill.')
        return false
      }
      c.toast(msg)
      return true
    }
    case 'projects':
      navigate(PROJECTS)
      return true
    case 'new-project':
      navigate(NEW_PROJECT)
      return true
    case 'open-example':
      void openExample()
      return true
    case 'guide':
      openGuide()
      return true
    case 'glossary':
      openGuide(WORDS_ID)
      return true
    // Tips hidden one by one, or all at once, come back; the plan shows where they are.
    case 'plan-tips':
      showHintsAgain()
      if (!planShowing()) showPlan()
      c.toast('Tips on the plan are back on.')
      return true
    // The pages about the app open on their own; Back returns to the project.
    case 'about':
    case 'privacy':
    case 'terms':
    case 'accuracy':
      navigate(pageRoute(a))
      return true
    // Sign in, or the account when signed in. A copy of the app with no cloud (GitHub Pages) says so.
    case 'cloud':
      void cloudActions.openHome().then(ok => ok || c.toast('Signing in isn’t available here: this copy of the planner saves projects in this browser only.'))
      return true
    case 'fit-house':
    case 'fit-block':
      // Fit the plan where it shows; from the 3D view, go to it.
      if (!planShowing()) showPlan()
      st.requestFit(a === 'fit-block' ? 'block' : 'house')
      return true
    case 'zoom-in':
    case 'zoom-out':
      // On the plan; from elsewhere, it shows the plan where it was left.
      if (!planShowing()) showPlan()
      else zoomPlan(a === 'zoom-in' ? 1 : -1)
      return true
    case 'north-up':
      shell.changeUp(shell.view.up === 0 ? 'house' : 0)
      return true
    case 'reset-camera':
      shell.resetCamera()
      return true
    // A picture of whichever canvas is showing.
    case 'save-picture':
      if (plan)
        void savePicture(plan, planShowing() ? 'plan' : '3d').then(err => {
          if (err) c.toast(err)
        })
      return !!plan
    // One Open: a survey, a project file or a plan, each going its own way after a review.
    case 'open-file':
    case 'open-project':
      pickFile('any')
      return true
    case 'import-plan':
      pickFile('plan')
      return true
    case 'replace-survey':
      shell.replaceSurvey()
      return true
  }

  // The rest need the survey and the plan.
  if (!plan || !shell.survey || !shell.terrain) {
    c.toast('That needs the survey and the plan, which are still loading.')
    return false
  }
  switch (a) {
    case 'download-pdf':
      try {
        savePlansPdf({ plan, survey: shell.survey, terrain: shell.terrain, earth: shell.earth, up: shell.view.up, paper: shell.printPrefs.paper, pdfFurniture: shell.printPrefs.pdfFurniture })
        return true
      } catch (err) {
        c.toast((err as Error).message || 'The plans could not be drawn.')
        return false
      }
    case 'download-da-pack':
      try {
        saveDaPack({ plan, survey: shell.survey, terrain: shell.terrain, earth: shell.earth, up: shell.view.up, paper: shell.printPrefs.paper, pdfFurniture: shell.printPrefs.pdfFurniture })
        return true
      } catch (err) {
        c.toast((err as Error).message || 'The DA pack could not be drawn.')
        return false
      }
    case 'download-dxf':
      try {
        saveDxf({ plan, survey: shell.survey, terrain: shell.terrain, earth: shell.earth })
        return true
      } catch (err) {
        c.toast((err as Error).message || 'The DXF could not be written.')
        return false
      }
    case 'download-schedule':
      saveScheduleCsv(plan)
      return true
    case 'download-3mf':
    case 'download-stls': {
      const ok = (a === 'download-3mf' ? save3mf : saveStls)({ plan, settings: shell.printPrefs.settings, print: shell.print })
      if (!ok) c.toast(shell.print.error ?? 'The print parts are still being made. Try again in a moment.')
      return ok
    }
    case 'save-project':
      void saveProjectFile(shell.project, plan)
      return true
    case 'export-plan':
      downloadPlan(plan)
      return true
    case 'new-plan':
      startNewPlan()
      return true
    case 'pick-contour':
      // The next click on a contour sets the active floor's level; it needs the plan.
      if (!planShowing()) showPlan()
      startContourPick()
      return true
    case 'draw-section':
      // Two clicks on the plan; Design › Sections opens beside it to show the drawing.
      beginSectionLine()
      return true
    case 'grade-brush':
      // A drag on the plan paints; Earthworks › Cut & fill opens beside it with the brush's settings.
      beginBrush()
      return true
  }
  return false
}
