// Share › Plans (PDF), Send and 3D print, from Share's sections (src/components/ShareSections.tsx),
// and Approvals › DA pack (src/da), which Plans points to.

import { DaPackSection } from '../../da/DaPackSection'
import { PaperSelect, PdfFurnitureToggle, PdfPlans, PlansContents, PrintDownloads, PrintParts, PrintSettingsFields, SendProject } from '../../components/ShareSections'
import { usePhone } from '../../phone/device'
import { tabRoute } from '../../nav/route'
import { navigate, useRouter } from '../../nav/router'
import { ShareFirst } from '../../phone/ShareFirst'
import type { PrintSettings } from '../../print/build'
import { ShareLinksSection } from '../../share-links/ShareLinks'
import { useLoaded } from '../useSite'
import { Waiting } from './Waiting'

export function PlansTab() {
  const d = useLoaded()
  const phone = usePhone()
  if (!d) return <Waiting />
  const { printPrefs, changePrintPrefs } = d
  const pdf = { plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth, up: d.view.up, paper: printPrefs.paper, pdfFurniture: printPrefs.pdfFurniture, leaveOut: printPrefs.leaveOut }
  const furniture = <PdfFurnitureToggle on={printPrefs.pdfFurniture} onChange={pdfFurniture => changePrintPrefs({ pdfFurniture })} />
  // On a phone the plans and the project file go first, to the share sheet, then the 3D print.
  if (phone)
    return (
      <>
        <ShareFirst d={d} />
        <div className="tool-options">
          <PaperSelect paper={printPrefs.paper} onPaper={paper => changePrintPrefs({ paper })} />
        </div>
        {furniture}
        <PlansContents />
        <DaPackPointer />
      </>
    )
  return (
    <>
      <PdfPlans {...pdf} furniture={furniture} onLeaveOut={leaveOut => changePrintPrefs({ leaveOut })} onPaper={paper => changePrintPrefs({ paper })} />
      <DaPackPointer />
    </>
  )
}

/** The DA pack lives in Approvals now; the plan set still says where, since people look for it here. */
function DaPackPointer() {
  const go = () => {
    const r = useRouter.getState().route
    navigate(tabRoute(r, 'approvals', 'da-pack'))
  }
  return (
    <>
      <h3>DA pack (PDF)</h3>
      <p className="muted small">A concept pack to start a development application with, with title blocks and a checklist. It’s with the checks now.</p>
      <button className="secondary" onClick={go}>
        Open Approvals › DA pack
      </button>
    </>
  )
}

/** Approvals › DA pack: the details for the title blocks, and the download. */
export function DaPackTab() {
  const d = useLoaded()
  if (!d) return <Waiting />
  const { printPrefs } = d
  return <DaPackSection plan={d.plan} survey={d.survey} terrain={d.terrain} earth={d.earth} up={d.view.up} paper={printPrefs.paper} pdfFurniture={printPrefs.pdfFurniture} leaveOut={printPrefs.leaveOut} />
}

export function SendTab() {
  const d = useLoaded()
  const phone = usePhone()
  if (!d) return <Waiting />
  return (
    <>
      <ShareLinksSection />
      {phone && <ShareFirst d={d} only="project" />}
      <SendProject plan={d.plan} project={d.project} onOpenProject={d.openProject} download={!phone} />
    </>
  )
}

export function PrintTab() {
  const d = useLoaded()
  if (!d) return <Waiting />
  const settings = d.printPrefs.settings
  const set = (patch: Partial<PrintSettings>) => d.changePrintPrefs({ settings: { ...settings, ...patch } })
  return (
    <>
      <PrintSettingsFields settings={settings} onChange={set} />
      <PrintParts print={d.print} settings={settings} />
      <PrintDownloads plan={d.plan} settings={settings} print={d.print} />
    </>
  )
}
