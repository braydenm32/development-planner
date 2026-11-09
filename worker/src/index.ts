// The Contour & Gable Worker: one origin for the built app (Workers static assets) and its
// API under /api/ (./api.ts), so the session cookie is first-party everywhere (Safari blocks the
// other kind). The main module exports only its handler: workerd refuses anything else here.

import { handleApi } from './api'
import type { Env } from './env'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, env)
    if (env.ASSETS) return env.ASSETS.fetch(req)
    return new Response('Not found', { status: 404 })
  },
}
