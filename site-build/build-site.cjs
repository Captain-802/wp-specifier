#!/usr/bin/env node
'use strict';
// Builds the published site into _site/: copies the files listed in
// site-build/site.json and obfuscates every script (separate .js files and
// classic inline <script> blocks in .html). The repo keeps readable source;
// only _site/ is served.
//
// site-build/site.json: { "include": ["index.html", "js/", ...], "stringArray": true }
// Usage: node site-build/build-site.cjs [repoDir]   (default: cwd)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');

const repo = path.resolve(process.argv[2] || process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(repo, 'site-build', 'site.json'), 'utf8'));
const out = path.join(repo, '_site');

// Each chunk is obfuscated on its own, so each gets its own prefix for the
// helper globals the obfuscator adds; otherwise two chunks' helpers collide.
function prefixFor(key) {
  return '_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 6) + '_';
}

function obfuscate(code, key) {
  const res = JavaScriptObfuscator.obfuscate(code, {
    target: 'browser',
    seed: 802,
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: prefixFor(key),
    renameGlobals: false,      // inline handlers and other scripts use the globals
    renameProperties: false,
    transformObjectKeys: false,
    stringArray: cfg.stringArray !== false,
    stringArrayThreshold: cfg.stringArrayThreshold ?? 0.75,
    stringArrayEncoding: [],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 1,
    splitStrings: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    numbersToExpressions: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    unicodeEscapeSequence: false,
    sourceMap: false,
  });
  return res.getObfuscatedCode();
}

// Inline script text must never contain a literal </script or <!-- .
function safeInline(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

function processHtml(html, rel) {
  let n = 0;
  // Strip HTML comments outside <script>, <style>, <pre>, <textarea>.
  const parts = html.split(/(<(script|style|pre|textarea)\b[\s\S]*?<\/\2\s*>)/i);
  let outHtml = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === undefined) continue;
    if (i % 3 === 2) continue; // captured tag name
    if (i % 3 === 1) {
      const m = p.match(/^<script\b([^>]*)>([\s\S]*?)<\/script\s*>$/i);
      if (m && !/\bsrc\s*=/i.test(m[1])) {
        const t = (m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [, ''])[1].toLowerCase();
        if (JS_TYPES.has(t) && m[2].trim()) {
          const code = safeInline(obfuscate(m[2], rel + '#' + (n++)));
          outHtml += '<script' + m[1] + '>' + code + '</script>';
          continue;
        }
      }
      outHtml += p;
    } else {
      outHtml += p.replace(/<!--(?!\[if|<!\[endif)[\s\S]*?-->/g, '');
    }
  }
  return { html: outHtml, scripts: n };
}

function walk(rel, list) {
  const abs = path.join(repo, rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(abs)) walk(path.posix.join(rel, f), list);
  } else list.push(rel);
}

fs.rmSync(out, { recursive: true, force: true });
const files = [];
for (const inc of cfg.include) walk(inc.replace(/\/$/, ''), files);

let jsCount = 0, inlineCount = 0;
for (const rel of files) {
  const src = path.join(repo, rel);
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.js' && !/\.min\.js$/i.test(rel)) {
    fs.writeFileSync(dst, obfuscate(fs.readFileSync(src, 'utf8'), rel));
    jsCount++;
  } else if (ext === '.html' || ext === '.htm') {
    const r = processHtml(fs.readFileSync(src, 'utf8'), rel);
    fs.writeFileSync(dst, r.html);
    inlineCount += r.scripts;
  } else {
    fs.copyFileSync(src, dst);
  }
}
console.log(`_site: ${files.length} files, ${jsCount} .js obfuscated, ${inlineCount} inline scripts obfuscated`);
