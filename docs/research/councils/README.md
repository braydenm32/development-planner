# Council rule sets

Each NSW council adds its own LEP and DCP on top of the state rules in [../compliance-and-swept-path-sources.md](../compliance-and-swept-path-sources.md). This folder holds one file per council, so the checker can start with Wollongong and grow council by council.

| Council | File | State |
| --- | --- | --- |
| Wollongong City Council | [wollongong.md](wollongong.md) | LEP (2 Oct 2026 version) and DCP read, 8 Nov 2026 |

## How the app picks a council

Once the survey is placed on the map ([../map-placement.md](../map-placement.md)), the Planning Portal's controls lookup for the property returns the EPI name and LGA with each layer (for example "Wollongong Local Environmental Plan 2009"). The app maps that to a rule set. If no rule set exists for that council, it runs the state rules and the LEP map values only, and says the DCP isn't covered yet.

## What to collect for a new council

Copy the headings of [wollongong.md](wollongong.md) and fill in:

1. **The LEP**: its name and legislation id, the version date read, the zone of the block and what it permits, any local subclauses to 4.1, 4.3 and 4.4 (some councils have sliding FSRs for houses), clause 4.6 limits, and the local provisions (earthworks, flood, landslip, escarpment, riparian, scenic, acid sulfate). Map values (height, FSR, lot size) come from the ePlanning layers, not the text.
2. **The DCP**: the chapter list and dates, then for a dwelling house: height and storeys, setbacks (front, secondary, side, rear, garage), site coverage, landscaped area, private open space, solar access to neighbours, privacy, cut and fill, retaining walls, parking, garage and driveway rules, fences, pools.
3. **Engineering documents**: the vehicle crossing standard drawings and any driveway specification.
4. **Where it differs from the Housing Code**, so the app can show both answers side by side.

## How the rules should be stored in code (when this is built)

A sketch, not a decision:

```text
src/compliance/
  types.ts               Rule, Finding, Source (instrument, clause, version date, url, sure: read | secondary | unverified)
  state/housingCode.ts   Codes SEPP Part 3
  state/ncc.ts           NCC Housing Provisions
  councils/index.ts      registry keyed by LEP name / LGA
  councils/wollongong/lep.ts
  councils/wollongong/dcp.ts
```

Each rule is data plus a small check function: which pathway it belongs to (CDC or DA), when it applies (zone, lot size band, lot width, overlays), the limit, and a function that measures the design and returns pass, fail or "can't tell yet" with the measured value. Keeping the source and version on every rule lets a CI job flag rules whose source has changed since they were written.
