// Share › Plans (PDF), Send and 3D print, from Share's sections (src/components/ShareSections.tsx),
// with the DA pack under the plan set (src/da).

import { DaPackSection } from '../../da/DaPackSection'
import { PaperSelect, PdfFurnitureToggle, PdfPlans, PlansContents, PrintDownloads, PrintParts, PrintSettingsFields, SendProject } from '../../components/ShareSections'
import { usePhone } from '../../phone/device'
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
        <DaPackSection {...pdf} />
      </>
    )
  return (
    <>
      <PdfPlans {...pdf} furniture={furniture} onLeaveOut={leaveOut => changePrintPrefs({ leaveOut })} onPaper={paper => changePrintPrefs({ paper })} />
      <DaPackSection {...pdf} />
    </>
  )
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
