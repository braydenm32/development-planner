// The open project's share links, for the owner: read when Share › Send shows, made on a tap
// (uploading the project first if it is on this device only) to last 30 days, 90 days or a year,
// extended 30 days at a time, and turned off at once with Undo for a few seconds. Only the link
// just made can be shown again: the cloud keeps no token.

import { create } from 'zustand'
import { CloudError, isOffline } from '../cloud/api'
import { cloudActions, useCloud } from '../cloud/state'
import { showToast } from '../safety/store'
import { shareUrl } from './address'
import { onDay } from '../projects/format'
import { createShareApi, type LinkDays, type ShareApi, type ShareLink } from './api'

export interface ShareLinksState {
  /** The project the list is for. */
  projectId: string | null
  /** Its links that are on, newest first; null until read. */
  links: ShareLink[] | null
  /** Making a link (and uploading the project first, if it has to). */
  making: 'upload' | 'make' | null
  /** What went wrong, in plain words. */
  problem: string | null
  /** The link made last, with its address: shown until another project opens or the page reloads. */
  fresh: { projectId: string; linkId: string; url: string } | null
  /** How long the next link lasts. */
  days: LinkDays
  /** The link being extended now. */
  extending: string | null
}

export const useShareLinks = create<ShareLinksState>(() => ({ projectId: null, links: null, making: null, problem: null, fresh: null, days: 30, extending: null }))

const set = useShareLinks.setState
const get = useShareLinks.getState

let api: ShareApi = createShareApi()

/** For tests: talk to another API. */
export function setShareApi(next: ShareApi) {
  api = next
}

function said(e: unknown): string {
  if (isOffline(e)) return 'You’re offline. Try again when you’re back online.'
  if (e instanceof CloudError && e.status === 401) return 'Sign in again to share a link.'
  return (e as Error)?.message || 'That didn’t work. Try again.'
}

/** Counts the changes made here, so a list read from before one never undoes it on the screen. */
let changes = 0

/** Newest first, each once. */
const sorted = (links: ShareLink[]) => [...new Map(links.map(l => [l.id, l])).values()].sort((a, b) => b.created - a.created)

export const shareLinkActions = {
  /** Read the project's links (again). */
  async load(projectId: string) {
    if (get().projectId !== projectId) set({ projectId, links: null, problem: null, making: null, extending: null })
    const seen = changes
    try {
      const links = await api.list(projectId)
      // A link made or turned off meanwhile: what is on the screen is newer than this list.
      if (seen !== changes) return
      if (get().projectId === projectId) set({ links: sorted(links) })
    } catch (e) {
      // Not in the cloud yet: no links. Otherwise say why the list isn't there.
      if (get().projectId !== projectId) return
      if (e instanceof CloudError && e.status === 404) set({ links: [] })
      else set({ links: get().links ?? [], problem: said(e) })
    }
  },

  /** How long the next link should last. */
  setDays(days: LinkDays) {
    set({ days })
  },

  /** Make a link for the project, putting it in the cloud first if it is on this device only. */
  async make(projectId: string): Promise<boolean> {
    if (get().making) return false
    set({ projectId, problem: null, making: useCloud.getState().inCloud.includes(projectId) ? 'make' : 'upload' })
    try {
      // Anything waiting goes up first, so the link opens what is on this screen.
      const there = await cloudActions.putInCloud(projectId)
      if (!there && !useCloud.getState().inCloud.includes(projectId)) throw new Error('This project couldn’t go to the cloud just now. Try again in a moment.')
      set({ making: 'make' })
      let made
      try {
        made = await api.make(projectId, get().days)
      } catch (e) {
        // On its way up still: say so plainly.
        if (e instanceof CloudError && e.code === 'not-in-cloud') throw new Error('This project is still on its way to the cloud. Try again in a moment.')
        throw e
      }
      changes++
      if (get().projectId !== projectId) return false
      set({ links: sorted([made.link, ...(get().links ?? [])]), fresh: { projectId, linkId: made.link.id, url: shareUrl(made.token) } })
      return true
    } catch (e) {
      if (get().projectId === projectId) set({ problem: said(e) })
      return false
    } finally {
      if (get().projectId === projectId) set({ making: null })
    }
  },

  /** Turn a link off: it stops working at once. The toast offers Undo for a few seconds. */
  async turnOff(projectId: string, link: ShareLink) {
    const before = get().links ?? []
    changes++
    set({ links: before.filter(l => l.id !== link.id), problem: null })
    try {
      await api.turnOff(projectId, link.id)
    } catch (e) {
      if (get().projectId === projectId) set({ links: sorted([link, ...(get().links ?? [])]), problem: said(e) })
      return
    }
    showToast({
      text: 'Link turned off. It no longer opens the project.',
      undo: async () => {
        const back = await api.turnOn(projectId, link.id)
        changes++
        if (get().projectId === projectId) set({ links: sorted([back, ...(get().links ?? [])]) })
      },
    })
  },

  /** Push a link's end 30 days on (to at most a year from now), and say when it now ends. */
  async extend(projectId: string, link: ShareLink) {
    if (get().extending) return
    set({ extending: link.id, problem: null })
    try {
      const next = await api.extend(projectId, link.id)
      changes++
      if (get().projectId !== projectId) return
      set({ links: sorted([next, ...(get().links ?? []).filter(l => l.id !== next.id)]) })
      if (next.expires !== null) showToast({ text: `The link now works until ${onDay(next.expires)}.` })
    } catch (e) {
      if (get().projectId !== projectId) return
      // Ended or turned off elsewhere meanwhile: it isn't a link that works now.
      if (e instanceof CloudError && (e.code === 'link-ended' || e.status === 404)) {
        changes++
        set({ links: (get().links ?? []).filter(l => l.id !== link.id), problem: 'That link has already ended or been turned off. Make a new one instead.' })
      } else set({ problem: said(e) })
    } finally {
      if (get().extending === link.id) set({ extending: null })
    }
  },

  /** Forget what went wrong. */
  clearProblem() {
    set({ problem: null })
  },
}
