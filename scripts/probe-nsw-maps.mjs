// Checks that the NSW map and planning services the map placement uses (src/map/services.ts)
// still answer the way the app expects, and still let a browser call them (CORS). Run by hand
// or from the "Probe NSW map services" workflow:
//
//   node scripts/probe-nsw-maps.mjs
//
// It looks up public places only (Wollongong's council offices and the land around the city),
// never a user's block. `node scripts/probe-nsw-maps.mjs elevation` checks only the elevation
// services (src/map/elevation.ts); `maps` only the rest.

const ORIGIN = 'https://contourandgable.com'
const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public'
const PORTAL = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi'
const EPLAN = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning'

const ONLY = process.argv[2] ?? process.env.PROBE ?? 'all'
let failures = 0
const cut = (s, n = 900) => (s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s)

async function get(name, url, init) {
  console.log(`\n=== ${name}`)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), ...init, headers: { Origin: ORIGIN, ...(init?.headers ?? {}) } })
    const acao = r.headers.get('access-control-allow-origin')
    const text = await r.text()
    console.log(`status ${r.status} · CORS ${acao}`)
    if (!r.ok || !acao) failures++
    try {
      return JSON.parse(text)
    } catch {
      console.log(cut(text))
      return null
    }
  } catch (e) {
    failures++
    console.log(`failed: ${e}`)
    return null
  }
}

const show = (label, j) => {
  if (j?.error) {
    failures++
    console.log(`${label}: error ${JSON.stringify(j.error)}`)
    return
  }
  const feats = j?.features ?? []
  console.log(`${label}: ${feats.length} feature(s)`)
  for (const f of feats.slice(0, 3)) console.log(cut(JSON.stringify(f.attributes)))
}

