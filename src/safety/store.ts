// The review sheet and the Undo toast, over every screen. A flow asks for a review and
// waits for the answer; nothing changes until it's confirmed. After a change, a toast offers
// Undo for at least UNDO_MS.

import { create } from 'zustand'
import type { ProjectThumbnail } from '../projects/types'

/** How long an Undo toast stays (ms). Hovering or focusing it keeps it longer. */
export const UNDO_MS = 12_000
/** A message without Undo. */
export const NOTE_MS = 6_000

export interface ReviewChoice {
  id: string
  label: string
  /** One line on what this choice does. */
  detail?: string
  /** The block with the house where this choice puts it. */
  thumb?: ProjectThumbnail | null
}

export interface Review {
  /** What kind of change, for tests and styling. */
  kind: 'replace-survey' | 'import-plan' | 'open-project' | 'new-plan' | 'delete-option'
  /** One question: "Replace your plan with house-plan.json?" */
  title: string
  /** The file it comes from. */
  file?: string
  /** Facts about what comes in: floor area, floors, site area… */
  facts: { label: string; value: string }[]
  /** What will change. */
  changes: string[]
  /** What is kept. */
  kept: string[]
  /** Something to check before going on (a plan landing off the block). */
  warning?: string | null
  /** Ways to line things up; the first is the one we suggest unless `choice` says otherwise. */
  choices?: ReviewChoice[]
  choice?: string
  /** A picture of the result when there are no choices. */
  thumb?: ProjectThumbnail | null
  /** The confirming button's words. */
  confirm: string
  /** Replaces something (a red-free but firm button), rather than only adding. */
  replaces: boolean
}

export interface Toast {
  id: number
  text: string
  /** A quiet link to go and look (Check the layers, after a survey import). The toast stays. */
  link?: { label: string; go: () => void }
  /** Put things back exactly as they were. */
  undo?: () => Promise<void> | void
  /** Runs once when the toast goes without Undo (time ran out, dismissed, or another toast took its place). */
  settle?: () => void
  ms: number
}

interface SafetyState {
  review: (Review & { answer: (choice: string | null) => void }) | null
  toast: Toast | null
  /** A flow is busy (reading a file, saving). */
  busy: boolean
}

/** What the one file picker is for: anything, or only a survey (Replace survey) or a plan (Import plan). */
export type PickMode = 'any' | 'survey' | 'plan'

export const useSafety = create<SafetyState>(() => ({ review: null, toast: null, busy: false }))

const set = useSafety.setState
const get = useSafety.getState

/** Show a review and wait: resolves to the confirmed choice (`'ok'` when there are none), or null if cancelled. */
export function askReview(review: Review): Promise<string | null> {
  // A review already open is cancelled by the new one.
  get().review?.answer(null)
  return new Promise(resolve => {
    const answer = (choice: string | null) => {
      if (get().review?.answer === answer) set({ review: null })
      resolve(choice)
    }
    set({ review: { ...review, choice: review.choice ?? review.choices?.[0]?.id, answer } })
  })
}

/** Pick another choice in the open review (it redraws its picture). */
export function chooseInReview(id: string) {
  const r = get().review
  if (r) set({ review: { ...r, choice: id } })
}

let toastId = 0

/** Show a toast; with `undo`, it offers Undo for at least UNDO_MS. A toast already showing settles first. */
export function showToast(t: { text: string; link?: Toast['link']; undo?: Toast['undo']; settle?: Toast['settle']; ms?: number }): number {
  const old = get().toast
  const id = ++toastId
  set({ toast: { id, text: t.text, link: t.link, undo: t.undo, settle: t.settle, ms: t.ms ?? (t.undo || t.link ? UNDO_MS : NOTE_MS) } })
  old?.settle?.()
  return id
}

/** The toast goes (time ran out, or it was closed): what it offered to undo stays done. */
export function dismissToast(id: number) {
  const t = get().toast
  if (t?.id !== id) return
  set({ toast: null })
  t.settle?.()
}

/** Undo what the toast offers. Resolves once it's put back. */
export async function undoToast(id: number): Promise<void> {
  const t = get().toast
  if (t?.id !== id || !t.undo) return
  set({ toast: null })
  try {
    await t.undo()
  } catch (e) {
    showToast({ text: `That couldn’t be undone: ${(e as Error)?.message || 'storage error'}.` })
  }
}

/** Settle any toast now (the page is closing). */
export function settleToast() {
  const t = get().toast
  if (t) dismissToast(t.id)
}

// The one file picker: a hidden input the layer registers. Browsers open a picker only from
// inside the click (or key press) that asked, so it's clicked straight away, not after a render.

let picker: HTMLInputElement | null = null
let pickMode: PickMode = 'any'

export const ACCEPT: Record<PickMode, string> = {
  any: '.dxf,.json,application/json',
  survey: '.dxf',
  plan: '.json,application/json',
}

export function registerPicker(el: HTMLInputElement | null) {
  picker = el
}

/** Open the file picker. Returns false where there's none (tests, or before the app has drawn). */
export function pickFile(mode: PickMode): boolean {
  pickMode = mode
  if (!picker) return false
  picker.accept = ACCEPT[mode]
  picker.click()
  return true
}

/** What the picker was last opened for. */
export const pickedFor = () => pickMode
