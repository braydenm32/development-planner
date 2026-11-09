// Replies recorded from the NSW services (scripts/probe-nsw-maps.mjs, 9 November 2026), for public
// places only: Wollongong's council offices and land around the city. Trimmed to the fields used.

export const ADDRESS_REPLY = [
  { address: '41 BURELLI STREET WOLLONGONG 2500', propId: 3204805, GURASID: 87397532 },
  { address: '41 BURELLI STREET WOLLONGONG 2500', propId: 3204804, GURASID: 63166515 },
  { address: '41 BURELLI STREET WOLLONGONG 2500', propId: 3204805, GURASID: 87397532 },
]

export const LOT_REPLY = [
  {
    geometry: {
      rings: [
        [
          [16797986.63326792, -4086277.0729866754],
          [16797950.385749295, -4086271.1149320025],
          [16797939.521078311, -4086328.2736726427],
          [16797927.617462523, -4086391.5432541408],
          [16798023.409554139, -4086407.2230870565],
          [16798027.652496532, -4086403.8212113855],
          [16798035.447866511, -4086359.2980821053],
          [16797995.002378564, -4086352.4435487967],
          [16798007.790984303, -4086280.5510347327],
          [16797999.005761407, -4086279.1065826775],
          [16797986.63326792, -4086277.0729866754],
        ],
      ],
      spatialReference: { wkid: 3857 },
    },
    attributes: { CADID: 101327410, LotDescription: '401/-/DP715513' },
  },
]

export const ZONE_ROWS = {
  mangerton: [
    { EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', LAY_CLASS: 'Low Density Residential', LABEL: 'R2', SYM_CODE: 'R2', PURPOSE: null },
  ],
  mangertonEdge: [
    { EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', LAY_CLASS: 'Environmental Conservation', LABEL: 'C2', SYM_CODE: 'C2', PURPOSE: null },
  ],
  road: [{ EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', LAY_CLASS: 'Infrastructure', LABEL: 'SP2 Road', SYM_CODE: 'SP2', PURPOSE: 'Road' }],
}
export const LEP_ROW = { EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', LAY_CLASS: 'Included', LEGIS_REF_CLAUSE: 'Clause 1.3' }
export const HEIGHT_ROW = { EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', SYM_CODE: 10, MAX_B_H: 9, UNITS: 'm', MAX_B_H_M: 9 }
export const FSR_ROW = { EPI_NAME: 'Wollongong Local Environmental Plan 2009', LAY_CLASS: '0.5-0.54', SYM_CODE: 4, FSR: 0.5, LABEL: 'D' }
export const LOT_SIZE_ROW = { LAY_CLASS: '400-449', SYM_CODE: 'F', LOT_SIZE: 449, UNITS: 'm²' }
export const HERITAGE_ROW = { LAY_CLASS: 'Item - General', H_ID: '6240', H_NAME: 'Row Of Shops', SIG: 'Local', LEGIS_REF_CLAUSE: 'Clause 5.10' }
export const BUSHFIRE_ROWS = [
  { Category: 1, Guideline: 3, d_Category: 'Vegetation Category 1', d_Guidelin: 'v5b' },
  { Category: 0, Guideline: 3, d_Category: 'Vegetation Buffer', d_Guidelin: 'v5b' },
]

/**
 * The NSW 5 m elevation model's getSamples for Wollongong's council offices, the Crown St mall, the
 * foot of Mount Keira, Mount Keira's lookout, and a point out at sea (left out: NoData).
 */
export const SAMPLES_REPLY = {
  samples: [
    { location: { x: 150.8936, y: -34.4259, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 0, value: '13.050188065', rasterId: 340, resolution: 5 },
    { location: { x: 150.8975, y: -34.4245, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 1, value: '15.609874725', rasterId: 340, resolution: 5 },
    { location: { x: 150.871, y: -34.41, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 2, value: '52.115875244', rasterId: 340, resolution: 5 },
    { location: { x: 150.847, y: -34.404, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 3, value: '241.538192749', rasterId: 340, resolution: 5 },
  ],
}
