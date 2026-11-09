// The API under /api/. Every request that changes something must carry the X-BHP header and,
// when the browser says where it came from, come from this same origin: a page on another site
// can do neither, so a signed-in browser can't be made to change anything from elsewhere.

import { account, loginOptions, loginVerify, logout, newCode, passkeyOptions, passkeyVerify, recoverOptions, recoverVerify, signupOptions, signupState, signupVerify } from './auth'
import type { Env } from './env'
import { errorResponse, HttpError, json } from './http'
import { commitProject, deleteProject, getBlob, getProject, listProjects, missingBlobs, putBlob } from './projects'
import { readSession, requireUser } from './session'
import { createShare, extendShare, listShares, openShared, PUBLIC_HEADERS, restoreShare, revokeShare, sharedBlob } from './shares'

/** The header the app sends with every change (CSRF guard). */
export const CSRF_HEADER = 'x-bhp'

const SAFE_METHODS = new Set(['GET', 'HEAD'])

function checkSameOrigin(req: Request, url: URL) {
  if (SAFE_METHODS.has(req.method)) return
  if (req.headers.get(CSRF_HEADER) !== '1') throw new HttpError(403, 'csrf', 'This request didn’t come from the app.')
  const origin = req.headers.get('origin')
  if (origin && origin !== url.origin) throw new HttpError(403, 'csrf', 'This request didn’t come from the app.')
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') throw new HttpError(403, 'csrf', 'This request didn’t come from the app.')
}

type Handler = (env: Env, req: Request, now: number, params: string[]) => Promise<Response>

const withUser =
  (fn: (env: Env, req: Request, user: string, now: number, params: string[]) => Promise<Response>): Handler =>
  async (env, req, now, params) =>
    fn(env, req, (await requireUser(env, req, now)).id, now, params)

const ROUTES: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/health$/, async env => json({ ok: true, app: 'block-and-house-planner', api: 1, signup: await signupState(env) })],
  ['GET', /^\/api\/session$/, async (env, req, now) => json({ user: await readSession(env, req, now) })],
  ['POST', /^\/api\/auth\/signup\/options$/, signupOptions],
  ['POST', /^\/api\/auth\/signup\/verify$/, signupVerify],
  ['POST', /^\/api\/auth\/login\/options$/, loginOptions],
  ['POST', /^\/api\/auth\/login\/verify$/, loginVerify],
  ['POST', /^\/api\/auth\/recover\/options$/, recoverOptions],
  ['POST', /^\/api\/auth\/recover\/verify$/, recoverVerify],
  ['POST', /^\/api\/auth\/passkey\/options$/, passkeyOptions],
  ['POST', /^\/api\/auth\/passkey\/verify$/, passkeyVerify],
  ['POST', /^\/api\/auth\/recovery-code$/, newCode],
  ['POST', /^\/api\/auth\/logout$/, (env, req) => logout(env, req)],
  ['GET', /^\/api\/account$/, account],
  ['GET', /^\/api\/projects$/, withUser((env, _req, user) => listProjects(env, user))],
  ['GET', /^\/api\/projects\/([^/]+)$/, withUser((env, _req, user, _now, [id]) => getProject(env, user, id))],
  ['POST', /^\/api\/projects\/([^/]+)\/commit$/, withUser((env, req, user, now, [id]) => commitProject(env, req, user, id, now))],
  ['DELETE', /^\/api\/projects\/([^/]+)$/, withUser((env, req, user, now, [id]) => deleteProject(env, req, user, id, now))],
  ['POST', /^\/api\/blobs\/missing$/, withUser((env, req, user, now) => missingBlobs(env, req, user, now))],
  ['PUT', /^\/api\/blobs\/([^/]+)\/([^/]+)$/, withUser((env, req, user, now, [hash, part]) => putBlob(env, req, user, hash, part, now))],
  ['GET', /^\/api\/blobs\/([^/]+)\/([^/]+)$/, withUser((env, _req, user, _now, [hash, part]) => getBlob(env, user, hash, part))],
  // Share links: the owner's side, signed in.
  ['GET', /^\/api\/projects\/([^/]+)\/shares$/, withUser((env, _req, user, now, [id]) => listShares(env, user, id, now))],
  ['POST', /^\/api\/projects\/([^/]+)\/shares$/, withUser((env, req, user, now, [id]) => createShare(env, req, user, id, now))],
  ['DELETE', /^\/api\/projects\/([^/]+)\/shares\/([^/]+)$/, withUser((env, _req, user, now, [id, link]) => revokeShare(env, user, id, link, now))],
  ['POST', /^\/api\/projects\/([^/]+)\/shares\/([^/]+)\/restore$/, withUser((env, _req, user, now, [id, link]) => restoreShare(env, user, id, link, now))],
  ['POST', /^\/api\/projects\/([^/]+)\/shares\/([^/]+)\/extend$/, withUser((env, _req, user, now, [id, link]) => extendShare(env, user, id, link, now))],
  // …and the viewer's, with the token only (in the X-BHP-Share header). GET only.
  ['GET', /^\/api\/shared$/, (env, req, now) => openShared(env, req, now)],
  ['GET', /^\/api\/shared\/blobs\/([^/]+)\/([^/]+)$/, (env, req, now, [hash, part]) => sharedBlob(env, req, hash, part, now)],
]

/** The viewer's side of share links: every reply, errors too, is never cached, indexed or passed on. */
const isPublic = (path: string) => path === '/api/shared' || path.startsWith('/api/shared/')

function decodePart(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    throw new HttpError(400, 'bad-request', 'The request was not readable.')
  }
}

export async function handleApi(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const res = await route(req, env, now)
  if (isPublic(new URL(req.url).pathname)) for (const [k, v] of Object.entries(PUBLIC_HEADERS)) res.headers.set(k, v)
  return res
}

async function route(req: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(req.url)
  try {
    checkSameOrigin(req, url)
    let pathKnown = false
    for (const [method, path, handler] of ROUTES) {
      const m = path.exec(url.pathname)
      if (!m) continue
      pathKnown = true
      if (method === req.method || (method === 'GET' && req.method === 'HEAD')) return await handler(env, req, now, m.slice(1).map(decodePart))
    }
    throw pathKnown ? new HttpError(405, 'method', 'That isn’t allowed here.') : new HttpError(404, 'not-found', 'There is nothing here.')
  } catch (e) {
    return errorResponse(e)
  }
}
