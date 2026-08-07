# WP Specifier

Windpost selection and detailing for cavity-wall masonry support, by
[CED Engineers](https://www.cedengineers.com).

**Live: https://captain-802.github.io/wp-specifier/**

Everything runs locally in the browser. No server, no build step, no external
requests — which is what lets the same file be embedded in a Google Sites page.

## What it does

Enter the wall build-up, height, support condition and required ULS load, and
it selects a standard windpost and its full tie schedule in one pass.

**Post families**

| Family | Sections | Detailing |
|---|---|---|
| U  | 40 UP sections | Production drawings |
| L  | 31 LP sections | Production drawings |
| DU | 12 sections, 60–115 × 60 × 6 | Not yet — baseplate still to be defined |

A DU is two channels welded web to web. It carries **two sets of ties at every
level** (1 EDC + 1 U per set, so 4 ties per level), and its tie strength is
twice the single U value.

**Tie strengths are editable.** Design assumptions → *Edit tie strengths*.
Values are per tie level. The DU value follows the U tie automatically unless
you give it one of its own. Edited values are flagged in the panel so a saved
calculation is never mistaken for catalogue values.

## Layout

    index.html        the whole application as one self-contained file
    dist/             separate single-file Selector and Detailing builds
    src/              modular source — engines, tests, drawing tools

## Working on it

    cd src
    node tests/run-tests.js        # core suite
    node tests/tie-strength-tests.js
    node build-standalone.js       # regenerate dist/

`src/js/engines/` holds one engine per file, each an IIFE registering on
`window.Windpost` with no dependencies. Section catalogues and design
constants are generated from `windpost-database.xlsx` — see
`src/HOW-TO-UPDATE-DATABASE.md`.

## Notes

Capacities are rounded **down** to 2 dp, so a displayed figure is never above
the calculated one.

Design output is subject to the engineer's own checking. Published section and
tie data belongs to the respective manufacturers.
