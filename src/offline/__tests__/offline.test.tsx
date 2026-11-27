// Working offline: what the build keeps (precache list and version), which requests the service
// worker answers and how (both bases the app is deployed at), which old caches go, the build step
// that writes sw.js, and what the app says while offline or when a new version is ready.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { offline } from '../../../scripts/offlinePlugin'
import { NO_CLOUD_LINKS, ShareLinksBody } from '../../share-links/ShareLinks'
import type { ShareLinksState } from '../../share-links/store'
import { NEEDS_CONNECTION, NeedsConnection } from '../NeedsConnection'
import { OfflineLayer } from '../OfflineLayer'
import { precacheList, versionSource, type BuiltFile } from '../precache'
import { CACHES } from '../register'
import { CACHE_PREFIX, cacheName, cachesToDelete, keepFetched, route, type RouteRequest } from '../routing'
import { useOffline } from '../state'

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim()

/** A build like the real one: the page, the main chunk, the lazy parts, the PDF worker, the wasm, a font and the public files. */
const BUILD: BuiltFile[] = [
  'index.html',
  'assets/index-DaYfGf3s.js',
  'assets/index-B7XltZsu.css',
  'assets/pdf-ULJPBbF3.js',
  'assets/pdf.worker.min-CjEcRF4W.mjs',
  'assets/manifold-O44e21d9.js',
  'assets/manifold-BE4c7gO-.wasm',
  'assets/features-D30BOpzj.js',
  'assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2',
  'assets/index-DaYfGf3s.js.map',
  'sw.js',
  'favicon.svg',
  'icon-192.png',
  'manifest.webmanifest',
  'og-image.png',
  'start-example.jpg',
  '.DS_Store',
].map(path => ({ path, hash: `h-${path}` }))

describe('the precache list', () => {
  const list = precacheList(BUILD)

  it('keeps every file the app loads, lazy parts, worker, wasm and fonts included', () => {
    for (const f of ['assets/index-DaYfGf3s.js', 'assets/index-B7XltZsu.css', 'assets/pdf-ULJPBbF3.js', 'assets/pdf.worker.min-CjEcRF4W.mjs', 'assets/manifold-BE4c7gO-.wasm', 'assets/features-D30BOpzj.js', 'assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2', 'favicon.svg', 'icon-192.png', 'manifest.webmanifest', 'start-example.jpg'])
      expect(list).toContain(f)
  })

  it('keeps the page as the base, never index.html (a redirect on Cloudflare)', () => {
    expect(list).toContain('./')
    expect(list).not.toContain('index.html')
  })

  it('leaves out the service worker, source maps, dot files and the link-preview picture', () => {
    for (const f of ['sw.js', 'assets/index-DaYfGf3s.js.map', '.DS_Store', 'og-image.png']) expect(list).not.toContain(f)
  })

  it('is sorted, with each file once', () => {
    expect(list).toEqual([...new Set(list)].sort())
    expect(precacheList([...BUILD, ...BUILD])).toEqual(list)
  })

  it('makes the same version from the same build, in any order, and a new one when a kept file changes', () => {
    const v = versionSource(BUILD)
    expect(versionSource([...BUILD].reverse())).toBe(v)
    expect(versionSource(BUILD.map(f => (f.path === 'assets/pdf-ULJPBbF3.js' ? { ...f, hash: 'new' } : f)))).not.toBe(v)
    expect(versionSource(BUILD.map(f => (f.path === 'index.html' ? { ...f, hash: 'new' } : f)))).not.toBe(v)
    // A file that isn't kept doesn't make a new version.
    expect(versionSource(BUILD.map(f => (f.path === 'sw.js' ? { ...f, hash: 'new' } : f)))).toBe(v)
  })
})

