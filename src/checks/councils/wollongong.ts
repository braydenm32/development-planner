// Wollongong City Council: the LEP and DCP rules for a dwelling house, as data. Every value and
// clause is from docs/research/councils/wollongong.md, with the same marks for how sure it is.
// These are the numbers the checks used before they became data; the findings test
// (src/checks/__tests__/findings.test.ts) holds them to the same results.

import type { Council } from './types'

export const WOLLONGONG: Council = {
  id: 'wollongong',
  name: 'Wollongong',
  lga: 'Wollongong City Council',
  lep: 'Wollongong Local Environmental Plan 2009',
  rules: 'Wollongong LEP 2009 and DCP 2009',
  covers: 'Dwelling houses, zone R2',
  research: 'docs/research/councils/wollongong.md',
  checked: '8 Nov 2026',

  instruments: {
    lep: {
      name: 'Wollongong Local Environmental Plan 2009',
      cite: 'Wollongong LEP 2009',
      version: 'version of 2 Oct 2026',
      url: 'https://legislation.nsw.gov.au/view/html/inforce/current/epi-2010-0076',
    },
    b1: {
      name: 'Wollongong Development Control Plan 2009, Chapter B1 Residential Development',
      cite: 'Wollongong DCP',
      version: 'chapter B1, in force 14 Dec 2016',
      url: 'https://wollongong.nsw.gov.au/__data/assets/pdf_file/0027/8928/Wollongong-DCP-2009-Chapter-B01-Residential-Development.pdf',
    },
    e12: {
      name: 'Wollongong Development Control Plan 2009, Chapter E12 Geotechnical Assessment of Slope Instability',
      cite: 'Wollongong DCP',
      version: 'chapter E12, 19 Jul 2021',
      url: 'https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0032/8978/Wollongong-DCP-2009-Chapter-E12-Geotechnical-Assessment-of-Slope-Instability.PDF',
    },
    e17: {
      name: 'Wollongong Development Control Plan 2009, Chapter E17 Preservation and Management of Trees and Vegetation',
      cite: 'Wollongong DCP',
      version: 'chapter E17, in force 1 Jul 2023',
      url: 'https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0028/8983/Wollongong-DCP-2009-Chapter-E17-Preservation-and-Management-of-Trees-and-Vegetation.pdf',
    },
    e19: {
      name: 'Wollongong Development Control Plan 2009, Chapter E19 Earthworks (Land Reshaping Works)',
      cite: 'Wollongong DCP',
      version: 'chapter E19, in force 12 Jan 2018',
      url: 'https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0020/8921/Wollongong-DCP-2009-Chapter-E19-Earthworks-Land-Reshaping-Works.pdf',
    },
    e22: {
      name: 'Wollongong Development Control Plan 2009, Chapter E22 Soil Erosion and Sediment Control',
      cite: 'Wollongong DCP',
      version: 'chapter E22, in force 12 Jan 2018',
      url: 'https://wollongong.nsw.gov.au/__data/assets/pdf_file/0031/8986/Wollongong-DCP-2009-Chapter-E22-Soil-Erosion-and-Sedimentation.pdf',
    },
    drawings: {
      name: 'Wollongong City Council Standard Drawings, 7000 series (vehicle crossings C30, C31 and C33)',
      cite: 'Wollongong standard drawing',
      version: 'revision A, Dec 2019, issued for information',
      url: 'https://wollongong.nsw.gov.au/__data/assets/pdf_file/0011/43103/Standard-Drawings.pdf',
    },
    as4970: {
      name: 'AS 4970-2009 Protection of trees on development sites (numbers from council technical manuals)',
      cite: 'AS 4970-2009',
      version: 'numbers from council manuals',
      url: 'https://www.innerwest.nsw.gov.au/ArticleDocuments/739/Tree%20Management%20Technical%20Manual.pdf.aspx',
    },
  },

  height: {
    source: { in: 'lep', clause: 'cl 4.3(2)', sure: 'read' },
    // The LEP has no figure in its text (it's mapped); B1 says R2 is mapped at 9 m.
    fallback: { max: 9, says: 'B1’s figure for R2', source: { in: 'b1', clause: 'B1 4.1', sure: 'secondary' } },
  },
  storeys: {
    max: 2,
    source: { in: 'b1', clause: 'B1 4.1', sure: 'read' },
    battleAxe: {
      max: 1,
      note: 'A second storey needs a case against B1 4.1.2’s objectives in the DA. The CDC route has no battle-axe storey limit.',
      source: { in: 'b1', clause: 'B1 4.1, 4.1.2(1)', sure: 'read' },
    },
  },
  rearUpper: { min: 8, source: { in: 'b1', clause: 'B1 4.1.2(4)', sure: 'read' } },
  fsr: { source: { in: 'lep', clause: 'cl 4.4(2), 4.5(3)', sure: 'read' } },
  front: {
    bands: [{ value: { min: 6 } }],
    to: 'to the front facade (infill)',
    garage: 'garages 5.5 m',
    battleAxe: {
      note: 'B1 measures this from the primary street frontage, and a battle-axe lot reaches the street only by its handle. B1 has no battle-axe front setback of its own, so ask council which boundary it treats as the front.',
    },
    source: { in: 'b1', clause: 'B1 4.2.2(1)', sure: 'read' },
  },
  sideRear: { min: 0.9, tall: { over: 7, min: 3 }, source: { in: 'b1', clause: 'B1 4.3.2(1), (2)', sure: 'read' } },
  coverage: {
    bands: [
      { below: 450, value: 0.55 },
      { below: 900, value: 0.5 },
      { value: 0.4 },
    ],
    handleNote: 'Whether B1 counts the access handle in the site area wasn’t checked, so both are shown.',
    source: { in: 'b1', clause: 'B1 4.4.2(2)', sure: 'read' },
  },
  landscaped: {
    bands: [
      { below: 600, value: { base: 0, share: 0.2, over: 0 } },
      { upTo: 900, value: { base: 120, share: 0.3, over: 600 } },
      { value: { base: 210, share: 0.4, over: 900 } },
    ],
    behindBuildingLine: 0.5,
    source: { in: 'b1', clause: 'B1 4.5.2(2)', sure: 'read' },
  },
  batters: { run: 4, source: { in: 'e19', clause: 'E19 4.3', sure: 'read' } },
  geotech: {
    depth: 1,
    slope: 15,
    why: 'E19 says the DA will generally need a geotechnical report',
    also: 'Separately, E12 asks for one wherever council’s records or an inspection suggest the land may be unstable; it has no slope number of its own, so ask council what its property records say.',
    source: { in: 'e19', also: ['e12'], clause: 'E19 4.1 cl 5; E12 4.1', sure: 'read', version: 'E19 in force 12 Jan 2018; E12 19 Jul 2021' },
  },
  erosion: {
    bands: [
      { below: 1000, value: 'A basic erosion and sediment control plan (under 1,000 m²)' },
      { upTo: 2500, value: 'An erosion and sediment control plan (1,000 to 2,500 m²)' },
      { value: 'A soil and water management plan (over 2,500 m²)' },
    ],
    note: 'What the DA has to include; a fuller plan is needed within 50 m of a watercourse or next to sensitive land.',
    source: { in: 'e22', clause: 'E22 3(1)', sure: 'read' },
  },
  retaining: {
    near: 0.9,
    nearMax: 0.6,
    max: 1,
    tall: { over: 1, limit: 'terraced and engineered', note: 'need an engineer and justification' },
    source: { in: 'b1', clause: 'B1 4.17.3', sure: 'read' },
  },
  // B1 and E19 set no depth for cut or fill of their own: E19's 1 m is when a geotechnical report is needed.
  absent: ['cutFill'],
  trees: {
    removal: {
      within: 3,
      near: 'Its base is {toHouse} from the house, within {within} m, so once the DA is approved it may be removed without another application, if council’s tree officer agrees (E17 13.3). Replacement planting applies (E17 s9).',
      far: 'It’s more than {within} m from the house, so the DA has to make the case for removing it, with an arborist report (E17 13.1).',
      source: { in: 'e17', clause: 'E17 13.3', sure: 'read' },
    },
    zone: {
      minor: 0.1,
      source: { in: 'e17', also: ['as4970'], clause: 'E17 13.2, 13.4; AS 4970-2009', sure: 'secondary', version: 'E17 in force 1 Jul 2023; AS 4970 numbers from council manuals' },
    },
  },

  sun: {
    hours: 3,
    source: { in: 'b1', clause: 'B1 4.7.2(1), (2)', sure: 'read' },
    diagrams: { in: 'b1', clause: 'B1 4.7.2(3)', sure: 'read' },
  },

  // The crossing drawings (docs/research/councils/wollongong.md, Parking, garages and driveways).
  crossing: {
    maxGrade: { max: 0.25, source: { in: 'drawings', clause: '7000-C33', sure: 'read' } },
    footpath: {
      width: 3.5,
      // From the gutter: a 450 mm kerb break, then 1.52 m at 1 in 8; the break is taken as level.
      ramp: [
        { length: 0.45, grade: 0 },
        { length: 1.52, grade: 0.125 },
      ],
      fall: 0.025,
      maxFall: 0.025,
      steepest: { fall: 0.125, says: 'C30 lets the footpath beside a crossing be regraded no steeper than 1 in 8, even on a steep road' },
      note: 'C33 holds the first 2.72 m from the kerb to 2.5% and then allows a 2 m curve up to the boundary, so council may accept more on a steep street: ask it for the boundary levels.',
      source: { in: 'drawings', clause: '7000-C30, C33', sure: 'read' },
    },
    transitions: { length: 2, source: { in: 'drawings', clause: '7000-C33', sure: 'read' } },
    width: { boundary: 3, kerb: 5.6, source: { in: 'drawings', clause: '7000-C30', sure: 'read' } },
  },

  notChecked: [
    'Zone and the LEP map values (height, floor space ratio, overlays)',
    'Private open space (24 m², 4 m wide, 1 in 50)',
    'Where the neighbours’ living room windows and open space are, for their 3 hours of winter sun (the app knows where the shadow falls)',
    'Garage doors, parking and driveway width',
    'Fences, pools and storage',
    'Easements',
    'Bush fire prone land: check council’s map (E16, in force 19 Aug 2024); if it applies, the DA needs a bush fire assessment',
    'B1 asks battle-axe handles to be at least 6 m wide as a driveway reserve (B1 5.6, written for multi-dwelling sites)',
  ],
}
