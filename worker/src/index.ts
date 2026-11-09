// The Contour & Gable Worker: one origin for the built app (Workers static assets) and its
// API under /api/ (./api.ts), so the session cookie is first-party everywhere (Safari blocks the
// other kind), plus an hourly clean-up of deleted accounts and of email codes that ran out. The main module exports only its
// handlers: workerd refuses anything else here.

import { purgeAccounts } from './account'
import { handleApi } from './api'
import { tidyEmailCodes } from './emailAuth'
import type { Env, WaitUntil } from './env'

export default {
  async fetch(req: Request, env: Env, ctx?: WaitUntil): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, env, Date.now(), ctx)
    if (env.ASSETS) return env.ASSETS.fetch(req)
    return new Response('Not found', { status: 404 })
  },

  /** The cron trigger (wrangler.toml): deletes, for good, accounts whose 30 days are up, and email codes that ran out. */
  async scheduled(_controller: unknown, env: Env, ctx: WaitUntil): Promise<void> {
    const now = Date.now()
    ctx.waitUntil(Promise.all([purgeAccounts(env, now), tidyEmailCodes(env, now)]))
  },
}