describe('what the service worker answers', () => {
  // GitHub Pages serves the app under the repository's name; the Cloudflare Worker at its root.
  const bases = [
    { name: 'GitHub Pages', scope: 'https://example.github.io/development-planner/' },
    { name: 'Cloudflare', scope: 'https://planner.example.workers.dev/' },
  ]
  for (const { name, scope } of bases) {
    const kept = new Set(precacheList(BUILD).map(f => new URL(f, scope).href))
    const at = (path: string, more: Partial<RouteRequest> = {}) => route({ url: new URL(path, scope).href, method: 'GET', ...more }, { scope, kept })

    describe(name, () => {
      it('loads the page from the network first, with the kept copy offline', () => {
        expect(at('./', { mode: 'navigate' })).toBe('page')
        expect(at('index.html', { mode: 'navigate' })).toBe('page')
        // An old link with a query, and every #/route (the hash never reaches the server).
        expect(at('./?layout=new', { mode: 'navigate' })).toBe('page')
      })

      it('answers the build’s files from the kept copy first', () => {
        expect(at('assets/index-DaYfGf3s.js')).toBe('asset')
        expect(at('assets/manifold-BE4c7gO-.wasm')).toBe('asset')
        expect(at('assets/pdf.worker.min-CjEcRF4W.mjs')).toBe('asset')
        expect(at('manifest.webmanifest')).toBe('asset')
        expect(at('icon-192.png', { mode: 'navigate' })).toBe('asset')
        // A newer deploy's part: fetched, and kept from then on.
        expect(at('assets/index-NEWER.js')).toBe('asset')
      })

      it('never touches the Worker API: sign-in, cloud saves, share links, comments', () => {
        for (const p of ['api/health', 'api/session', 'api/projects/abc', 'api/shares/TOKEN', 'api/comments/x', 'api']) expect(at(p)).toBe('pass')
        expect(route({ url: new URL('/api/health', scope).href, method: 'GET' }, { scope, kept })).toBe('pass')
        expect(at('api/projects/abc', { method: 'PUT' })).toBe('pass')
      })

      it('passes other sites straight through: the NSW maps and planning services', () => {
        for (const u of [
          'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/15/1/2',
          'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi/address?a=1',
          'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/x',
          'https://static.cloudflareinsights.com/beacon.min.js',
        ])
          expect(route({ url: u, method: 'GET' }, { scope, kept })).toBe('pass')
      })

      it('passes anything that isn’t a plain GET of a file it knows', () => {
        expect(at('assets/index-DaYfGf3s.js', { method: 'POST' })).toBe('pass')
        expect(at('assets/index-DaYfGf3s.js', { range: true })).toBe('pass')
        expect(at('assets/index-DaYfGf3s.js?v=2')).toBe('pass')
        expect(at('somewhere/else.html', { mode: 'navigate' })).toBe('pass')
        expect(at('og-image.png')).toBe('pass')
        expect(route({ url: 'not a url', method: 'GET' }, { scope, kept })).toBe('pass')
      })

      it('keeps a fetched part only when it’s a built file that came whole', () => {
        expect(keepFetched(new URL('assets/x.js', scope).href, scope, 200)).toBe(true)
        expect(keepFetched(new URL('assets/x.js', scope).href, scope, 404)).toBe(false)
        expect(keepFetched(new URL('api/health', scope).href, scope, 200)).toBe(false)
      })
    })
  }

  it('leaves a page outside the app’s base alone (GitHub Pages: other projects on the same host)', () => {
    const scope = 'https://example.github.io/development-planner/'
    expect(route({ url: 'https://example.github.io/', method: 'GET', mode: 'navigate' }, { scope, kept: new Set() })).toBe('pass')
    expect(route({ url: 'https://example.github.io/other-project/assets/a.js', method: 'GET' }, { scope, kept: new Set() })).toBe('pass')
  })
})

describe('old caches', () => {
  it('keeps this version’s and the newest one before it, and deletes the rest of this app’s only', () => {
    const now = cacheName('ccc')
    const names = [cacheName('aaa'), cacheName('bbb'), now, 'someone-else', cacheName('old-no-stamp')]
    expect(cachesToDelete(names, now, { [cacheName('aaa')]: 1, [cacheName('bbb')]: 2, [now]: 3 }).sort()).toEqual([cacheName('aaa'), cacheName('old-no-stamp')].sort())
    expect(cachesToDelete([now], now, {})).toEqual([])
  })

  it('the page and the service worker agree on the caches’ name', () => {
    expect(CACHES).toBe(CACHE_PREFIX)
  })
})

