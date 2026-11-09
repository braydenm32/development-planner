// Checks that the NSW map and planning services the map placement uses (src/map/services.ts)
// still answer the way the app expects, and still let a browser call them (CORS). Run by hand
// or from the "Probe NSW map services" workflow:
//
//   node scripts/probe-nsw-maps.mjs
//
// It looks up public places only (Wollongong's council offices and the land around the city),
// never a user's block.

const ORIGIN = 'https://contourandgable.com'
const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public'
const PORTAL = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi'
const EPLAN = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning'

let failures = 0
const cut = (s, n = 900) => (s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s)

async function get(name, url, init) {
  console.log(`\n=== ${name}`)
  try {
    const r = await fetch(url, { ...init, headers: { Origin: ORIGIN, ...(init?.headers ?? {}) } })
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

console.log(`\n${failures} failure(s)`)
process.exitCode = failures ? 1 : 0
