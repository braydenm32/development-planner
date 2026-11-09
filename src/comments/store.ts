// Comments on share links, on this page: one side or the other.
//
//   viewer  a shared view (#/view/<token>): the comments this browser may see on the link, Add a
//           comment (tap a spot, write, Send), and the comment being written.
//   owner   the app, signed in: the open project's comments from its links, shown on the plan
//           (the plan key's "Comments from share links") and listed in Share › Send, each to
//           Resolve or Delete (with Undo), and a badge for the new ones.
//
// The plan draws the pins from here (src/comments/PlanComments.tsx), whichever side it is.

import { create } from 'zustand'
import { CloudError, isOffline } from '../cloud/api'
import { showToast } from '../safety/store'
import { useShareLinks } from '../share-links/store'
import { createCommentsApi, type CommentsApi } from './api'
import { commenterToken, ensureCommenterToken } from './commenter'
import { commentProblem, type CommentCounts, type CommentMode, type OwnerComment, type Spot, type ViewerComment } from './model'

const PINS_KEY = 'bhp-comment-pins'

export interface CommentsState {
  side: 'viewer' | 'owner' | null
  /** The comment whose card is open on the plan. */
  open: string | null
  /** What went wrong, in plain words. */
  problem: string | null

  // The viewer's.
  /** The link's token. */
  token: string | null
  /** Who shared it, by the name on their account. */
  sharedBy: string
  mode: CommentMode
  seen: ViewerComment[]
  /** Add a comment was pressed: the next tap on the plan pins it. */
  placing: boolean
  /** The spot pinned, while the comment is written. */
  draft: Spot | null
  sending: boolean
  /** Counts comments sent from this page, for the line that says it went. */
  sent: number

  // The owner's.
  projectId: string | null
  /** The open project's comments, newest first; null until read. */
  comments: OwnerComment[] | null
  counts: CommentCounts
  /** Show them on the plan (the plan key's switch, remembered in this browser). */
  pins: boolean
  /** A comment to bring into view on the plan ("Show on plan"); `n` makes each ask a new one. */
  focus: { id: string; n: number } | null
}

function readPins(): boolean {
  try {
    return localStorage.getItem(PINS_KEY) !== '0'
  } catch {
    return true
  }
}

const initial = (): CommentsState => ({
  side: null,
  open: null,
  problem: null,
  token: null,
  sharedBy: '',
  mode: 'off',
  seen: [],
  placing: false,
  draft: null,
  sending: false,
  sent: 0,
  projectId: null,
  comments: null,
  counts: {},
  pins: readPins(),
  focus: null,
})

export const useComments = create<CommentsState>(initial)

const set = useComments.setState
const get = useComments.getState

let api: CommentsApi = createCommentsApi()

/** For tests: talk to another API. */
export function setCommentsApi(next: CommentsApi) {
  api = next
}

function said(e: unknown): string {
  if (isOffline(e)) return 'You’re offline. Try again when you’re back online.'
  return (e as Error)?.message || 'That didn’t work. Try again.'
}

/** The counts again after a comment changed here: one more or less, new or not. */
function counted(counts: CommentCounts, link: string, total: number, fresh: number): CommentCounts {
  const c = counts[link]
  if (!c) return counts
  return { ...counts, [link]: { ...c, total: Math.max(0, c.total + total), new: Math.max(0, c.new + fresh) } }
}

