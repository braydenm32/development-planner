// Builds the service worker (src/offline/sw.ts) as sw.js beside index.html, with the list of
// every file the build made (src/offline/precache.ts) and a version made from their hashes.
// The version also goes in index.html (<meta name="cg-version">), so the page knows which one it
// is. Build only: the dev server and the tests never have a service worker.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { SERVICE_WORKER_OFF } from '../src/offline/killSwitch.ts'
import { precacheList, versionSource, type BuiltFile } from '../src/offline/precache.ts'

const SW_SOURCE = 'src/offline/sw.ts'
const SW_FILE = 'sw.js'
const hash = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')

function filesIn(dir: string): string[] {
  let out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    out = statSync(p).isDirectory() ? out.concat(filesIn(p)) : out.concat(p)
  }
  return out
}

export function offline(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'contour-offline',
    apply: 'build',
    configResolved(c) {
      config = c
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: join(config.root, SW_SOURCE), fileName: SW_FILE })
    },
    generateBundle: {
      // After Vite has written index.html into the bundle.
      order: 'post',
      handler(_options, bundle) {
        const files: BuiltFile[] = []
        for (const [path, out] of Object.entries(bundle)) {
          if (path === SW_FILE) continue
          files.push({ path, hash: hash(out.type === 'chunk' ? out.code : out.source) })
        }
        const pub = config.publicDir
        if (pub && config.build.copyPublicDir)
          for (const p of filesIn(pub)) files.push({ path: relative(pub, p).split(sep).join('/'), hash: hash(readFileSync(p)) })
        const version = hash(versionSource(files)).slice(0, 12)
        const build = { files: precacheList(files), version, off: SERVICE_WORKER_OFF }

        const sw = bundle[SW_FILE]
        if (sw?.type !== 'chunk') this.error(`${SW_FILE} wasn't built`)
        if (sw.imports.length) this.error(`${SW_FILE} shares code with the app (${sw.imports.join(', ')}): it must stand alone`)
        if (!sw.code.includes('__CG_BUILD__')) this.error(`${SW_FILE} has no __CG_BUILD__ to fill in`)
        sw.code = sw.code.replaceAll('__CG_BUILD__', `(${JSON.stringify(build)})`)

        const html = bundle['index.html']
        if (html?.type === 'asset' && typeof html.source === 'string')
          html.source = html.source.replace(/<meta charset="UTF-8" \/>\n?/i, m => `${m}    <meta name="cg-version" content="${version}" />\n`)
      },
    },
  }
}
