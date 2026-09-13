# WP Specifier

Windpost selection and production detailing for cavity-wall masonry support,
by [CED Engineers](https://www.cedengineers.com).

**Live: https://captain-802.github.io/wp-specifier/**
(embedded as a whole-page embed on the CED Google Site)

Everything runs locally in the browser. No server, no build step at run time,
no external requests — which is what lets the pages be embedded in a Google
Sites page.

## Pages

| File | What it is |
|---|---|
| `index.html` | Selector: post family, support condition, load, exact height, wall build-up, fixings and bolts → section, capacity, tie schedule, connections, weights, PDF report |
| `l-section-prototype.html` | Detailing: production drawings (orthographic A4, unfolded blank, base/top connection, client approval arrangement), 3D cut-away, SVG/DXF export. Opened from the Selector's **Detailing** tab with the design carried across in the URL |
| `cavity-wall-assembly.html` | Interactive L-post cavity-wall assembly |
| `print-calibration.html` | Printer scale check for the A4 sheets |
| `dist/` | The same single-file builds under their original names |
| `src/` | Modular source — engines, data, drawing services, tests |

## Post families

| Family | Sections | Support | Detailing |
|---|---|---|---|
| U | UP standard range | simply supported / cantilever | yes |
| L | LP standard range | simply supported / cantilever | yes |
| DU | two channels welded web to web | simply supported only | yes — DU-T2 / DU-B2 slab-face plates |
| I | flat plate in the inner leaf | simply supported only | no |

Simply-supported base plates follow the standard types U-B3A / U-B3B /
L-B2A / L-B2B (by section depth); cantilever plates are sized by the
base-plate designer. DXF export uses the firm's layer standard (AutoCAD 2000).

## Editable design data

The Selector's **Design data** panel lays the workbook's editable sheets out
in the page: a capacity for every tie product (Ties sheet), the design
constants, anchor capacities, bolt SKUs with their quantity under each
connection code (add / remove / modify), and the SKU each connection uses per
bolt family. A tie level is as strong as its weaker tie (inner tie or the EDC
tie the wall selects); a DU is counted per level as the workbook. Edits are
highlighted, kept in the browser, saved inside the project JSON and printed on
the calculation record; *Reset* returns to the catalogue.

## Working on it

    cd src
    for t in tests/*.js; do node "$t"; done   # 21 suites
    node build-standalone.js                   # regenerate the single-file pages

`src/js/engines/` holds one engine per file, each an IIFE registering on
`window.Windpost` with no dependencies. Do not hand-edit the built pages at the
repo root: edit `src/`, run the suites, rebuild, then copy
`Windpost-Selector-Full.html` → `index.html` and
`Windpost-Detailing-Full.html` → `l-section-prototype.html` (the Selector links
to the Detailing page by that name).

## Notes

Capacities are rounded **down** to 2 dp, so a displayed figure is never above
the calculated one.

Design output is subject to the engineer's own checking. Published section and
tie data belongs to the respective manufacturers.
