// The account itself: what the account sheet shows, and deleting it.
//
//   delete   signed in → the account goes in 30 days. Every browser is signed out, its share
//            links stop opening and nothing more is saved to the cloud. Signing in again in
//            those 30 days (passkey or recovery code) still works, to keep it.
//   keep     signed in, within the 30 days → as it was: saving and its links work again.
//   purge    hourly (the Worker's cron trigger): accounts past their 30 days go for good, with
//            every project, record, blob (D1 and KV), share link, comment on their links,
//            passkey and session of theirs.
//
// Nothing of another account is touched: every statement names the account it works on.

import type { Env } from './env'
import { HttpError, json } from './http'
import { kvKey, quota, storageUsed } from './projects'
import { clearedCookie, requireUser, type User } from './session'

const DAY = 24 * 60 * 60 * 1000
/** How long an account waits between asking to delete it and going for good. */
export const DELETE_DAYS = 30

/**
 * One purge run does at most this much: the free plan allows 50 D1 queries and 50 subrequests
 * per run, and 1,000 KV deletes a day. Hourly, that is still 24 accounts a day.
 */
export const PURGE_ACCOUNTS = 1
export const PURGE_KV_DELETES = 25
/** Blobs looked at in one go while emptying KV. */
const KV_PAGE = 10

/** Saving refuses an account that is being deleted, so nothing new lands in what is about to go. */
export function canSave(user: User): User {
  if (user.deleteAfter !== null)
    throw new HttpError(403, 'account-deleting', 'This account is being deleted, so nothing more is saved to the cloud. Keep it (Cloud saves) to save again. Your work is still on this device.', {
      deleteAfter: user.deleteAfter,
    })
  return user
}

export async function account(env: Env, req: Request, now: number): Promise<Response> {
  const user = await requireUser(env, req, now)
  const keys = await env.DB.prepare('SELECT created, last_used, backed_up FROM credentials WHERE user_id = ? ORDER BY created').bind(user.id).all<{ created: number; last_used: number | null; backed_up: number }>()
  const code = await env.DB.prepare('SELECT created FROM recovery_codes WHERE user_id = ?').bind(user.id).first<{ created: number }>()
  return json({
    user,
    passkeys: keys.results.map(k => ({ created: k.created, lastUsed: k.last_used, synced: !!k.backed_up })),
    recoveryCodeCreated: code?.created ?? null,
    storage: { used: await storageUsed(env, user.id), limit: quota(env) },
    deleteAfter: user.deleteAfter,
  })
}

/**
 * Ask for the account to be deleted, 30 days from now. Signs out every browser, this one too.
 * Asking again while it waits keeps the first date.
 */
export async function deleteAccount(env: Env, req: Request, now: number): Promise<Response> {
  const user = await requireUser(env, req, now)
  const deleteAfter = user.deleteAfter ?? now + DELETE_DAYS * DAY
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET delete_after = ? WHERE id = ? AND delete_after IS NULL').bind(deleteAfter, user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ])
  return json({ deleteAfter }, 200, { 'set-cookie': clearedCookie() })
}

/** Keep an account that is waiting to be deleted (signed in again, within the 30 days). */
export async function keepAccount(env: Env, req: Request, now: number): Promise<Response> {
  const user = await requireUser(env, req, now)
  await env.DB.prepare('UPDATE users SET delete_after = NULL WHERE id = ? AND delete_after > ?').bind(user.id, now).run()
  return json({ user: { ...user, deleteAfter: null } })
}

/**
 * Delete, for good, accounts whose 30 days are up: KV parts first (the blob rows say which keys
 * there are, so each row goes only after its parts), then every row of theirs in one batch. A run
 * that reaches its limit leaves the rest for the next run. Returns the accounts it finished.
 */
export async function purgeAccounts(env: Env, now: number): Promise<string[]> {
  const due = await env.DB.prepare('SELECT id FROM users WHERE delete_after IS NOT NULL AND delete_after <= ? ORDER BY delete_after LIMIT ?').bind(now, PURGE_ACCOUNTS).all<{ id: string }>()
  const done: string[] = []
  let kvLeft = PURGE_KV_DELETES
  for (const { id } of due.results) {
    for (;;) {
      const big = await env.DB.prepare('SELECT hash, got FROM blobs WHERE user_id = ? AND inline IS NULL LIMIT ?').bind(id, KV_PAGE).all<{ hash: string; got: number }>()
      if (!big.results.length) break
      const gone: string[] = []
      for (const b of big.results) {
        // A blob's parts go together; one with more parts than a whole run allows still goes, alone.
        if (b.got > kvLeft && kvLeft < PURGE_KV_DELETES) break
        for (let p = 0; p < b.got; p++) await env.BLOBS.delete(kvKey(id, b.hash, p))
        kvLeft -= b.got
        gone.push(b.hash)
      }
      if (gone.length) await env.DB.prepare(`DELETE FROM blobs WHERE user_id = ? AND hash IN (${gone.map(() => '?').join(', ')})`).bind(id, ...gone).run()
      if (gone.length < big.results.length) return done
    }
    // project_records and blobs don't cascade from users, so they go by name; the rest would
    // cascade, but are named too so nothing depends on the database enforcing it.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM blobs WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM project_records WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM share_comments WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM share_links WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM projects WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM challenges WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(`share-make:${id}`),
      env.DB.prepare('DELETE FROM users WHERE id = ? AND delete_after IS NOT NULL AND delete_after <= ?').bind(id, now),
    ])
    done.push(id)
  }
  return done
}
