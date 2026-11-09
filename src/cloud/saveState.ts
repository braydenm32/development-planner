// What to say about where the work is saved while not signed in (src/cloud/LocalSave.tsx shows it),
// and the ⌘S / Ctrl+S save. Kept apart from the components so they can be tested on their own.

import type { IconName } from '../nav/icons'
import { projectActions, projectsNow } from '../projects/session'
import { cloudActions, useCloud, type CloudPhase } from './state'

/** The time a save happened: "2:14 pm" today, else "8 Nov". */
export function savedTime(t: number, now = Date.now()): string {
  const d = new Date(t)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (t >= today.getTime()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export interface LocalSaveLook {
  /** On the chip: "Saved in this browser", "Not saved yet". */
  label: string
  /** When, after the label: "2:14 pm". */
  at: string | null
  /** The sentence behind it, with the nudge. */
  detail: string
  icon: IconName
  tone: 'quiet' | 'warn'
  /** Offer Sign in (there's a cloud here to sign in to). */
  signIn: boolean
}

export interface LocalSaveFacts {
  phase: CloudPhase
  /** The open project's last save (its `updated`), or null with none open. */
  saved: number | null
  saveError: string | null
  memoryOnly: boolean
  /** The browser has agreed to keep it (navigator.storage.persist). */
  persisted: boolean | null
}

/** What to say about saving, or null when the sync chip says it (signed in) or there's nothing open. */
export function localSaveLook(f: LocalSaveFacts, now = Date.now()): LocalSaveLook | null {
  if (f.phase === 'signed-in' || f.phase === 'checking') return null
  const signIn = f.phase === 'signed-out'
  if (f.memoryOnly)
    return {
      label: 'Not saving',
      at: null,
      detail: 'This browser isn’t letting the planner save, so this project lasts only until the tab closes. Download a project file to keep it.',
      icon: 'warn',
      tone: 'warn',
      signIn: false,
    }
  if (f.saved === null) return null
  if (f.saveError)
    return {
      label: 'Not saved yet',
      at: null,
      detail: `The last change didn’t save (${f.saveError.replace(/\.$/, '')}). It’s kept and will be tried again with the next one. A backup project file keeps a copy meanwhile.`,
      icon: 'warn',
      tone: 'warn',
      signIn: false,
    }
  const where = signIn ? 'Sign in to save it to the cloud too, or download a backup project file.' : 'Download a backup project file to keep a copy somewhere else.'
  const clear = f.persisted ? '' : ' A browser can clear what sites keep when it runs short of space.'
  return {
    label: 'Saved in this browser',
    at: savedTime(f.saved, now),
    detail: `Saved in this browser at ${savedTime(f.saved, now)}. It’s only on this device.${clear} ${where}`,
    icon: 'check',
    tone: 'quiet',
    signIn,
  }
}

/** ⌘S / Ctrl+S: save what's waiting now, and say where it went. */
export async function saveNow(): Promise<string> {
  await projectActions.flush()
  const p = projectsNow()
  if (p.memoryOnly) return 'This browser isn’t saving. Download a project file to keep your work.'
  if (p.saveError) return `Not saved yet (${p.saveError.replace(/\.$/, '')}). It’s kept and will be tried again.`
  const c = useCloud.getState()
  if (c.phase === 'signed-in' && p.currentId && c.inCloud.includes(p.currentId))
    return (await cloudActions.flush()) ? 'Saved to the cloud.' : 'Saved in this browser. It goes to the cloud when it can.'
  return 'Saved in this browser.'
}
