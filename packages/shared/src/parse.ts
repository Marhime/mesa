// Free-text parsing: grocery input typed like Apple Notes / pasted from WhatsApp, and recipe lines.
import type { Unit } from './types';
import { capitalize, normalizeText, singularize } from './normalize';
import { isConnector, norm, readQuantity, skipConnectors, tokenize } from './quantity';

export interface ParsedItem {
  label: string;
  quantity: number | null;
  unit: Unit | null;
  raw: string;
}

type Mode = 'grocery' | 'ingredient';

interface Core {
  label: string;
  quantity: number | null;
  unit: Unit | null;
}

// Pictographs, dingbats and joiners: "🥑 aguacates" reads as "aguacates".
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const BULLET_PREFIX =
  /^(?:[-–—*•·◦▪‣⁃○●>+]+\s*)?(?:\[\s*[xX✓✔]?\s*\]\s*)?(?:[☐☑☒✓✔]\s*)?(?:\d{1,3}[.)]\s+)?/;
const INLINE_BULLETS = new Set(['•', '·', '☐', '☑', '☒', '▪', '◦', '|', ';', '\t']);
const EDGE_PUNCT = /^[\s\-–—:;,.*•·=+_/\\|]+|[\s\-–—:;,*•·=+_/\\|]+$/g;
const TRAILING_DOTS = /\.+$/;

/** Words that end a list line header: "Compra:", "Lista del súper:", "Shopping list:", "Courses :". */
const HEADERS = new Set([
  'compra', 'compras', 'comprar', 'a comprar', 'por comprar', 'hay que comprar', 'lista', 'lista de compras',
  'lista del super', 'lista de super', 'lista del mandado', 'lista de la compra', 'super', 'el super',
  'para el super', 'mandado', 'despensa', 'necesitamos', 'falta', 'faltan', 'traer', 'trae', 'traes', 'shopping',
  'shopping list', 'grocery', 'groceries', 'grocery list', 'to buy', 'buy', 'need', 'we need', 'list', 'todo',
  'to do', 'courses', 'liste', 'liste de courses', 'a acheter', 'acheter', 'il faut', 'pendientes',
]);

/** "X and Y" names that must stay one item. */
const AND_PHRASES = [
  'mac and cheese', 'macaroni and cheese', 'fish and chips', 'half and half', 'salt and vinegar',
  'sour cream and onion', 'cookies and cream', 'peanut butter and jelly', 'pb and j', 'surf and turf',
  'moros y cristianos', 'mar y tierra', 'pan y quesillo', 'tres leches',
];

/** Vague amounts that mean "no quantity" ("un poco de sal", "unos tomates", "some milk"). */
const VAGUE_PREFIXES = [
  'un poco de', 'un poquito de', 'un poco', 'unos', 'unas', 'algunos', 'algunas', 'varios', 'varias', 'un chorrito de',
  'un chorro de', 'un puno de', 'un punado de', 'some', 'a few', 'a little', 'a bit of', 'a splash of', 'a drizzle of',
  'a handful of', 'quelques', 'un peu de', 'un filet de', 'une poignee de', 'du', 'des',
].map((p) => p.split(' '));

/** Number of leading tokens that form a vague amount, or 0. */
function vagueLength(tokens: string[]): number {
  for (const words of VAGUE_PREFIXES) {
    if (words.length >= tokens.length) continue;
    if (words.every((w, i) => norm(tokens[i]) === w)) return words.length;
  }
  return 0;
}

/** Words before a trailing bare number that make it part of the name ("talla 3", "etapa 4"). */
const TRAILING_BLOCKERS = new Set(['etapa', 'talla', 'size', 'no', 'num', 'numero', 'n', '#', 'tipo', 'type', 'stage', 'pack', 'paquete']);

const NOTE_TAIL =
  /\s*[(,]?\s*(?:al gusto|a gusto|to taste|au go[uû]t|c\/n|c\.n\.|cantidad necesaria|opcional|optional|facultatif|if desired|si se desea|para decorar|para servir|for garnish|to serve|pour servir|pour d[ée]corer)\)?\.?$/i;

function cleanLabel(s: string): string {
  return s.replace(/\s+/g, ' ').replace(EDGE_PUNCT, '').replace(TRAILING_DOTS, '').replace(EDGE_PUNCT, '').trim();
}

