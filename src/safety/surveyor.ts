// The request for the surveyor, offered wherever a survey file can't be read: the fix is nearly
// always a file from them in a form the planner reads, and saying exactly what to ask for saves a
// round of emails.

import { askSurveyor, SURVEYOR_REQUEST } from './files'
import { NOTE_MS, showToast, UNDO_MS } from './store'

/** Copy text to the clipboard. False where the browser won't (no permission, or not a secure page). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The toast link's words. */
export const COPY_REQUEST = 'Copy a request for your surveyor'

async function copyRequest() {
  const ok = await copyText(SURVEYOR_REQUEST)
  // Where it can't be copied, the words are in the toast to copy by hand, for longer.
  showToast(ok ? { text: 'Copied. Paste it into an email to your surveyor.', ms: NOTE_MS } : { text: `Ask your surveyor: “${SURVEYOR_REQUEST}”`, ms: UNDO_MS * 2 })
}

/** A file that couldn't be opened, said in a toast; with the request to copy when a better file is the fix. */
export function sayFileError(e: unknown) {
  const text = (e as Error)?.message || 'That file couldn’t be opened.'
  showToast({ text, link: askSurveyor(e) ? { label: COPY_REQUEST, go: () => void copyRequest() } : undefined })
}
