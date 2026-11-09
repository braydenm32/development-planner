// Central Coast Council: the LEP and DCP rules for a dwelling house, as data. Every value and
// clause is from docs/research/councils/central-coast.md, read from the council's and NSW
// legislation's own PDFs on 9 Nov 2026. What the research couldn't read is left out and listed there.

import type { Council } from './types'

export const CENTRAL_COAST: Council = {
  id: 'central-coast',
  name: 'Central Coast',
  lga: 'Central Coast Council',
  lep: 'Central Coast Local Environmental Plan 2022',
  rules: 'Central Coast LEP 2022 and DCP 2022',
  covers: 'Dwelling houses, zones R1, R2, R3 and RU5',
  research: 'docs/research/councils/central-coast.md',
  checked: '9 Nov 2026',

  instruments: {
    lep: {
      name: 'Central Coast Local Environmental Plan 2022',
      cite: 'Central Coast LEP 2022',
      // The newest copy the research could open; the clauses read are the standard ones that send height and FSR to the maps.
      version: 'as made, in force 1 Aug 2022 (later versions not read)',
      url: 'https://legislation.nsw.gov.au/view/pdf/asmade/epi-2022-308',
    },
    c21: {
      name: 'Central Coast Development Control Plan 2022, Chapter 2.1 Dwelling Houses, Secondary Dwellings and Ancillary Development',
      cite: 'Central Coast DCP 2022',
      version: 'chapter 2.1, council’s copy of May 2025',
      url: 'https://www.centralcoast.nsw.gov.au/sites/default/files/2025-05/2.1-dwelling-houses-secondary-dwellings-and-ancillary-development.pdf',
    },
  },

  height: {
    source: { in: 'lep', clause: 'cl 4.3(2)', sure: 'read' },
    fallback: { max: 10, says: 'the DCP’s figure where the LEP map shows none', source: { in: 'c21', clause: '2.1.2.1(1)', sure: 'read' } },
  },
  storeys: {
    max: 2,
    generally: 'The DCP says height “shall generally not exceed two storeys”, and a basement counts as one, so a third storey needs a case in the DA.',
    source: { in: 'c21', clause: '2.1.2.1(1)', sure: 'read' },
  },
  fsr: { source: { in: 'lep', clause: 'cl 4.4(2), 4.5(3)', sure: 'read' } },
  front: {
    bands: [
      { upTo: 300, value: { min: 3 } },
      { value: { min: 4.5, average: 'instead' } },
    ],
    to: 'to a local road',
    neighbours: 'the average of the two nearest houses within 40 m',
    garage: 'garages and carports 1 m behind the front setback',
    note: 'From a classified road it’s 7.5 m.',
    battleAxe: { note: 'Chapter 2.1 has no front setback of its own for a battle-axe lot, so ask council which boundary it treats as the front.' },
    source: { in: 'c21', clause: '2.1.3.1(7)', sure: 'read' },
  },
  side: {
    min: 0.9,
    tall: { over: 4.5, perMetre: 0.25 },
    note: 'For lots over 12.5 m wide at the building line; narrower lots may build to one side for part of its length (not checked).',
    source: { in: 'c21', clause: '2.1.3.1(2)', sure: 'read' },
  },
  rear: {
    min: 3,
    tall: { over: 4.5, min: 6 },
    note: 'Single-storey parts may come to 0.9 m for up to half the rear boundary’s length (not checked); 3 m to a parallel road or reserve.',
    source: { in: 'c21', clause: '2.1.3.1(3)', sure: 'read' },
  },
  coverage: {
    bands: [
      { below: 450, value: 0.6 },
      { below: 900, value: 0.5 },
      { below: 1500, value: 0.4 },
      { value: 0.3 },
    ],
    source: { in: 'c21', clause: '2.1.2.2', sure: 'read' },
  },
  cutFill: { cut: 3, nearCut: 1, fill: 1, source: { in: 'c21', clause: '2.1.6.1', sure: 'read' } },
  retaining: { near: 1, nearMax: 0.6, max: 1, nearWhat: 'any boundary', engineer: true, source: { in: 'c21', clause: '2.1.6.2', sure: 'read' } },

  // Read and not there: chapter 2.1 has no landscaped area figure (only an objective) and no upper-floor
  // rear rule; its batter rule is the BCA's for the soil, with no slope of its own, and chapter 3.7 asks
  // for a geotechnical report by the lot's landslip hazard category rather than a slope or depth (both listed below).
  absent: ['rearUpper', 'landscaped', 'batters', 'geotech'],

  notChecked: [
    'Zone and the LEP map values (height, floor space ratio, overlays)',
    'Embankments: no steeper than the BCA allows for the soil, at most 3 m from the house, and their toe at least 1 m from side and rear boundaries (2.1.6.2)',
    'Private open space: 24 m² (16 m² on lots under 10 m wide), at least 3 m wide, half of it with 3 hours of sun on 21 June',
    'Garage doors: 6 m wide on lots 12 m wide or less, else the greater of 6 m or 60% of the building’s width; driveways 4 m at the crossover',
    'Landslip: chapter 3.7 asks for a geotechnical report by the lot’s hazard category, from council’s records',
  ],
}
