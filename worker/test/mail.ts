// Resend, stubbed for tests: the global fetch is replaced so every email the Worker sends is kept
// here (and checked for the shape Resend wants) and nothing reaches the network. Only the Worker
// calls the global fetch in these tests; the browsers in ./fakes.ts call it directly.

import { vi } from 'vitest'

export const RESEND_KEY = 're_test_not_a_real_key'

export interface SentEmail {
  to: string
  from: string
  subject: string
  text: string
  html: string
  authorization: string | null
  contentType: string | null
  method: string
}

export function stubResend() {
  const box = {
    sent: [] as SentEmail[],
    /** What Resend answers: 200, or an error status to see how a refusal is handled. */
    status: 200,
    /** Held, the fetch waits until it's let go (to see the reply doesn't wait for it). */
    hold: null as Promise<void> | null,
    /** The newest code sent to an address. */
    codeFor(to: string): string {
      const mail = box.sent.filter(m => m.to === to).at(-1)
      if (!mail) throw new Error(`No email to ${to}`)
      return /\b(\d{6})\b/.exec(mail.subject)![1]
    },
    to: (to: string) => box.sent.filter(m => m.to === to),
  }
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url !== 'https://api.resend.com/emails') throw new Error(`Tests don’t reach the network (${url})`)
    if (box.hold) await box.hold
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body)) as { from: string; to: string[]; subject: string; text: string; html: string }
    if (!Array.isArray(body.to) || body.to.length !== 1) throw new Error('One address, as an array')
    box.sent.push({ ...body, to: body.to[0], authorization: headers.get('authorization'), contentType: headers.get('content-type'), method: init?.method ?? 'GET' })
    if (box.status !== 200) return new Response(JSON.stringify({ statusCode: box.status, name: 'error', message: `bad ${body.to[0]}` }), { status: box.status })
    return new Response(JSON.stringify({ id: 'email-id' }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetch)
  return Object.assign(box, { fetch })
}
