// Bundles the game into single self-contained HTML files — no dependencies needed.
//   dist/homunculus.html  complete document: open it straight from disk, no server
//   dist/artifact.html    body-only fragment for hosts that wrap pages in their own <html>
// Convention the bundler relies on: plain named imports/exports and unique
// top-level names across all modules (checked below).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /^import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const DECL_RE = /^(?:export\s+)?(?:const|let|var|class|function\*?|async\s+function)\s+([A-Za-z_$][\w$]*)/gm;

export function collectModules(entry) {
  const order = [];
  const state = new Map(); // path -> 'visiting' | 'done'
  const visit = (file, chain) => {
    const st = state.get(file);
    if (st === 'done') return;
    if (st === 'visiting') throw new Error(`Import cycle: ${[...chain, file].map((f) => relative(root, f)).join(' -> ')}`);
    state.set(file, 'visiting');
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) visit(resolve(dirname(file), m[1]), [...chain, file]);
    state.set(file, 'done');
    order.push({ file, src });
  };
  visit(resolve(root, entry), []);
  return order;
}

export function bundle(entry = 'js/main.js') {
  const mods = collectModules(entry);
  const owners = new Map();
  const problems = [];
  const parts = [];
  for (const { file, src } of mods) {
    const rel = relative(root, file);
    if (/^\s*import\s/m.test(src.replace(IMPORT_RE, ''))) problems.push(`${rel}: unsupported import form`);
    if (/^export\s+(default|\{|\*)/m.test(src)) problems.push(`${rel}: unsupported export form`);
    for (const m of src.matchAll(DECL_RE)) {
      const name = m[1];
      if (owners.has(name)) problems.push(`duplicate top-level name "${name}" in ${rel} and ${owners.get(name)}`);
      else owners.set(name, rel);
    }
    const body = src.replace(IMPORT_RE, '').replace(/^export\s+(?=(const|let|var|class|function|async)\b)/gm, '');
    parts.push(`// ---- ${rel} ----\n${body.trim()}\n`);
  }
  if (problems.length) throw new Error(`Bundle check failed:\n  ${problems.join('\n  ')}`);
  return { code: `(() => {\n'use strict';\n${parts.join('\n')}\n})();\n`, modules: mods.length };
}

function between(html, a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`Markers ${a} / ${b} not found in index.html`);
  return html.slice(i + a.length, j).trim();
}

export function build() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const head = between(html, '<!-- HEAD:START -->', '<!-- HEAD:END -->');
  const app = between(html, '<!-- APP:START -->', '<!-- APP:END -->');
  const css = readFileSync(join(root, 'css/style.css'), 'utf8');
  const { code, modules } = bundle();
  const safe = code.replace(/<\/script/gi, '<\\/script');
  const fragment = `${head}\n<style>\n${css}\n</style>\n${app}\n<script>\n${safe}</script>\n`;
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n<style>\n${css}\n</style>\n</head>\n<body>\n${app}\n<script>\n${safe}</script>\n</body>\n</html>\n`;
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/homunculus.html'), full);
  writeFileSync(join(root, 'dist/artifact.html'), fragment);
  return { modules, bytes: full.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build();
  console.log(`Bundled ${r.modules} modules → dist/homunculus.html (${(r.bytes / 1024).toFixed(0)} KB) and dist/artifact.html`);
}
