// Before `wrangler deploy` in the Cloudflare workflow: find the Cloudflare account, find or make
// the D1 database and the KV namespace, check the account has a workers.dev address, and write
// wrangler.deploy.toml (gitignored) with their ids. Safe to run again: it only makes what's missing.
//
// Reads CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID when it is set.
// The ids and the workers.dev name are masked in the (public) Actions log.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const API = 'https://api.cloudflare.com/client/v4'
export const KV_TITLE = 'block-and-house-planner-blobs'
const TOKEN_HELP =
  'Make the token in Cloudflare (My Profile › API Tokens) from the “Edit Cloudflare Workers” template, add “D1: Edit”, and save it as the CLOUDFLARE_API_TOKEN repository secret.'

class Stop extends Error {}

/** Which account to deploy to: the one named, or the only one the token can see. */
export function chooseAccount(named, accounts) {
  if (named) {
    const found = accounts.find(a => a.id === named)
    if (accounts.length && !found) throw new Stop('The CLOUDFLARE_ACCOUNT_ID secret names an account this token can’t reach. Check the ID (Cloudflare dashboard › Account home › Account ID), or make the token for that account.')
    return named
  }
  if (accounts.length === 1) return accounts[0].id
  if (!accounts.length) throw new Stop(`The token can’t see any Cloudflare account. ${TOKEN_HELP} Or add the account ID as the CLOUDFLARE_ACCOUNT_ID repository secret.`)
  throw new Stop(`The token can see ${accounts.length} Cloudflare accounts. Add the one to use as the CLOUDFLARE_ACCOUNT_ID repository secret (Cloudflare dashboard › Account home › Account ID).`)
}

/** wrangler.toml with the real ids (and the account), for this deploy only. */
export function deployConfig(toml, { accountId, databaseId, kvId }) {
  const out = toml
    .replace(/^(database_id\s*=\s*)"[^"]*"/m, `$1"${databaseId}"`)
    .replace(/^(\[\[kv_namespaces\]\][^[]*?\nid\s*=\s*)"[^"]*"/m, `$1"${kvId}"`)
  if (out.includes('00000000-0000-4000-8000-000000000000') || out.includes('"00000000000000000000000000000000"')) throw new Stop('wrangler.toml changed shape: the database or KV id couldn’t be filled in.')
  // The account goes before the first table, where wrangler reads top-level keys.
  const at = out.search(/^\[/m)
  return `${out.slice(0, at)}account_id = "${accountId}"\n\n${out.slice(at)}`
}

async function cf(path, init = {}) {
  let res
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json', ...init.headers },
    })
  } catch (e) {
    throw new Stop(`Couldn’t reach Cloudflare (${e.message}). Run the workflow again in a minute.`)
  }
  const body = await res.json().catch(() => null)
  if (!body?.success) {
    const errors = body?.errors ?? []
    const err = new Error(errors.map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`)
    err.status = res.status
    err.codes = errors.map(e => e.code)
    throw err
  }
  return body
}

/** A request that needs a permission the token may lack: say which, plainly. */
async function needs(what, path, init) {
  try {
    return await cf(path, init)
  } catch (e) {
    if (e instanceof Stop) throw e
    if (e.status === 401 || e.status === 403 || e.codes?.includes(10000) || e.codes?.includes(9109))
      throw new Stop(`The Cloudflare token isn’t allowed to ${what}. ${TOKEN_HELP}`)
    throw new Stop(`Cloudflare said no when asked to ${what}: ${e.message}`)
  }
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Stop(`There is no CLOUDFLARE_API_TOKEN secret. ${TOKEN_HELP}`)
  const named = (process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim()
  if (named) console.log(`::add-mask::${named}`)

  // The account.
  let accounts = []
  try {
    accounts = (await cf('/accounts?per_page=50')).result ?? []
  } catch (e) {
    if (!named) throw new Stop(`The token can’t list your Cloudflare accounts (${e.message}). Add the account ID as the CLOUDFLARE_ACCOUNT_ID repository secret, or remake the token: ${TOKEN_HELP}`)
  }
  for (const a of accounts) console.log(`::add-mask::${a.id}`)
  const accountId = chooseAccount(named, accounts)
  const acct = `/accounts/${accountId}`

  // The database.
  const toml = readFileSync('wrangler.toml', 'utf8')
  const dbName = /^database_name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? 'block-and-house-planner'
  const dbs = (await needs('list D1 databases', `${acct}/d1/database?name=${encodeURIComponent(dbName)}&per_page=100`)).result ?? []
  let databaseId = dbs.find(d => d.name === dbName)?.uuid
  if (!databaseId) {
    databaseId = (await needs('make a D1 database', `${acct}/d1/database`, { method: 'POST', body: JSON.stringify({ name: dbName }) })).result.uuid
    console.log(`::add-mask::${databaseId}`)
    console.log(`Made the D1 database “${dbName}”.`)
  } else {
    console.log(`::add-mask::${databaseId}`)
    console.log(`Found the D1 database “${dbName}”.`)
  }

  // The KV namespace.
  let kvId
  for (let page = 1; !kvId; page++) {
    const r = await needs('list KV namespaces', `${acct}/storage/kv/namespaces?per_page=100&page=${page}`)
    kvId = (r.result ?? []).find(n => n.title === KV_TITLE)?.id
    if (kvId || page >= (r.result_info?.total_pages ?? 1)) break
  }
  if (!kvId) {
    kvId = (await needs('make a KV namespace', `${acct}/storage/kv/namespaces`, { method: 'POST', body: JSON.stringify({ title: KV_TITLE }) })).result.id
    console.log(`::add-mask::${kvId}`)
    console.log(`Made the KV namespace “${KV_TITLE}”.`)
  } else {
    console.log(`::add-mask::${kvId}`)
    console.log(`Found the KV namespace “${KV_TITLE}”.`)
  }

  // The workers.dev address the app will have.
  let subdomain
  try {
    subdomain = (await cf(`${acct}/workers/subdomain`)).result?.subdomain
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw new Stop(`The Cloudflare token isn’t allowed to read the workers.dev address. ${TOKEN_HELP}`)
  }
  if (!subdomain)
    throw new Stop('Your Cloudflare account has no workers.dev address yet. Open the Cloudflare dashboard, go to Workers & Pages once (it asks you to choose a name), then run this workflow again.')
  // The repository is public, and so is this log: keep the address out of it (wrangler prints it
  // too), so nobody reading the log can find the app and make the first account before its owner.
  console.log(`::add-mask::${subdomain}`)

  const name = /^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? 'block-and-house-planner'
  writeFileSync('wrangler.deploy.toml', deployConfig(toml, { accountId, databaseId, kvId }))
  const url = `https://${name}.${subdomain}.workers.dev`
  console.log(`The app will be at ${url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.log(`::error title=Cloudflare deploy::${e instanceof Stop ? e.message : `Something went wrong: ${e.message}`}`)
    process.exit(1)
  })
}
