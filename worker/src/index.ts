// The Contour & Gable Worker: one origin for the built app (Workers static assets) and its
// API under /api/ (./api.ts), so the session cookie is first-party everywhere (Safari blocks the
// other kind), plus an hourly clean-up of deleted accounts. The main module exports only its
// handlers: workerd refuses anything else here.

import { purgeAccounts } from './account'
import { handleApi } from './api'
import type { Env } from './env'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, env)
    if (env.ASSETS) return env.ASSETS.fetch(req)
    return new Response('Not found', { status: 404 })
  },

  /** The cron trigger (wrangler.toml): deletes, for good, accounts whose 30 days are up. */
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(purgeAccounts(env, Date.now()))
  },
}