function hasWordChar(label: string): boolean {
  return /[^\s\d.,;:!?¡¿()[\]{}\-–—_*•·'"/\\+=#%&@~^`|<>]/.test(label);
}

/** Top-level split on a comma that is not a decimal comma ("1,5 kg" stays whole). */
function splitOnCommas(s: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === ',' && !(/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? ''))) {
      out.push(s.slice(start, i));
      start = i + 1;
    } else if (INLINE_BULLETS.has(ch)) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** Text before the first prep note: "2 jitomates, picados" → "2 jitomates"; "-" notes too. */
function cutPrepNote(s: string): string {
  const parts = splitOnCommas(s);
  let head = parts[0] ?? s;
  const dash = /\s[-–—]\s+(?=\D)/.exec(head);
  if (dash && dash.index > 0) head = head.slice(0, dash.index);
  return head;
}

interface Paren {
  text: string;
  quantity: Core | null;
}

function pullParentheses(s: string): { rest: string; parens: Paren[] } {
  const parens: Paren[] = [];
  const rest = s.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    const tokens = tokenize(inner.trim());
    const q = tokens.length > 0 ? readQuantity(tokens, 0) : null;
    const quantity = q && q.end === tokens.length && q.strong ? { label: '', quantity: q.quantity, unit: q.unit } : null;
    parens.push({ text: inner, quantity });
    return ' \u0000 ';
  });
  return { rest, parens };
}

function parseCore(text: string, mode: Mode): Core {
  let s = text.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
  const { rest, parens } = pullParentheses(s);
  // Grocery labels keep their non-quantity parentheses ("Leche (deslactosada)"); recipe lines drop them.
  let parenIndex = 0;
  s = rest.replace(/\u0000/g, () => {
    const p = parens[parenIndex++];
    return p && p.quantity === null && mode === 'grocery' ? `(${p.text})` : ' ';
  });
  if (mode === 'ingredient') {
    s = cutPrepNote(s);
    for (let i = 0; i < 2; i++) s = s.replace(NOTE_TAIL, '');
  }
  const parenQty = parens.find((p) => p.quantity !== null)?.quantity ?? null;
  let tokens = tokenize(s.trim());
  const vague = vagueLength(tokens);
  const isVague = vague > 0;
  if (isVague) tokens = skipConnectors(tokens, vague);

  let quantity: number | null = null;
  let unit: Unit | null = null;
  let labelTokens: string[] = tokens;

  const lead = tokens.length > 0 && !isVague ? readQuantity(tokens, 0) : null;
  if (lead) {
    quantity = lead.quantity;
    unit = lead.unit;
    labelTokens = skipConnectors(tokens, lead.end);
    if (labelTokens.length === 0 && lead.unitStart >= 0) {
      // "2 latas" alone: keep the word as the label, count it.
      labelTokens = tokens.slice(lead.unitStart, lead.end);
      quantity = lead.count;
      unit = 'unit';
    }
  } else if (isVague) {
    // "un poco de sal", "unos tomates": no quantity
  } else if (parenQty) {
    quantity = parenQty.quantity;
    unit = parenQty.unit;
  } else {
    const trail = readTrailing(tokens);
    if (trail) {
      quantity = trail.quantity;
      unit = trail.unit;
      labelTokens = tokens.slice(0, trail.start);
    }
  }
  if (mode === 'ingredient' && !lead) labelTokens = skipConnectors(labelTokens, 0);
  const label = cleanLabel(labelTokens.join(' '));
  return { label: capitalize(label), quantity, unit };
}

/** Quantity written after the name: "leche x2", "queso 500g", "tortillas medio kilo", "Farine : 200 g". */
function readTrailing(tokens: string[]): { quantity: number; unit: Unit; start: number } | null {
  for (let k = Math.max(1, tokens.length - 8); k < tokens.length; k++) {
    const q = readQuantity(tokens, k);
    if (!q || q.end !== tokens.length || !q.strong || !q.hasNumber) continue;
    const before = cleanLabel(tokens.slice(0, k).join(' '));
    if (!hasWordChar(before)) continue;
    if (!q.hasUnit) {
      const prev = norm(tokens[k - 1]).replace(/[:.]$/, '');
      const bareInteger = /^\d+$/.test(tokens[k]!) && tokens.length - k === 1;
      if (TRAILING_BLOCKERS.has(prev)) continue;
      if (bareInteger && q.quantity > 99) continue; // "Coca 600" is a size, not 600 bottles
    }
    return { quantity: q.quantity, unit: q.unit, start: k };
  }
  return null;
}