export const commentActions = {
  // ---- The viewer's ----

  /** A shared view opened: read what this browser may see on the link. */
  async startViewer(token: string, sharedBy: string) {
    if (get().side !== 'viewer' || get().token !== token) set({ ...initial(), side: 'viewer', token, sharedBy })
    else set({ sharedBy })
    await commentActions.loadViewer()
  },

  /** Read the link's setting and comments again (quietly: a blip keeps what shows). */
  async loadViewer() {
    const { token } = get()
    if (!token) return
    try {
      const got = await api.seen(token, commenterToken())
      if (get().token !== token) return
      // Comments turned off meanwhile: whatever was being written can't go now.
      set(s => ({ mode: got.mode, seen: got.comments, ...(got.mode === 'off' ? { placing: false, draft: null } : {}), open: got.comments.some(c => c.id === s.open) || s.open === null ? s.open : null }))
    } catch {
      // The view itself says when a link is off; comments stay as they were.
    }
  },

  /** Add a comment: the next tap on the plan pins it. */
  startPlacing() {
    if (get().mode === 'off') return
    set({ placing: true, draft: null, open: null, problem: null })
  },

  /** Pin it here, and write it. */
  place(spot: Spot) {
    set({ placing: false, draft: spot, open: null, problem: null })
  },

  /** Stop adding a comment, or close the one open. */
  cancel() {
    set({ placing: false, draft: null, problem: null, open: null })
  },

  /** Send the comment written at the spot pinned. True once it has gone. */
  async send(text: string, name: string): Promise<boolean> {
    const { token, draft, sending } = get()
    if (!token || !draft || sending) return false
    const problem = commentProblem(text, name)
    if (problem) {
      set({ problem })
      return false
    }
    set({ sending: true, problem: null })
    try {
      const c = await api.add(token, ensureCommenterToken(), { ...draft, text: text.trim(), name: name.trim() || null })
      if (get().token !== token) return false
      set(s => ({ seen: [...s.seen.filter(x => x.id !== c.id), c], draft: null, sent: s.sent + 1 }))
      return true
    } catch (e) {
      if (e instanceof CloudError && e.code === 'comments-off') set({ mode: 'off' })
      set({ problem: said(e) })
      return false
    } finally {
      set({ sending: false })
    }
  },

  // ---- The owner's ----

  /** Read the open project's comments (again). Not in the cloud: none. */
  async loadOwner(projectId: string) {
    if (get().side === 'viewer') return
    if (get().projectId !== projectId) set({ side: 'owner', projectId, comments: null, counts: {}, open: null, focus: null, problem: null })
    try {
      const got = await api.list(projectId)
      if (get().projectId !== projectId) return
      // A comment deleted here and waiting for its Undo to pass stays out.
      const gone = new Set(hiding)
      set(s => ({ comments: got.comments.filter(c => !gone.has(c.id)), counts: gone.size ? recount(got.comments, got.links, gone) : got.links, open: s.open && got.comments.some(c => c.id === s.open) ? s.open : null }))
    } catch (e) {
      if (get().projectId !== projectId) return
      if (e instanceof CloudError && e.status === 404) set({ comments: [], counts: {} })
      else if (get().comments === null) set({ comments: [] })
    }
  },

  /** No project open, or signed out: nothing to show. */
  clearOwner() {
    if (get().side !== 'owner') return
    set({ projectId: null, comments: null, counts: {}, open: null, focus: null, problem: null })
  },

  /** The plan key's switch. */
  setPins(on: boolean) {
    set({ pins: on, ...(on ? {} : { open: null }) })
    try {
      localStorage.setItem(PINS_KEY, on ? '1' : '0')
    } catch {
      // Remembered for this page only.
    }
  },

  /** Open a comment's card on the plan, or close it. */
  openCard(id: string | null) {
    set({ open: id, ...(id ? { placing: false, draft: null } : {}) })
  },

  /** "Show on plan": switch the pins on, and bring this one into view, open. */
  show(id: string) {
    commentActions.setPins(true)
    set(s => ({ open: id, focus: { id, n: (s.focus?.n ?? 0) + 1 } }))
  },

  /** Resolve a comment (dealt with), or make it new again. */
  async resolve(id: string, resolved: boolean) {
    const { projectId, comments } = get()
    const c = comments?.find(x => x.id === id)
    if (!projectId || !c || (c.resolved !== null) === resolved) return
    const was = c.resolved
    const patch = (r: number | null) =>
      set(s => ({ comments: s.comments?.map(x => (x.id === id ? { ...x, resolved: r } : x)) ?? null, counts: counted(s.counts, c.link, 0, r === null ? 1 : -1), problem: null }))
    patch(resolved ? Date.now() : null)
    try {
      const back = await api.resolve(projectId, id, resolved)
      if (get().projectId === projectId) set(s => ({ comments: s.comments?.map(x => (x.id === id ? back : x)) ?? null }))
    } catch (e) {
      if (get().projectId !== projectId) return
      patch(was)
      set({ problem: said(e) })
    }
  },

  /** Delete a comment: it goes at once, with Undo for a few seconds; then it goes for good. */
  remove(id: string) {
    const { projectId, comments } = get()
    const c = comments?.find(x => x.id === id)
    if (!projectId || !c) return
    hiding.add(id)
    const fresh = c.resolved === null ? 1 : 0
    set(s => ({ comments: s.comments?.filter(x => x.id !== id) ?? null, counts: counted(s.counts, c.link, -1, -fresh), open: s.open === id ? null : s.open, problem: null }))
    const putBack = () => {
      hiding.delete(id)
      if (get().projectId !== projectId) return
      set(s => ({ comments: s.comments && !s.comments.some(x => x.id === id) ? [...s.comments, c].sort((a, b) => b.created - a.created) : s.comments, counts: counted(s.counts, c.link, 1, fresh) }))
    }
    showToast({
      text: 'Comment deleted.',
      undo: putBack,
      settle: () => {
        void api.remove(projectId, id).then(
          () => void hiding.delete(id),
          e => {
            putBack()
            if (get().projectId === projectId) set({ problem: `That comment couldn’t be deleted. ${said(e)}` })
          },
        )
      },
    })
  },

  /** Change a link's comments setting. */
  async setMode(projectId: string, linkId: string, mode: CommentMode) {
    const links = useShareLinks.getState().links
    const before = links?.find(l => l.id === linkId)
    const put = (m: CommentMode | undefined) => {
      const now = useShareLinks.getState()
      if (now.projectId === projectId && now.links) useShareLinks.setState({ links: now.links.map(l => (l.id === linkId ? { ...l, comments: m } : l)) })
    }
    put(mode)
    try {
      const link = await api.setMode(projectId, linkId, mode)
      put(link.comments)
    } catch (e) {
      put(before?.comments)
      useShareLinks.setState({ problem: said(e) })
    }
  },

  /** Forget what went wrong. */
  clearProblem() {
    set({ problem: null })
  },

  /** Leave this page's side (a shared view closed; tests). */
  reset() {
    hiding.clear()
    set(initial())
  },
}

/** Comments deleted here whose Undo hasn't passed yet. */
const hiding = new Set<string>()

/** Counts from the server, less the comments still hidden here. */
function recount(all: OwnerComment[], counts: CommentCounts, gone: Set<string>): CommentCounts {
  let out = counts
  for (const c of all) if (gone.has(c.id)) out = counted(out, c.link, -1, c.resolved === null ? -1 : 0)
  return out
}