/** ArcGIS layer query, posted as a form so polygons fit. */
const query = (service, layer, params) =>
  get(`${service}/${layer}`, `${EPLAN}/${service}/MapServer/${layer}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', outFields: '*', returnGeometry: 'false', spatialRel: 'esriSpatialRelIntersects', ...params }),
  })
const box = (lon, lat, d) => ({ geometry: `${lon - d},${lat - d},${lon + d},${lat + d}`, geometryType: 'esriGeometryEnvelope', inSR: '4283', resultRecordCount: '3' })

if (ONLY === 'all' || ONLY === 'maps') {
// Address search as you type.
for (const a of ['41 Burelli St Wollongong', '41 Burelli', 'Lot 401 DP 715513']) {
  const j = await get(`address "${a}"`, `${PORTAL}/address?a=${encodeURIComponent(a)}&noOfRecords=5`)
  console.log(cut(JSON.stringify(j)))
}
const lot = await get('lot of the council offices', `${PORTAL}/lot?propId=3204805`)
console.log(cut(JSON.stringify(lot?.[0]?.attributes)), 'wkid', lot?.[0]?.geometry?.spatialReference?.wkid)

// Cadastre: by Lot/DP, then a polygon query around it.
const byLot = await get(
  'cadastre by lotidstring',
  `${SIX}/NSW_Cadastre/MapServer/9/query?where=${encodeURIComponent("lotidstring='401//DP715513'")}&outFields=lotidstring,planlabel,lotnumber,sectionnumber,plannumber,planlotarea,planlotareaunits&returnGeometry=true&outSR=4326&f=json`,
)
show('cadastre by lotidstring', byLot)
const ring = byLot?.features?.[0]?.geometry?.rings?.[0]
console.log('ring vertices', ring?.length, JSON.stringify(ring?.slice(0, 2)))
const byLike = await get(
  'cadastre by lot number and plan',
  `${SIX}/NSW_Cadastre/MapServer/9/query?where=${encodeURIComponent("lotnumber='401' AND plannumber=715513")}&outFields=lotidstring,planlabel&returnGeometry=false&f=json`,
)
show('cadastre by lot number and plan', byLike)

// Planning layers over the lot polygon (GDA2020 sent as 4326; the server shifts it to GDA94 or not).
if (ring) {
  const poly = { geometry: JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: '4326' }
  for (const [s, l] of [
    ['Planning_Portal_Principal_Planning', 19],
    ['Planning_Portal_Principal_Planning', 14],
    ['Planning_Portal_Principal_Planning', 11],
    ['Planning_Portal_Principal_Planning', 22],
    ['Planning_Portal_Principal_Planning', 16],
    ['Planning_Portal_Principal_Planning', 8],
    ['Planning_Portal_Hazard', 229],
    ['Planning_Portal_Hazard', 230],
    ['Planning_Portal_Hazard', 232],
  ])
    show(`council offices lot · ${s} ${l}`, await query(s, l, poly))
}

// Examples with something in them, to see the values.
show('bushfire prone, Mount Keira', await query('Planning_Portal_Hazard', 229, box(150.855, -34.405, 0.004)))
show('bushfire prone, Mount Ousley', await query('Planning_Portal_Hazard', 229, box(150.88, -34.38, 0.01)))
show('flood planning, Wollongong', await query('Planning_Portal_Hazard', 230, box(150.89, -34.42, 0.02)))
show('landslide, Wollongong', await query('Planning_Portal_Hazard', 232, box(150.88, -34.40, 0.03)))
show('heritage, city centre', await query('Planning_Portal_Principal_Planning', 16, box(150.895, -34.425, 0.004)))
show('zoning, Mangerton', await query('Planning_Portal_Principal_Planning', 19, box(150.875, -34.435, 0.001)))
show('min lot size, Mangerton', await query('Planning_Portal_Principal_Planning', 22, box(150.875, -34.435, 0.001)))
show('height, Mangerton', await query('Planning_Portal_Principal_Planning', 14, box(150.875, -34.435, 0.001)))
show('FSR, Mangerton', await query('Planning_Portal_Principal_Planning', 11, box(150.875, -34.435, 0.001)))
const info = await get('layer 22 info', `${EPLAN}/Planning_Portal_Principal_Planning/MapServer/22?f=json`)
console.log('layer 22:', info?.name, (info?.fields ?? []).map(f => f.name).join(', '))

// Imagery tiles answer to z 21 (checked once already); keep one as a canary.
await get('imagery tile', `${SIX}/NSW_Imagery/MapServer/tile/20/631199/963796`)

}

if (ONLY === 'all' || ONLY === 'elevation') await probeElevation()

console.log(`\n${failures} failure(s)`)
process.exitCode = failures ? 1 : 0

// ---- Elevation (src/map/elevation.ts) ----
//
// The NSW 5 m elevation model the app reads ground levels from, asked for public places only:
// Wollongong's council offices, the Crown St mall, the foot of Mount Keira, its lookout, and a point
// out at sea (which comes back with no sample: NoData). Then a full batch, to see the server's limit
// (it answered at most 1000 samples a request, in about 25 s however many points, November 2026),
// and the other services looked at (docs/research/elevation.md), to see whether they still answer.

async function probeElevation() {
  const DEM = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer'
  const info = await get('NSW 5 m elevation info', `${DEM}?f=json`)
  if (info) console.log(cut(JSON.stringify({ description: info.description, copyrightText: info.copyrightText, pixelSizeX: info.pixelSizeX, maxRecordCount: info.maxRecordCount, spatialReference: info.spatialReference })))
  const places = [
    [150.8936, -34.4259],
    [150.8975, -34.4245],
    [150.871, -34.41],
    [150.847, -34.404],
    [150.95, -34.43],
  ]
  const samples = async (label, pts) => {
    const t0 = Date.now()
    const j = await get(`getSamples ${label}`, `${DEM}/getSamples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        geometry: JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryMultipoint',
        returnFirstValueOnly: 'true',
        interpolation: 'RSP_BilinearInterpolation',
        f: 'json',
      }),
      signal: AbortSignal.timeout(120000),
    })
    const got = j?.samples ?? []
    console.log(`${Date.now() - t0} ms · ${got.length} sample(s) for ${pts.length} point(s)${j?.error ? ` · error ${JSON.stringify(j.error)}` : ''}`)
    for (const x of got.slice(0, 5)) console.log(cut(JSON.stringify(x), 300))
    if (j?.error || !got.length) failures++
  }
  await samples('public places', places)
  const grid = []
  for (let i = 0; i < 36; i++) for (let j = 0; j < 30; j++) grid.push([Number((150.8930 + i * 0.00003).toFixed(7)), Number((-34.4265 + j * 0.00003).toFixed(7))])
  await samples(`a batch of ${grid.length}`, grid)
  try {
    const r = await fetch(`${DEM}/getSamples`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(30000) })
    console.log(`preflight ${r.status} · allow-origin ${r.headers.get('access-control-allow-origin')}`)
  } catch (e) {
    console.log(`preflight failed: ${e}`)
  }

  // Looked at and not used: Geoscience Australia's national 5 m LiDAR model (one point per identify,
  // and its REST directory refused GitHub's runners), and the NSW portal's elevation index.
  const ga = await get('GA 5 m LiDAR WCS capabilities (not used)', 'https://services.ga.gov.au/gis/services/DEM_LiDAR_5m_2025/MapServer/WCSServer?service=WCS&request=GetCapabilities&version=1.0.0')
  if (ga) console.log(cut(JSON.stringify(ga), 200))
  const index = await get('NSW elevation index (not used)', 'https://portal.spatial.nsw.gov.au/server/rest/services/Hosted/Elevation_Index_Public/FeatureServer?f=json')
  if (index) console.log(cut(JSON.stringify(index.layers ?? index), 300))
}
