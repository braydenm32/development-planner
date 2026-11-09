# Council rule sets

Each NSW council adds its own LEP and DCP on top of the state rules in [../compliance-and-swept-path-sources.md](../compliance-and-swept-path-sources.md). This folder holds one file per council. The app covers NSW only, and only the councils marked as in the app below; for any other council only the state-wide Housing Code checks run.

| Council | File | State |
| --- | --- | --- |
| Wollongong City Council | [wollongong.md](wollongong.md) | LEP (2 Oct 2026 version) and DCP read, 8 Nov 2026. In the app: 14 of 14 controls, zone R2. |
| Kiama Municipal Council | [kiama.md](kiama.md) | LEP (15 Dec 2023 version) and DCP 2020 chapters 3 and 6 read, 9 Nov 2026. In the app: 9 of 11 controls. |
| Blue Mountains City Council | [blue-mountains.md](blue-mountains.md) | LEP (as made, 2015) and DCP 2015 Parts B and E (Amendment 8) read, 9 Nov 2026. In the app: 9 of 13 controls, zone R2. |
| Central Coast Council | [central-coast.md](central-coast.md) | LEP (as made, 2022) and DCP 2022 chapters 2.1 and 3.7 read, 9 Nov 2026. In the app: 9 of 11 controls, zones R1, R2, R3 and RU5. |
| Shellharbour City Council | none | **Not covered yet.** The LEP 2013 (version of 19 Sep 2025) was read, but the DCP is one large PDF that the research session's reader couldn't open (three tries), and the council's flipbook has no text. |
| Lake Macquarie City Council | none | **Not covered yet.** The adopted DCP 2014 Part 3 (revision 32) sits at a web address too long for the research session's reader; the only copy it could open is one dated July 2012 on council's consultation site, which may not be the rule in force. |

"Controls" counts the ones the checker knows (height, storeys, setbacks, site coverage, cut and fill and so on), leaving out those the council's text was read and doesn't have. The rest are listed in the app under "Not checked yet" as "…’s own rule isn’t in the app yet".

## How the app picks a council

Once the survey is placed on the map ([../map-placement.md](../map-placement.md)), the Planning Portal's controls lookup for the property returns the EPI name and LGA with each layer (for example "Wollongong Local Environmental Plan 2009"). The app maps that to a rule set. If no rule set exists for that council, it runs the state rules only and says the council isn't covered yet. For now the council is picked by hand under Checks › Council rules.

## What to collect for a new council

Copy the headings of [wollongong.md](wollongong.md) and fill in:

1. **The LEP**: its name and legislation id, the version date read, the zone of the block and what it permits, any local subclauses to 4.1, 4.3 and 4.4 (some councils have sliding FSRs for houses), clause 4.6 limits, and the local provisions (earthworks, flood, landslip, escarpment, riparian, scenic, acid sulfate). Map values (height, FSR, lot size) come from the ePlanning layers, not the text.
2. **The DCP**: the chapter list and dates, then for a dwelling house: height and storeys, setbacks (front, secondary, side, rear, garage), site coverage, landscaped area, private open space, solar access to neighbours, privacy, cut and fill, retaining walls, parking, garage and driveway rules, fences, pools.
3. **Engineering documents**: the vehicle crossing standard drawings and any driveway specification.
4. **Where it differs from the Housing Code**, so the app can show both answers side by side.

## How the rules are stored in code

Each council is a data table, read by one set of check functions:

```text
src/checks/councils/
  types.ts         the rule shapes (by lot size band, house height and storeys), each with its source:
                   instrument, clause, version date, url, sure: read | secondary | unverified
  wollongong.ts    one table per council, values from its research note here
  kiama.ts
  blueMountains.ts
  centralCoast.ts
  index.ts         the registry: by council id, LGA name or LEP name; old saved plans keep Wollongong on
src/checks/rules.ts  the Housing Code checks (in code, unchanged), and councilChecks(), which runs a table
```

A control a table leaves out isn't checked, and the app lists it as not checked yet. A control the council's text was read and doesn't have goes in the table's `absent` list instead, so it isn't listed as missing. To add a council: write its note here with the headings of [wollongong.md](wollongong.md), copy a table, fill in only what the note marks as read, add it to `index.ts` and to `CouncilId` in `src/checks/types.ts`, and test it on the sample block (`src/checks/__tests__/moreCouncils.test.ts`). The Wollongong findings are pinned by `src/checks/__tests__/findings.test.ts`.
