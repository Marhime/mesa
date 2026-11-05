#!/usr/bin/env node
// Design-system guard (docs/DESIGN_SYSTEM.md): "Screens never style raw views".
//
// Screens (every file under app/):
//   - no hex / rgb() / hsl() colors
//   - no numeric literals for type, spacing, radius, borders or sizes (fontSize: 15, padding: 12…)
//   - no `style=`, `StyleSheet` or `contentContainerStyle`: compose DS components instead
//   - imports only from react, expo-router, @/ds and @/data
// Everywhere in src/: colors only in src/ds/tokens.ts; DS components take type from the scale.
// app.config.ts: its splash colors must equal the `surface` tokens.
//
// Usage: node scripts/check-ds.mjs   (exit code 1 on any violation)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const violations = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

/** Removes comments but keeps strings (and line numbers) intact. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\s*\(/;
const STYLE_KEYS =
  'fontSize|lineHeight|letterSpacing|fontWeight|fontFamily|padding\\w*|margin\\w*|gap|rowGap|columnGap|border\\w*Radius|borderRadius|border\\w*Width|borderWidth|width|height|minWidth|maxWidth|minHeight|maxHeight|top|left|right|bottom|inset|elevation|shadow\\w*';
const NUMERIC_STYLE = new RegExp(`\\b(?:${STYLE_KEYS})\\s*:\\s*-?\\d`);
const RAW_STYLE = /\b(?:style|contentContainerStyle)\s*=|\bStyleSheet\b/;
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/;
const ALLOWED_IMPORT = /^(?:react|expo-router(?:\/.*)?|@\/ds|@\/data)$/;

function report(file, line, rule, text) {
  violations.push(`${relative(root, file).split(sep).join('/')}:${line}  ${rule}  →  ${text.trim()}`);
}

// 1. Screens -------------------------------------------------------------------------
for (const file of walk(join(root, 'app'))) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((text, i) => {
    const ln = i + 1;
    if (HEX.test(text)) report(file, ln, 'hex color in a screen', text);
    if (COLOR_FN.test(text)) report(file, ln, 'color function in a screen', text);
    if (NUMERIC_STYLE.test(text)) report(file, ln, 'numeric style literal in a screen', text);
    if (RAW_STYLE.test(text)) report(file, ln, 'raw styling in a screen (use DS components)', text);
    const m = IMPORT.exec(text);
    const spec = m?.[1] ?? m?.[2];
    if (spec && !ALLOWED_IMPORT.test(spec)) report(file, ln, `screens import only react, expo-router, @/ds, @/data (got "${spec}")`, text);
  });
}

// 2. Library code: colors only in tokens.ts; DS type only from the scale -------------------
const TOKENS = join(root, 'src', 'ds', 'tokens.ts');
for (const file of walk(join(root, 'src'))) {
  if (file === TOKENS) continue;
  const isDs = file.includes(`${sep}src${sep}ds${sep}`);
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((text, i) => {
    const ln = i + 1;
    if (HEX.test(text)) report(file, ln, 'hex color outside src/ds/tokens.ts', text);
    if (COLOR_FN.test(text)) report(file, ln, 'color function outside src/ds/tokens.ts', text);
    if (isDs && /\bfontSize\s*:\s*\d/.test(text)) report(file, ln, 'font size outside the type scale', text);
    if (isDs && /\bfontFamily\s*:\s*['"]/.test(text)) report(file, ln, 'font family outside the type scale', text);
  });
}

// 3. app.config.ts splash colors = surface tokens -------------------------------------------
const tokens = readFileSync(TOKENS, 'utf8');
const surface = (scheme) => new RegExp(`const ${scheme}: Palette = \\{[\\s\\S]*?surface: '(#[0-9a-f]+)'`).exec(tokens)?.[1];
const config = readFileSync(join(root, 'app.config.ts'), 'utf8');
for (const [name, scheme] of [
  ['SURFACE_LIGHT', 'light'],
  ['SURFACE_DARK', 'dark'],
]) {
  const value = new RegExp(`const ${name} = '(#[0-9a-f]+)'`).exec(config)?.[1];
  const token = surface(scheme);
  if (!value || !token || value.toLowerCase() !== token.toLowerCase()) {
    violations.push(`app.config.ts  ${name} (${value}) must equal the ${scheme} surface token (${token})`);
  }
}

if (violations.length > 0) {
  console.error(`Design system check failed (${violations.length}):\n`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
const screens = walk(join(root, 'app')).length;
const lib = walk(join(root, 'src')).length;
console.log(`Design system check passed: ${screens} screen files, ${lib} source files, no raw styles or literal colors.`);
