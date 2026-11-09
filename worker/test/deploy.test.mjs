import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chooseAccount, deployConfig } from '../deploy/prepare.mjs'

describe('the deploy’s preparation', () => {
  it('uses the account named, or the only one the token can see, and says what to do otherwise', () => {
    expect(chooseAccount('acc1', [{ id: 'acc1' }, { id: 'acc2' }])).toBe('acc1')
    expect(chooseAccount('acc1', [])).toBe('acc1')
    expect(chooseAccount('', [{ id: 'only' }])).toBe('only')
    expect(() => chooseAccount('', [])).toThrow(/CLOUDFLARE_ACCOUNT_ID/)
    expect(() => chooseAccount('', [{ id: 'a' }, { id: 'b' }])).toThrow(/2 Cloudflare accounts/)
    expect(() => chooseAccount('nope', [{ id: 'a' }])).toThrow(/can’t reach/)
  })

  it('fills in the real ids and the account, leaving the rest of wrangler.toml as it is', () => {
    const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
    const out = deployConfig(toml, { accountId: 'acct-id', databaseId: 'db-uuid', kvId: 'kv-id' })
    expect(out).toMatch(/^account_id = "acct-id"$/m)
    expect(out).toMatch(/^database_id = "db-uuid"$/m)
    expect(out).toMatch(/\[\[kv_namespaces\]\]\nbinding = "BLOBS"\nid = "kv-id"/)
    expect(out.indexOf('account_id')).toBeLessThan(out.indexOf('['))
    expect(out).toContain('run_worker_first = ["/api/*"]')
    expect(out).toContain('migrations_dir = "worker/migrations"')
    // The hourly clean-up of deleted accounts, and the free plan's storage limit per person.
    expect(out).toMatch(/^\[triggers\]\ncrons = \["17 \* \* \* \*"\]$/m)
    expect(out).toMatch(/^QUOTA_MB = "50"$/m)
    expect(out).not.toMatch(/0{32}|00000000-0000/)
  })

  it('passes the invite codes and the Resend key to the Worker as secrets, without echoing either', () => {
    const yml = readFileSync(new URL('../../.github/workflows/cloudflare.yml', import.meta.url), 'utf8')
    const step = yml.slice(yml.indexOf('- name: Deploy the Worker'), yml.indexOf('- name: Say where it is'))
    expect(step).toContain('INVITE: ${{ secrets.SIGNUP_INVITE_CODE }}')
    expect(step).toContain('RESEND: ${{ secrets.RESEND_API_KEY }}')
    expect(step).toContain('s.INVITE_CODE = e.INVITE')
    expect(step).toContain('s.RESEND_API_KEY = e.RESEND')
    expect(step).toContain('--secrets-file')
    expect(step).not.toMatch(/\becho\b|\bcat\b|set -x/)
  })
})