function stripBullet(s: string): string {
  return s.trim().replace(BULLET_PREFIX, '').trim();
}

/** Removes "Compra:" style headers. Returns null for a header line with nothing after it. */
function stripHeader(line: string): string | null {
  const m = /^([^:]{1,40}):\s*(.*)$/.exec(line);
  if (!m) return line;
  const head = normalizeText(m[1]!).replace(/[¡!¿?.]/g, '').trim();
  const rest = m[2]!.trim();
  if (rest.length === 0) return /\d/.test(head) ? line : null;
  if (HEADERS.has(head)) return rest;
  return line;
}

const CONJUNCTION = /\s(y|and|et)\s/gi;
const HALF_START = /^(?:medio|media|half|demi|demie|a half|one half)\b/i;

/** "2 aguacates y tortillas" → ["2 aguacates", "tortillas"], unless it reads as one name. */
function splitLastConjunction(seg: string): string[] {
  const n = normalizeText(seg);
  if (AND_PHRASES.some((p) => n.includes(p))) return [seg];
  let match: RegExpExecArray | null = null;
  for (const m of seg.matchAll(CONJUNCTION)) match = m;
  if (!match) return [seg];
  const left = seg.slice(0, match.index).trim();
  const right = seg.slice(match.index + match[0].length).trim();
  if (left.length === 0 || right.length === 0 || HALF_START.test(normalizeText(right))) return [seg];
  const l = parseCore(left, 'grocery');
  const r = parseCore(right, 'grocery');
  if (!hasWordChar(l.label) || !hasWordChar(r.label)) return [seg];
  return [left, right];
}

/**
 * Splits grocery text into items: newlines, commas, semicolons and list bullets
 * (-, •, *, ·, [ ], ☐, - [ ], 1., 1)). Reads leading and trailing quantities, drops empties and duplicates.
 */
export function parseGroceryInput(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r\n|\r|\n|\u2028|\u2029/)) {
    const line = stripHeader(stripBullet(rawLine));
    if (line === null) continue;
    const segments = splitOnCommas(line)
      .map((seg) => stripBullet(seg))
      .filter((seg) => seg.length > 0);
    if (segments.length >= 2) {
      const last = segments.pop()!;
      segments.push(...splitLastConjunction(last));
    }
    for (const seg of segments) {
      const core = parseCore(seg, 'grocery');
      if (!hasWordChar(core.label)) continue;
      const key = `${normalizeText(core.label)}|${core.quantity}|${core.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...core, raw: seg });
    }
  }
  return items;
}

/**
 * One recipe ingredient line: "2 cdas de aceite" → {label "Aceite", 2, tbsp}.
 * Preparation notes after a comma or in parentheses are left out of the label.
 */
export function parseIngredientLine(line: string): ParsedItem {
  const raw = line.trim();
  const core = parseCore(stripBullet(raw), 'ingredient');
  if (!hasWordChar(core.label)) {
    return { label: capitalize(cleanLabel(stripBullet(raw))), quantity: core.quantity, unit: core.unit, raw };
  }
  return { ...core, raw };
}

const wordsOf = (s: string): string[] => normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0).map((w) => singularize(w));

/**
 * The measure a recipe line uses that has no unit code: "1 thumb ginger, sliced" → "thumb", "3 ramitas de
 * cilantro" → "ramitas", "1 large thumb ginger" → "large thumb". Null when the line starts with no amount,
 * when its unit is a known one ("2 tbsp oil"), or when the words after the amount are the ingredient
 * itself (`name`, as stored: "2 Ginger").
 */
export function measureWord(line: string, name: string): string | null {
  const { rest } = pullParentheses(stripBullet(line).replace(EMOJI, ' '));
  const tokens = tokenize(cutPrepNote(rest.replace(/\u0000/g, ' ')).trim());
  const lead = tokens.length > 0 ? readQuantity(tokens, 0) : null;
  if (!lead || lead.hasUnit || !lead.hasNumber) return null;
  const own = new Set(wordsOf(name));
  const measure: string[] = [];
  let i = lead.end;
  for (; i < tokens.length && measure.length < 2; i++) {
    const token = tokens[i]!;
    const word = wordsOf(token);
    if (isConnector(token) || word.length === 0 || word.some((w) => own.has(w)) || !/^\p{L}/u.test(word[0]!)) break;
    measure.push(token.toLowerCase());
  }
  // Something must be left after the measure: the ingredient itself.
  return measure.length > 0 && i < tokens.length ? measure.join(' ') : null;
}
