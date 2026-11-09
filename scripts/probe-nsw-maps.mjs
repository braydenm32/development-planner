// Checks that the NSW map and planning services the map placement uses still answer the way
// src/map expects, and still let a browser call them (CORS). Run by hand or in CI:
//
//   node scripts/probe-nsw-maps.mjs
//
// It looks up a public address (Wollongong's council offices), never a user's.

const ORIGIN = 'https://contourandgable.com'
const ADDRESS = '41 Burelli Street Wollongong'
const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public'
const PORTAL = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi'
const EPLAN = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning'

const cut = (s, n = 1500) => (s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s)

async function probe(name, url, { json = true } = {}) {
  console.log(`\n=== ${name}\n${url}`)
  try {
    const r = await fetch(url, { headers: { Origin: ORIGIN } })
    console.log(`status ${r.status} · type ${r.headers.get('content-type')} · ACAO ${r.headers.get('access-control-allow-origin')}`)
    if (!json) {
      const b = await r.arrayBuffer()
      console.log(`bytes ${b.byteLength}`)
      return null
    }
    const text = await r.text()
    console.log(cut(text))
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  } catch (e) {
    console.log(`failed: ${e}`)
    return null
  }
}

async function preflight(name, url) {
  try {
    const r = await fetch(url, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } })
    console.log(`preflight ${name}: ${r.status} ACAO ${r.headers.get('access-control-allow-origin')}`)
  } catch (e) {
    console.log(`preflight ${name} failed: ${e}`)
  }
}

const addr = await probe('address search', `${PORTAL}/address?a=${encodeURIComponent(ADDRESS)}&noOfRecords=5`)
const propId = Array.isArray(addr) ? addr[0]?.propId : undefined
if (propId) {
  await probe('lots of property', `${PORTAL}/lot?propId=${propId}`)
  await probe('property boundary', `${PORTAL}/boundary?id=${propId}&Type=property`)
  await probe('layer intersect', `${PORTAL}/layerintersect?type=property&id=${propId}&layers=epi`)
}
await probe('address search, lot form', `${PORTAL}/address?a=${encodeURIComponent('Lot 1 DP 1000001')}&noOfRecords=5`)

// Wollongong's centre, GDA2020/WGS84.
const lon = 150.8931
const lat = -34.4248
const pt = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }))
const lots = await probe(
  'cadastre lot at a point',
  `${SIX}/NSW_Cadastre/MapServer/9/query?geometry=${pt}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`,
)
const lotid = lots?.features?.[0]?.attributes?.lotidstring
if (lotid) {
  await probe(
    'cadastre lot by lotidstring',
    `${SIX}/NSW_Cadastre/MapServer/9/query?where=${encodeURIComponent(`lotidstring='${lotid}'`)}&outFields=lotidstring,planlabel,lotnumber,sectionnumber,planlotarea&returnGeometry=true&outSR=4326&f=json`,
  )
}
const env = `${lon - 0.0015},${lat - 0.0012},${lon + 0.0015},${lat + 0.0012}`
await probe(
  'cadastre lots in a box',
  `${SIX}/NSW_Cadastre/MapServer/9/query?geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=lotidstring,planlabel&returnGeometry=true&outSR=4326&f=json`,
)

// Imagery tiles: z 18 to 21 at that point.
for (const z of [18, 19, 20, 21]) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latR = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)
  await probe(`imagery tile z${z}`, `${SIX}/NSW_Imagery/MapServer/tile/${z}/${y}/${x}`, { json: false })
}

const ptGda94 = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4283 } }))
for (const [service, layer] of [
  ['Planning_Portal_Principal_Planning', 19],
  ['Planning_Portal_Principal_Planning', 16],
  ['Planning_Portal_Principal_Planning', 14],
  ['Planning_Portal_Principal_Planning', 11],
  ['Planning_Portal_Principal_Planning', 8],
  ['Planning_Portal_Hazard', 229],
  ['Planning_Portal_Hazard', 230],
  ['Planning_Portal_Hazard', 232],
]) {
  await probe(`${service} layer ${layer} info`, `${EPLAN}/${service}/MapServer/${layer}?f=json`).then(j =>
    console.log(j ? `name: ${j.name} · fields: ${(j.fields ?? []).map(f => f.name).join(', ')}` : ''),
  )
  await probe(
    `${service} layer ${layer} at the point`,
    `${EPLAN}/${service}/MapServer/${layer}/query?geometry=${ptGda94}&geometryType=esriGeometryPoint&inSR=4283&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`,
  )
}
// A box query, to see how "partly" a hazard reads.
await probe(
  'bushfire in a box near the escarpment',
  `${EPLAN}/Planning_Portal_Hazard/MapServer/229/query?geometry=150.87,-34.42,150.875,-34.415&geometryType=esriGeometryEnvelope&inSR=4283&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`,
)
await preflight('cadastre', `${SIX}/NSW_Cadastre/MapServer/9/query?f=json`)
await preflight('portal', `${PORTAL}/address?a=x`)
await preflight('eplanning', `${EPLAN}/Planning_Portal_Hazard/MapServer/229/query?f=json`)
