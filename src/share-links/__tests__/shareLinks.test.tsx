// Read-only share links in the app: the link's address, opening a shared project with only its
// token (the latest revision, its shown records checked against their hashes), the view that
// can't change anything and keeps nothing in this browser, the owner's make / turn off / undo,
// and what each piece shows. Against the Worker in-process, on a synthetic block only.

import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { softPasskey } from '../../../worker/test/authenticator'
import { ORIGIN, testServer } from '../../../worker/test/fakes'
import { CloudError, createCloudApi, OfflineError } from '../../cloud/api'
import { createCloudProjectStore } from '../../cloud/cloudStore'
import { cloudActions, useCloud } from '../../cloud/state'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { AREAS } from '../../nav/menu'
import { areaRoute } from '../../nav/route'
import { LockedFor } from '../../phone/lockedFor'
import { ViewLock } from '../../phone/ViewLock'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { usePlan } from '../../plan/store'
import { useEarthworks } from '../../plan/useEarthworks'
import { projectsNow } from '../../projects/session'
import '../../projects/undoHistory'
import { useSafety, undoToast } from '../../safety/store'
import { OverviewSheet } from '../../shell/OverviewSheet'
import { SummaryStrip } from '../../shell/SummaryStrip'
import { useKeyNumbers, type KeyNumbers } from '../../shell/useKeyNumbers'
import { useSiteStore } from '../../site/store'
import { readShareHash, shareHash, shareUrl, shortLink } from '../address'
import { onDay } from '../../projects/format'
import { createShareApi, type ShareApi, type ShareLink } from '../api'
import { loadShared, troubleOf } from '../load'
import { sharedPlan, showReadOnly, stopReadOnly } from '../readOnly'
import { NO_CLOUD_LINKS, ShareLinksBody, WHO_SEES } from '../ShareLinks'
import { Trouble, Viewer } from '../SharedView'
import { setShareApi, shareLinkActions, useShareLinks, type ShareLinksState } from '../store'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde'
const DAY = 86_400_000

/** Markup as the words a person reads. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ')
    .trim()

/** The labels of every button in some markup. */
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => words(m[1]) || (/aria-label="([^"]*)"/.exec(m[0])?.[1] ?? ''))

const survey = { fileName: 'plane.dxf', dxfText: planeSurvey(), roles: {} }
const placed = (ffl = 84) => ({ ...garageFloor(), placement: { e: 1006, n: 1004, rotation: 0, ffl } })

/** An account on the Worker in-process, its cloud store, and one project with every kind of record. */
async function ownerWithProject() {
  const server = testServer()
  const clock = { t: 1_000_000 }
  const api = createCloudApi({ fetch: server.fetch })
  const key = softPasskey(ORIGIN)
  const o = await api.signupOptions('Sam')
  await api.signupVerify(o.challengeId, await key.create(o.options as never))
  const store = createCloudProjectStore(api, () => clock.t)
  const meta = await store.create({
    name: 'Hill house',
    records: {
      survey,
      plan: placed(),
      prefs: { view: { planGround: true } },
      site: { version: 1, data: { version: 1, features: [], edits: {}, overlays: [], hidden: [], extraDxf: null } },
      history: { version: 1, past: [], present: placed(), future: [] },
      'previous-survey': { fileName: 'old.dxf', dxfText: 'secret', roles: {} },
    },
  })
  const owner = createShareApi({ fetch: server.fetch })
  return { server, store, meta, owner, viewer: () => createShareApi({ fetch: server.browser() }) }
}

describe('the link’s address', () => {
  it('reads the token and the view from the hash, and nothing else', () => {
    expect(readShareHash(`#/view/${TOKEN}`)).toEqual({ token: TOKEN, view: 'plan' })
    expect(readShareHash(`#/view/${TOKEN}?view=3d`)).toEqual({ token: TOKEN, view: '3d' })
    expect(readShareHash(`#/view/${TOKEN}?view=print`)).toEqual({ token: TOKEN, view: 'plan' })
    for (const h of ['', '#/design/plan', '#/view/', '#/view/short', `#/view/${TOKEN}/more`, `#/view/${TOKEN}%20`, `#/projects`]) expect(readShareHash(h), h).toBeNull()
  })

  it('writes it back the same way, and keeps the token in the hash, never the path', () => {
    for (const view of ['plan', '3d'] as const) expect(readShareHash(shareHash({ token: TOKEN, view }))).toEqual({ token: TOKEN, view })
    const url = shareUrl(TOKEN, { origin: 'https://planner.example' }, '/')
    expect(url).toBe(`https://planner.example/#/view/${TOKEN}`)
    expect(new URL(url).pathname).toBe('/')
    expect(shareUrl(TOKEN, { origin: 'https://x.example' }, '/app/')).toBe(`https://x.example/app/#/view/${TOKEN}`)
    expect(shortLink(url)).toBe('planner.example/#/view/AbCdEf…')
  })
})

