// Sending the 6-digit codes, through Resend's HTTP API (https://resend.com/docs/api-reference).
// One email, two purposes; plain text with a simple HTML copy, and no links, so it can't be
// mistaken for (or turned into) a phishing link. Without RESEND_API_KEY email sign-in is off.

import type { Env } from './env'

export const RESEND_URL = 'https://api.resend.com/emails'
export const EMAIL_FROM_DEFAULT = 'Contour & Gable <sign-in@contourandgable.com>'

export type CodePurpose = 'verify' | 'signin'

/** Whether this Worker can send codes (and so whether the app offers email at all). */
export const emailOn = (env: Env) => !!env.RESEND_API_KEY?.trim()

/** The email for a code: its subject, plain text and HTML. Nothing in it comes from what someone typed. */
export function codeEmail(code: string, purpose: CodePurpose) {
  const what = purpose === 'signin' ? 'Type it into Contour & Gable to sign in.' : 'Type it into Contour & Gable to add this email to your account.'
  const after = 'It works for 10 minutes. If you didn’t ask for it, you can ignore this email.'
  const text = [`Your Contour & Gable code is ${code}`, '', what, '', after, ''].join('\n')
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#16181b">',
    '<p>Your Contour &amp; Gable code is</p>',
    `<p style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:28px;letter-spacing:4px;font-weight:600;margin:8px 0 16px">${code}</p>`,
    `<p>${esc(what)}</p>`,
    `<p style="color:#6b7077">${esc(after)}</p>`,
    '</div>',
  ].join('')
  return { subject: `${code} is your Contour & Gable code`, text, html }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Why an email didn't go: Resend refused the address itself, or something else. */
export class SendError extends Error {
  badAddress: boolean
  constructor(status: number) {
    // Only the status: the reply can repeat the address, and nothing here should log it or the code.
    super(`Resend refused the email (${status}).`)
    this.name = 'SendError'
    this.badAddress = status === 422
  }
}

/** Send a code. Throws SendError if Resend says no, or the fetch's own error if it can't be reached. */
export async function sendCode(env: Env, to: string, code: string, purpose: CodePurpose): Promise<void> {
  const { subject, text, html } = codeEmail(code, purpose)
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM?.trim() || EMAIL_FROM_DEFAULT, to: [to], subject, text, html }),
  })
  // What it says isn't needed (and could repeat the address): let it go unread.
  await res.body?.cancel().catch(() => {})
  if (!res.ok) throw new SendError(res.status)
}
