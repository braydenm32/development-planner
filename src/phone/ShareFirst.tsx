// Share on a phone: the PDF plans and the project file first, each straight to the
// phone's share sheet (or saved where it has none), and the 3D print after them.

import { useState } from 'react'
import { plansPdfFile, projectFile } from '../components/printFiles'
import { Icon, type IconName } from '../nav/icons'
import { navigate, useRouter } from '../nav/router'
import { tabRoute } from '../nav/route'
import { projectTitle } from '../share/project'
import { ShareLinkRow } from '../share-links/ShareLinks'
import { linkTo } from '../shell/links'
import type { Loaded } from '../shell/useSite'
import { canShareFiles, shareOrSave, type Handed, type ShareKind } from './share'

const WORDS: Record<ShareKind, { icon: IconName; send: string; save: string; what: string }> = {
  pdf: { icon: 'file', send: 'Send PDF plans', save: 'Download PDF plans', what: 'Site, floor and roof plans, to scale' },
  project: { icon: 'send', send: 'Send project file', save: 'Download project file', what: 'The survey and the plan, to open in this app' },
}

export function ShareFirst({ d, only }: { d: Loaded; only?: ShareKind }) {
  const route = useRouter(s => s.route)
  const [said, setSaid] = useState<{ kind: ShareKind; text: string; error?: boolean } | null>(null)
  const sharing = canShareFiles()
  const title = projectTitle(d.plan)

  const hand = async (kind: ShareKind) => {
    setSaid(null)
    try {
      const f =
        kind === 'pdf'
          ? plansPdfFile({ plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth, up: d.view.up, paper: d.printPrefs.paper, pdfFurniture: d.printPrefs.pdfFurniture })
          : await projectFile(d.project, d.plan)
      const r: Handed = await shareOrSave(f, title)
      if (r === 'saved') setSaid({ kind, text: `Saved ${f.name}` })
      else if (r === 'shared') setSaid({ kind, text: 'Sent' })
    } catch (err) {
      setSaid({ kind, text: (err as Error).message || 'That file could not be made.', error: true })
    }
  }

  const kinds: ShareKind[] = only ? [only] : ['pdf', 'project']
  return (
    <div className="share-first">
      {kinds.map((k, i) => (
        <div key={k}>
          <button className={`share-big${i === 0 ? ' first' : ''}`} onClick={() => void hand(k)}>
            <Icon name={WORDS[k].icon} size={20} />
            <span>
              <b>{sharing ? WORDS[k].send : WORDS[k].save}</b>
              <small>{WORDS[k].what}</small>
            </span>
            <Icon name={sharing ? 'phoneShare' : 'download'} size={18} />
          </button>
          {said?.kind === k && (
            <p className={said.error ? 'error' : 'muted small'} role="status">
              {said.text}
            </p>
          )}
        </div>
      ))}
      {!only && <ShareLinkRow />}
      {!only && (
        <a className="share-next" {...linkTo(tabRoute(route, 'share', '3d-print'), r => navigate(r))}>
          <Icon name="print3d" size={18} />
          <span>3D print a model</span>
          <Icon name="chevR" size={16} />
        </a>
      )}
    </div>
  )
}