describe('opening a shared project with only its token', () => {
  it('reads the latest revision: survey, plan, prefs and site, and nothing else', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const shared = await loadShared(viewer(), token)
    expect(shared.sharedBy).toBe('Sam')
    expect(shared.meta.name).toBe('Hill house')
    expect(shared.survey).toEqual(survey)
    expect(shared.plan).toEqual(placed())
    expect(shared.prefs).toEqual({ view: { planGround: true } })
    expect(shared.site?.data.features).toEqual([])
    expect(JSON.stringify(shared)).not.toContain('secret')
    expect(Object.keys(shared).sort()).toEqual(['meta', 'plan', 'prefs', 'revision', 'sharedBy', 'site', 'survey'])
  })

  it('follows the project as it is saved, fetching only what changed', async () => {
    const { store, meta, owner, server } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const browser = server.browser()
    const parts: string[] = []
    const viewerApi = createShareApi({ fetch: browser })
    const api: ShareApi = { ...viewerApi, part: (t, h, p) => (parts.push(h), viewerApi.part(t, h, p)) }
    const cache = new Map<string, unknown>()
    const first = await loadShared(api, token, cache)
    expect(parts).toHaveLength(4)
    await store.save(meta.id, { records: { plan: placed(85) } })
    parts.length = 0
    const second = await loadShared(api, token, cache)
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(second.plan?.placement.ffl).toBe(85)
    expect(parts).toHaveLength(1)
    expect(cache.size).toBe(4)
  })

  it('refuses a record that doesn’t match its hash', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const real = viewer()
    const tampered: ShareApi = { ...real, part: async () => new TextEncoder().encode('{"version":1,"walls":[]}') }
    await expect(loadShared(tampered, token)).rejects.toThrow()
  })

  it('reads the index again, once, when a record goes from under it', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const real = viewer()
    let misses = 1
    let opens = 0
    const api: ShareApi = {
      ...real,
      open: t => (opens++, real.open(t)),
      part: (t, h, p) => (misses-- > 0 ? Promise.reject(new CloudError(404, { error: 'not-found' })) : real.part(t, h, p)),
    }
    expect((await loadShared(api, token)).plan).toEqual(placed())
    expect(opens).toBe(2)
  })

  it('says plainly when the link is off, wrong, slowed down or offline', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token, link } = await owner.make(meta.id, 30)
    await owner.turnOff(meta.id, link.id)
    const off = await loadShared(viewer(), token).catch(e => e)
    expect(troubleOf(off)).toMatchObject({ kind: 'off' })
    const wrong = await loadShared(viewer(), TOKEN).catch(e => e)
    expect(troubleOf(wrong)).toMatchObject({ kind: 'off' })
    expect(troubleOf(new CloudError(429, { error: 'slow-down', message: 'Too many tries.' }))).toEqual({ kind: 'slow', message: 'Too many tries.' })
    expect(troubleOf(new OfflineError()).kind).toBe('offline')
    expect(troubleOf(new Error('boom'))).toEqual({ kind: 'broken', message: 'boom' })
  })

  it('lasts the length asked for, can be extended, and says it has ended once it has', async () => {
    const { meta, owner, viewer, server } = await ownerWithProject()
    const made = (await owner.make(meta.id, 90)).link
    expect(made.expires).toBe(made.created + 90 * DAY)
    const { token, link } = await owner.make(meta.id, 30)
    expect(link.expires).toBe(link.created + 30 * DAY)
    const longer = await owner.extend(meta.id, link.id)
    expect(longer.expires).toBe(link.created + 60 * DAY)
    expect((await owner.list(meta.id)).map(l => l.expires).sort()).toEqual([made.expires, longer.expires].sort())

    server.clock.now = longer.expires!
    const ended = await loadShared(viewer(), token).catch(e => e)
    expect(troubleOf(ended)).toEqual({ kind: 'off', message: 'This link has ended. Links work for a set time, then stop.' })
    expect(words(renderToStaticMarkup(<Trouble trouble={troubleOf(ended)} retry={() => {}} />))).toContain('This link has ended.')
  })

  it('sends the token in a header with no cookie, never in the address', async () => {
    const seen: Request[] = []
    const api = createShareApi({ base: 'https://planner.example/api/', fetch: async (input, init) => (seen.push(new Request(input, init)), new Response('{}')) })
    await api.open(TOKEN)
    await api.part(TOKEN, 'a'.repeat(64), 0).catch(() => {})
    for (const r of seen) {
      expect(r.url).not.toContain(TOKEN)
      expect(r.headers.get('x-bhp-share')).toBe(TOKEN)
      expect(r.method).toBe('GET')
      expect(r.credentials).toBe('omit')
      expect(r.referrerPolicy).toBe('no-referrer')
    }
  })
})

