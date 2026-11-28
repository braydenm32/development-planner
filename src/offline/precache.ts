// What the service worker keeps for working offline: every file of the build (the app, its lazy
// parts, the PDF reader's worker, the 3D print maths' wasm, the fonts, the icons), worked out at
// build time by ../../scripts/offlinePlugin.ts. Pure, so it can be tested without a build.

/** One file of the build, by its path under the base ("assets/index-abc.js") and a hash of its bytes. */
export interface BuiltFile {
  path: string
  hash: string
}

/**
 * Left out: the service worker itself, source maps, dot files, and the link-preview picture
 * (only other sites' crawlers fetch it, from the public address).
 */
const SKIP = [/^sw\.js$/, /\.map$/, /(^|\/)\./, /^og-image\.png$/]

/** Built by Vite with a hash in the name, so a file at that address never changes. */
export const isHashed = (path: string) => /^assets\//.test(path)

/**
 * The addresses to keep, relative to the base, sorted. The page itself is kept as "./" (the base),
 * not "index.html": Cloudflare redirects /index.html to /, and a redirect can't answer a page load.
 */
export function precacheList(files: readonly BuiltFile[]): string[] {
  const urls = files.filter(f => !SKIP.some(re => re.test(f.path))).map(f => (f.path === 'index.html' ? './' : f.path))
  return [...new Set(urls)].sort()
}

/**
 * What the version is made from: each kept file and its hash, so any change to any of them (and
 * nothing else) makes a new version, and the same build always gives the same one.
 */
export function versionSource(files: readonly BuiltFile[]): string {
  const keep = new Set(precacheList(files))
  return files
    .filter(f => keep.has(f.path === 'index.html' ? './' : f.path))
    .map(f => `${f.path} ${f.hash}`)
    .sort()
    .join('\n')
}
