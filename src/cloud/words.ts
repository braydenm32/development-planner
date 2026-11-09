// What the sync chip and the account sheet say, in plain words.

import type { IconName } from '../nav/icons'
import { edited } from '../projects/format'
import type { SyncNotice, SyncState } from './sync'

export interface ChipLook {
  /** One or two words on the chip. */
  label: string
  /** The sentence behind it (the chip's tip, and the top of its popover). */
  detail: string
  icon: IconName
  /** quiet: all is well. warn: something needs him. */
  tone: 'quiet' | 'muted' | 'warn'
}

/** `anyInCloud`: false while none of this device's projects is in the cloud (before the first upload). */
export function chipLook(s: SyncState, anyInCloud = true, now = Date.now()): ChipLook {
  if (s.signedOut)
    return { label: 'Sign in again', detail: 'You’ve been signed out. Changes are kept on this device; sign in again to save them to the cloud.', icon: 'cloudOff', tone: 'warn' }
  if (s.offline)
    return { label: 'Offline', detail: 'Offline. Changes are kept on this device and saved to the cloud when you’re back online.', icon: 'cloudOff', tone: 'muted' }
  if (s.error) return { label: 'Not saved', detail: `The cloud didn’t take the last change: ${s.error.replace(/\.$/, '')}. It’s kept on this device and will be tried again.`, icon: 'warn', tone: 'warn' }
  if (s.busy) return { label: 'Saving…', detail: 'Saving your changes to the cloud.', icon: 'cloud', tone: 'quiet' }
  if (!anyInCloud)
    return { label: 'Signed in', detail: 'Signed in. None of the projects on this device is in the cloud yet: Upload… on All projects sends the ones you choose.', icon: 'cloud', tone: 'muted' }
  return { label: 'Saved', detail: s.lastSynced ? `Saved to the cloud. Last checked ${edited(s.lastSynced, now)}.` : 'Saved to the cloud.', icon: 'cloud', tone: 'quiet' }
}

/** What the sync heard, as the chip's popover lists it (the toast says the same when it happens). */
export function noticeText(n: SyncNotice): string {
  if (n.kind === 'conflict') return `“${n.name}” changed on two devices. Both are kept: the other is “${n.copyName}”.`
  if (n.kind === 'kept-edited') return `“${n.name}” was deleted on another device, but you’d changed it here, so it’s kept.`
  if (n.kind === 'kept-changed') return `“${n.name}” changed on another device, so it wasn’t deleted. It’s back in your projects.`
  return `“${n.name}” was deleted on another device.`
}

/** "3 projects" / "1 project". */
export const projects = (n: number) => `${n} project${n === 1 ? '' : 's'}`

/** "9 December 2026". */
export const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** A size in the cloud, for people: "under 0.1 MB", "3.2 MB", "48 MB". */
export function megabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024
  if (mb < 0.05) return bytes ? 'under 0.1 MB' : '0 MB'
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : Math.round(mb)} MB`
}