describe('the shared view changes nothing and keeps nothing here', () => {
  afterEach(() => stopReadOnly())

  it('puts back any change to the plan or the site features at once, with no undo steps', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const shared = await loadShared(viewer(), token)
    showReadOnly(shared)
    const plan = usePlan.getState().plan!
    expect(plan.name).toBe('Hill house')
    expect(plan).toEqual(sharedPlan(shared))

    usePlan.getState().commit(p => ({ ...p, walls: [] }))
    usePlan.getState().beginGesture()
    usePlan.getState().preview(p => ({ ...p, placement: { ...p.placement, ffl: 99 } }))
    usePlan.getState().endGesture()
    usePlan.getState().undo()
    expect(usePlan.getState().plan).toBe(plan)
    expect(usePlan.getState().past).toEqual([])
    expect(usePlan.getState().future).toEqual([])

    const data = useSiteStore.getState().data
    useSiteStore.getState().commit(d => ({ ...d, hidden: ['tree'] }))
    useSiteStore.getState().setTool('easement' as never)
    expect(useSiteStore.getState().data).toBe(data)
    expect(useSiteStore.getState().tool).toBeNull()
    expect(useSiteStore.getState().past).toEqual([])

    // Floors can still be looked at.
    usePlan.getState().setActiveLevel(plan.levels[0].id)
    expect(usePlan.getState().activeLevel).toBe(plan.levels[0].id)

    // Once it closes, the stores are the app's again.
    stopReadOnly()
    usePlan.getState().commit(p => ({ ...p, walls: [] }))
    expect(usePlan.getState().plan?.walls).toEqual([])
  })

  it('puts the shared project in the stores after drawing, never while drawing', async () => {
    // A store changed in the middle of a render changes the strip and the numbers reading it
    // mid-render too: React's "Cannot update a component while rendering a different component".
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const shared = await loadShared(viewer(), token)
    usePlan.getState().load(null)
    const plan = usePlan.getState()
    const site = useSiteStore.getState().data
    const error = vi.spyOn(console, 'error')
    renderToStaticMarkup(<Viewer shared={shared} view="plan" setView={() => {}} />)
    expect(usePlan.getState()).toBe(plan)
    expect(useSiteStore.getState().data).toBe(site)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('writes nothing to this browser’s projects (IndexedDB) or anywhere else', async () => {
    const { meta, owner, viewer } = await ownerWithProject()
    const { token } = await owner.make(meta.id, 30)
    const open = vi.spyOn(indexedDB, 'open')
    const shared = await loadShared(viewer(), token)
    showReadOnly(shared)
    usePlan.getState().commit(p => ({ ...p, walls: [] }))
    useSiteStore.getState().commit(d => ({ ...d, hidden: ['tree'] }))
    // Past the session's autosave and the undo history's settle time.
    await new Promise(r => setTimeout(r, 1200))
    expect(open).not.toHaveBeenCalled()
    expect(projectsNow()).toMatchObject({ ready: false, list: [], currentId: null })
    open.mockRestore()
  })

  it('locks the inspector with its own line and no way to Edit', () => {
    const html = renderToStaticMarkup(
      <LockedFor.Provider value={{ text: 'Shared view: you can look, but nothing here can be changed.' }}>
        <ViewLock after>
          <input defaultValue="3.2" />
        </ViewLock>
      </LockedFor.Provider>,
    )
    expect(html).toContain('<fieldset class="view-lock" disabled')
    expect(words(html)).toContain('Shared view: you can look, but nothing here can be changed.')
    expect(buttons(html)).toEqual([])
  })
})

describe('the numbers in a shared view', () => {
  const s = buildSurvey(parseDxf(planeSurvey()), guessRoles(analyzeLayers(parseDxf(planeSurvey()))))
  const terrain = buildTerrain(s)
  // Low on the slope, so cut and fill are out of balance.
  const plan = placed(82)
  const box: { n?: KeyNumbers } = {}
  function Probe() {
    const earth = useEarthworks(plan, s, terrain)
    box.n = useKeyNumbers(plan, s, terrain, earth)
    return null
  }
  renderToStaticMarkup(<Probe />)
  const n = box.n!

  it('shows the strip as labels, with no Balance and nothing to go to', () => {
    expect(n.earth?.outOfBalance).toBe(true)
    const route = areaRoute('design')
    const strip = (readOnly: boolean) => renderToStaticMarkup(<SummaryStrip readOnly={readOnly} route={route} numbers={n} shown={{}} onBalance={() => {}} onOverview={() => {}} overviewOpen={false} />)
    expect(buttons(strip(false))).toContain('Balance')
    expect(words(strip(true))).toContain('Out of balance')
    expect(words(strip(true))).toContain('FFL RL 82.00')
    expect(buttons(strip(true))).toEqual(['Overview'])
  })

  it('shows every number in the Overview, with nothing to open or change', () => {
    const html = renderToStaticMarkup(<OverviewSheet readOnly numbers={n} stats={terrain.stats} onBalance={() => {}} onClose={() => {}} />)
    expect(words(html)).toContain('RL 82.00')
    expect(buttons(html)).toEqual(['Close the overview'])
    expect(buttons(renderToStaticMarkup(<OverviewSheet numbers={n} stats={terrain.stats} onBalance={() => {}} onClose={() => {}} />))).toContain('Balance')
  })
})

describe('a plain page when the link is off or wrong', () => {
  it('says so, and how to get one that works, with no sign-in', () => {
    const html = renderToStaticMarkup(<Trouble trouble={{ kind: 'off', message: '' }} retry={() => {}} />)
    expect(words(html)).toContain('This link isn’t working')
    expect(words(html)).toContain('It may have been turned off, or copied wrong.')
    expect(words(html)).toContain('Ask the person who sent it for a new link.')
    expect(buttons(html)).toEqual([])
    expect(words(html)).not.toMatch(/sign in/i)
  })

  it('offers Try again when the trouble may pass', () => {
    const html = renderToStaticMarkup(<Trouble trouble={{ kind: 'offline', message: 'You’re offline.' }} retry={() => {}} />)
    expect(words(html)).toContain('You’re offline')
    expect(buttons(html)).toEqual(['Try again'])
  })
})

// ---------------------------------------------------------------------------

/** A share API in memory, for the owner's side. */
function fakeApi() {
  let n = 0
  const links: (ShareLink & { off?: boolean })[] = []
  const calls: string[] = []
  const out = (l: ShareLink): ShareLink => ({ id: l.id, created: l.created, lastOpened: l.lastOpened, expires: l.expires })
  const api: ShareApi = {
    list: async () => links.filter(l => !l.off).map(out),
    make: async (_, days) => {
      calls.push(days === 30 ? 'make' : `make ${days}`)
      const created = 1_700_000_000_000 + n
      const link = { id: `h${++n}`, created, lastOpened: null, expires: created + days * DAY }
      links.push(link)
      return { token: `${TOKEN.slice(0, -1)}${n}`, link: out(link) }
    },
    extend: async (_, id) => {
      calls.push(`extend ${id}`)
      const l = links.find(l => l.id === id && !l.off)
      if (!l) throw new CloudError(409, { error: 'link-ended', message: 'That link has ended or was turned off.' })
      l.expires = l.expires! + 30 * DAY
      return out(l)
    },
    turnOff: async (_, id) => {
      calls.push(`off ${id}`)
      links.find(l => l.id === id)!.off = true
    },
    turnOn: async (_, id) => {
      calls.push(`on ${id}`)
      const l = links.find(l => l.id === id)!
      l.off = false
      return out(l)
    },
    open: async () => {
      throw new Error('not here')
    },
    part: async () => new Uint8Array(),
  }
  return { api, links, calls }
}

describe('making and turning off links (the owner)', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://planner.example', hash: '' })
    useShareLinks.setState({ projectId: null, links: null, making: null, problem: null, fresh: null, days: 30, extending: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('makes a link for the open project, saving it to the cloud first, and shows it once', async () => {
    const { api, calls } = fakeApi()
    setShareApi(api)
    const put = vi.spyOn(cloudActions, 'putInCloud').mockImplementation(async id => (useCloud.setState({ inCloud: [id] }), true))
    useCloud.setState({ inCloud: [] })
    expect(await shareLinkActions.make('p1')).toBe(true)
    expect(put).toHaveBeenCalledWith('p1')
    expect(calls).toEqual(['make'])
    const s = useShareLinks.getState()
    expect(s.links?.map(l => l.id)).toEqual(['h1'])
    expect(s.fresh?.url).toMatch(/^https:\/\/planner\.example\/#\/view\/[A-Za-z0-9_-]{43}$/)
    expect(s.making).toBeNull()
  })

  it('says why when the project can’t go to the cloud, and makes no link', async () => {
    const { api, calls } = fakeApi()
    setShareApi(api)
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(false)
    useCloud.setState({ inCloud: [] })
    expect(await shareLinkActions.make('p1')).toBe(false)
    expect(calls).toEqual([])
    expect(useShareLinks.getState().problem).toMatch(/couldn’t go to the cloud/)
  })

  it('turns a link off at once, with no review, and Undo puts it back', async () => {
    const { api, calls } = fakeApi()
    setShareApi(api)
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(true)
    useCloud.setState({ inCloud: ['p1'] })
    await shareLinkActions.make('p1')
    await shareLinkActions.make('p1')
    const [newest, older] = useShareLinks.getState().links!
    expect([newest.id, older.id]).toEqual(['h2', 'h1'])

    await shareLinkActions.turnOff('p1', older)
    expect(calls).toEqual(['make', 'make', 'off h1'])
    expect(useShareLinks.getState().links?.map(l => l.id)).toEqual(['h2'])
    const toast = useSafety.getState().toast!
    expect(toast.text).toBe('Link turned off. It no longer opens the project.')
    expect(useSafety.getState().review).toBeNull()

    await undoToast(toast.id)
    expect(calls.at(-1)).toBe('on h1')
    expect(useShareLinks.getState().links?.map(l => l.id)).toEqual(['h2', 'h1'])
  })

  it('never lets a list read from before a change undo it on the screen', async () => {
    const { api } = fakeApi()
    let answer!: (links: ShareLink[]) => void
    setShareApi({ ...api, list: () => new Promise(r => (answer = r)) })
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(true)
    useCloud.setState({ inCloud: ['p1'] })
    useShareLinks.setState({ projectId: 'p1', links: [] })
    const reading = shareLinkActions.load('p1')
    await shareLinkActions.make('p1')
    answer([])
    await reading
    expect(useShareLinks.getState().links?.map(l => l.id)).toEqual(['h1'])
    expect(useShareLinks.getState().fresh?.linkId).toBe('h1')
  })

  it('keeps the link listed and says why when turning it off fails', async () => {
    const { api } = fakeApi()
    setShareApi({ ...api, turnOff: async () => Promise.reject(new OfflineError()) })
    useShareLinks.setState({ projectId: 'p1', links: [{ id: 'h1', created: 1, lastOpened: null, expires: null }] })
    await shareLinkActions.turnOff('p1', { id: 'h1', created: 1, lastOpened: null, expires: null })
    expect(useShareLinks.getState().links?.map(l => l.id)).toEqual(['h1'])
    expect(useShareLinks.getState().problem).toMatch(/offline/)
  })

  it('makes a link that lasts 30 days unless another length is picked', async () => {
    const { api, calls } = fakeApi()
    setShareApi(api)
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(true)
    useCloud.setState({ inCloud: ['p1'] })
    await shareLinkActions.make('p1')
    shareLinkActions.setDays(365)
    await shareLinkActions.make('p1')
    expect(calls).toEqual(['make', 'make 365'])
    const [year, month] = useShareLinks.getState().links!
    expect(year.expires! - year.created).toBe(365 * DAY)
    expect(month.expires! - month.created).toBe(30 * DAY)
    // The length picked stays for the next link.
    expect(useShareLinks.getState().days).toBe(365)
  })

  it('adds 30 days to a link and says when it now ends', async () => {
    const { api, calls } = fakeApi()
    setShareApi(api)
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(true)
    useCloud.setState({ inCloud: ['p1'] })
    await shareLinkActions.make('p1')
    await shareLinkActions.make('p1')
    const [, older] = useShareLinks.getState().links!
    await shareLinkActions.extend('p1', older)
    expect(calls.at(-1)).toBe('extend h1')
    const links = useShareLinks.getState().links!
    expect(links.map(l => l.id)).toEqual(['h2', 'h1'])
    expect(links[1].expires).toBe(older.expires! + 30 * DAY)
    expect(useSafety.getState().toast?.text).toBe(`The link now works until ${onDay(older.expires! + 30 * DAY)}.`)
    expect(useShareLinks.getState().extending).toBeNull()
  })

  it('takes a link that ended or was turned off elsewhere off the list when Add 30 days finds it gone', async () => {
    const { api, links } = fakeApi()
    setShareApi(api)
    vi.spyOn(cloudActions, 'putInCloud').mockResolvedValue(true)
    useCloud.setState({ inCloud: ['p1'] })
    await shareLinkActions.make('p1')
    links[0].off = true
    await shareLinkActions.extend('p1', useShareLinks.getState().links![0])
    expect(useShareLinks.getState().links).toEqual([])
    expect(useShareLinks.getState().problem).toBe('That link has already ended or been turned off. Make a new one instead.')
  })
})

describe('Share › Send’s link section', () => {
  const none: ShareLinksState = { projectId: null, links: null, making: null, problem: null, fresh: null, days: 30, extending: null }
  const NOW = Date.UTC(2026, 10, 9, 1, 0)
  const body = (phase: Parameters<typeof ShareLinksBody>[0]['phase'], inCloud: boolean, state: ShareLinksState = none, projectId: string | null = 'p1') =>
    renderToStaticMarkup(<ShareLinksBody phase={phase} projectId={projectId} inCloud={inCloud} state={state} now={NOW} />)
  const LENGTHS = ['30 days', '90 days', '1 year']

  it('shows nothing until the cloud is known, or with no project open', () => {
    expect(body('checking', false)).toBe('')
    expect(body('signed-in', false, none, null)).toBe('')
    expect(body('unavailable', false, none, null)).toBe('')
  })

  it('says links need the online version where the app has no cloud, with nothing to press', () => {
    const html = body('unavailable', false)
    expect(words(html)).toContain('View-only link')
    expect(words(html)).toContain(NO_CLOUD_LINKS)
    expect(NO_CLOUD_LINKS).toMatch(/need the online version/)
    expect(buttons(html)).toEqual([])
  })

  it('has Send’s line promise a link only where links can be made', () => {
    const send = AREAS.find(a => a.id === 'share')!.tabs.find(t => t.id === 'send')!
    expect(send.subtitle).toMatch(/view-only link/)
    expect(send.offlineSubtitle).not.toMatch(/link/)
  })

  it('asks to sign in when signed out', () => {
    expect(buttons(body('signed-out', false))).toEqual(['Sign in to share a link'])
  })

  it('offers to save a project on this device only to the cloud first, and says who can see it', () => {
    const html = body('signed-in', false)
    expect(words(html)).toContain(WHO_SEES)
    expect(words(html)).toContain('This project is on this device only.')
    expect(buttons(html)).toEqual([...LENGTHS, 'Save to the cloud and share a link'])
    expect(buttons(body('signed-in', true))).toEqual([...LENGTHS, 'Share a view-only link'])
  })

  it('says what it is doing while it saves and makes the link', () => {
    expect(buttons(body('signed-in', false, { ...none, projectId: 'p1', making: 'upload' }))).toEqual([...LENGTHS, 'Saving to the cloud…'])
    expect(body('signed-in', false, { ...none, projectId: 'p1', making: 'upload' })).toContain('disabled')
    expect(buttons(body('signed-in', true, { ...none, projectId: 'p1', making: 'make' }))).toEqual([...LENGTHS, 'Making the link…'])
  })

  it('lists the links with when each was made, works until and was last opened, each with Add 30 days and Turn off, and the new one to copy', () => {
    const html = body('signed-in', true, {
      ...none,
      projectId: 'p1',
      links: [
        { id: 'h2', created: NOW - 60_000, lastOpened: null, expires: NOW - 60_000 + 30 * DAY },
        { id: 'h1', created: NOW - 3 * DAY, lastOpened: NOW - 3_600_000, expires: NOW - 3 * DAY + 30 * DAY },
      ],
      fresh: { projectId: 'p1', linkId: 'h2', url: `https://planner.example/#/view/${TOKEN}` },
    })
    const text = words(html)
    expect(text).toContain('2 links that work now')
    expect(text).toContain(`Works until ${onDay(NOW - 60_000 + 30 * DAY, NOW)} · not opened yet`)
    expect(text).toContain(`Works until ${onDay(NOW + 27 * DAY, NOW)} · last opened`)
    expect(text).toContain(`Shown only now, so send it on. It works until ${onDay(NOW - 60_000 + 30 * DAY, NOW)}. You can make another any time.`)
    expect(html).toContain(`value="https://planner.example/#/view/${TOKEN}"`)
    expect(buttons(html)).toEqual([...LENGTHS, 'Share a view-only link', 'Copy link', 'Add 30 days', 'Turn off', 'Add 30 days', 'Turn off'])
  })

  it('marks the length picked for the next link', () => {
    const html = body('signed-in', true, { ...none, days: 90 })
    const checked = [...html.matchAll(/<button role="radio" aria-checked="(true|false)"[^>]*>([^<]*)</g)].map(m => [m[2], m[1]])
    expect(checked).toEqual([
      ['30 days', 'false'],
      ['90 days', 'true'],
      ['1 year', 'false'],
    ])
  })

  it('says when a link ends soon, says No end date for an old link, and adds no more than a year allows', () => {
    const html = body('signed-in', true, {
      ...none,
      projectId: 'p1',
      links: [
        { id: 'h3', created: NOW - DAY, lastOpened: null, expires: NOW - DAY + 365 * DAY },
        { id: 'h2', created: NOW - 27 * DAY, lastOpened: null, expires: NOW + 3 * DAY },
        { id: 'h1', created: NOW - 400 * DAY, lastOpened: null, expires: null },
      ],
    })
    const text = words(html)
    expect(text).toContain(`Works until ${onDay(NOW + 3 * DAY, NOW)}, 3 days left`)
    expect(html).toContain('class="sl-soon"')
    expect(text).toContain('No end date · not opened yet')
    // A year's link can't take 30 more days yet; an old link has no end to move.
    expect(buttons(html).slice(LENGTHS.length + 1)).toEqual(['Add 30 days', 'Turn off', 'Add 30 days', 'Turn off', 'Turn off'])
    const year = html.slice(html.indexOf('Add 30 days to the link made yesterday') - 200)
    expect(year.slice(0, year.indexOf('Add 30 days</button>'))).toContain('disabled')
    expect(html).toContain('title="A link can work for up to a year from today."')
  })

  it('shows another project’s links nowhere, nor a link turned off or ended since', () => {
    const html = body('signed-in', true, { ...none, projectId: 'other', links: [{ id: 'h1', created: 1, lastOpened: null, expires: null }], fresh: { projectId: 'other', linkId: 'h1', url: 'x' } })
    expect(buttons(html)).toEqual([...LENGTHS, 'Share a view-only link'])
    const gone = body('signed-in', true, { ...none, projectId: 'p1', links: [], fresh: { projectId: 'p1', linkId: 'h1', url: 'https://planner.example/#/view/x' } })
    expect(gone).not.toContain('planner.example')
    const ended = body('signed-in', true, { ...none, projectId: 'p1', links: [{ id: 'h1', created: NOW - 30 * DAY, lastOpened: null, expires: NOW }], fresh: { projectId: 'p1', linkId: 'h1', url: 'https://planner.example/#/view/x' } })
    expect(ended).not.toContain('planner.example')
    expect(words(ended)).not.toContain('work now')
  })
})
