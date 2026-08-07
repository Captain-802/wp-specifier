"use strict";

// Inlines every stylesheet and script referenced by a page so the result is a
// single self-contained .html file — no server, no sibling files, nothing to
// upload alongside it.
//
//   index.html               -> Windpost-Selector-Full.html
//   l-section-prototype.html -> Windpost-Detailing-Full.html
//
// Edit the small source engines, run the tests, then rebuild. Do not hand-edit
// either generated file.

const fs = require("fs");
const path = require("path");

const root = __dirname;

const PAGES = [
  { source: "index.html", output: "Windpost-Selector-Full.html" },
  { source: "l-section-prototype.html", output: "Windpost-Detailing-Full.html" }
];

const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function inline(html) {
  let assets = 0;

  html = html.replace(
    /<link rel="stylesheet" href="\.\/(.*?)">/g,
    (_match, relativePath) => {
      assets += 1;
      return `<style>\n${read(relativePath)}\n</style>`;
    }
  );

  html = html.replace(
    /<script src="\.\/(.*?)"><\/script>/g,
    (_match, relativePath) => {
      assets += 1;
      // A literal </script> inside the source would close the wrapper early.
      return `<script>\n${read(relativePath).replaceAll("</script", "<\\/script")}\n</script>`;
    }
  );

  return { html, assets };
}

PAGES.forEach(page => {
  const built = inline(read(page.source));
  const outputPath = path.join(root, page.output);
  fs.writeFileSync(outputPath, built.html, "utf8");
  const kb = (Buffer.byteLength(built.html, "utf8") / 1024).toFixed(0);
  console.log(
    `Built ${page.output} from ${page.source} ` +
    `— ${built.assets} assets inlined, ${kb} KB`
  );
});