describe('the build step', () => {
  type Handler = (this: unknown, o: unknown, b: Record<string, unknown>) => void
  const build = (pub: string) => {
    const plugin = offline()
    ;(plugin.configResolved as (c: unknown) => void)({ root: '/', publicDir: pub, build: { copyPublicDir: true } })
    const bundle: Record<string, { type: string; code?: string; source?: string; imports?: string[] }> = {
      'index.html': { type: 'asset', source: '<html><head>\n    <meta charset="UTF-8" />\n    <title>x</title></head></html>' },
      'assets/index-abc.js': { type: 'chunk', code: 'console.log(1)', imports: [] },
      'sw.js': { type: 'chunk', code: 'const B=__CG_BUILD__;go(B)', imports: [] },
    }
    const errors: string[] = []
    const ctx = {
      error: (m: string) => {
        errors.push(m)
        throw new Error(m)
      },
    }
    const gen = plugin.generateBundle as { handler: Handler }
    return { run: () => gen.handler.call(ctx, {}, bundle), bundle, errors }
  }

  it('writes the file list, the version and the switch into sw.js, and the version into the page', () => {
    const pub = mkdtempSync(join(tmpdir(), 'cg-pub-'))
    writeFileSync(join(pub, 'icon-192.png'), 'png')
    const { run, bundle } = build(pub)
    run()
    const filled = JSON.parse(bundle['sw.js'].code!.replace(/^const B=\((.*)\);go\(B\)$/, '$1')) as { files: string[]; version: string; off: boolean }
    expect(filled.files).toEqual(['./', 'assets/index-abc.js', 'icon-192.png'])
    expect(filled.version).toMatch(/^[0-9a-f]{12}$/)
    expect(filled.off).toBe(false)
    expect(bundle['index.html'].source).toContain(`<meta name="cg-version" content="${filled.version}" />`)
  })

  it('refuses a service worker that shares code with the app', () => {
    const pub = mkdtempSync(join(tmpdir(), 'cg-pub-'))
    const { run, bundle, errors } = build(pub)
    bundle['sw.js'].imports = ['assets/shared.js']
    expect(run).toThrow()
    expect(errors[0]).toMatch(/must stand alone/)
  })
})

describe('what the app says', () => {
  // Rendered on the "server", a store reads its first state: keep that in step (as src/sun's tests do).
  const set = (s: Partial<ReturnType<typeof useOffline.getState>>) => {
    useOffline.setState(s)
    Object.assign(useOffline.getInitialState(), useOffline.getState())
  }
  afterEach(() => set({ online: true, update: false, missingPart: false }))

  it('says plainly that a part needs a connection, only while offline', () => {
    expect(renderToStaticMarkup(<NeedsConnection />)).toBe('')
    set({ online: false })
    expect(words(renderToStaticMarkup(<NeedsConnection>Finding a lot uses the NSW map services.</NeedsConnection>))).toBe(`${NEEDS_CONNECTION} Finding a lot uses the NSW map services.`)
    // Back online, it goes.
    set({ online: true })
    expect(renderToStaticMarkup(<NeedsConnection />)).toBe('')
  })

  it('offers the new version with Reload, and nothing when there is none', () => {
    expect(renderToStaticMarkup(<OfflineLayer />)).toBe('')
    set({ update: true })
    const html = renderToStaticMarkup(<OfflineLayer />)
    expect(words(html)).toBe('A new version is ready Reload')
    expect(html).toContain('role="status"')
  })

  it('offers a reload when a part didn’t load, but not while offline', () => {
    set({ missingPart: true })
    expect(words(renderToStaticMarkup(<OfflineLayer />))).toBe('Part of the app didn’t load. Reload')
    set({ online: false })
    expect(words(renderToStaticMarkup(<OfflineLayer />))).toBe('You’re offline, and this part of the app isn’t on this device yet.')
  })

  const LINKS: ShareLinksState = { projectId: 'p1', links: [], making: null, problem: null, fresh: null, days: 30, extending: null, comments: 'off' } as unknown as ShareLinksState

  it('share links: offline, says so and holds the buttons; online, as before', () => {
    const off = renderToStaticMarkup(<ShareLinksBody phase="signed-in" projectId="p1" inCloud state={LINKS} now={0} offline />)
    expect(words(off)).toContain(NEEDS_CONNECTION)
    expect(off).toMatch(/<button class="sl-btn primary" disabled=""/)
    const on = renderToStaticMarkup(<ShareLinksBody phase="signed-in" projectId="p1" inCloud state={LINKS} now={0} />)
    expect(words(on)).not.toContain(NEEDS_CONNECTION)
    // No cloud found because there was no connection: offline, not "needs the online version".
    expect(words(renderToStaticMarkup(<ShareLinksBody phase="unavailable" projectId="p1" inCloud={false} state={LINKS} now={0} offline />))).not.toContain(NO_CLOUD_LINKS)
    expect(words(renderToStaticMarkup(<ShareLinksBody phase="unavailable" projectId="p1" inCloud={false} state={LINKS} now={0} />))).toContain(NO_CLOUD_LINKS)
  })
})
