// Reading recipe websites: schema.org Recipe in JSON-LD, Open Graph tags, and readable page text.
import * as cheerio from 'cheerio';
import { recipeTotalMinutes } from './duration';
import { parseServings } from './servings';

export interface WebRecipe {
  title: string;
  servings: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
  /** Absolute image URL from the Recipe node, if any. */
  image: string | null;
  language: string | null;
  /** The recipe's author as the page names it (JSON-LD author), if any. */
  author: string | null;
}

export interface PageInfo {
  url: string;
  /** og:title, else <title>. */
  title: string | null;
  description: string | null;
  /** og:image (absolute). */
  image: string | null;
  /** <html lang>, as a 2-letter code. */
  language: string | null;
  /** og:site_name, else application-name. */
  siteName: string | null;
  recipe: WebRecipe | null;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Single-line text: tags stripped, entities decoded, whitespace collapsed. */
export function cleanInline(s: string): string {
  return decodeHtml(s).replace(/\s+/g, ' ').trim();
}

/** Multi-line text: <br>, </p>, </li> become line breaks; returns trimmed non-empty lines. */
export function cleanLines(s: string): string[] {
  return decodeHtml(s.replace(/<br\s*\/?>|<\/(?:p|li|div|h\d)>/gi, '\n'))
    .split(/\r?\n|\u2028|\u2029/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

function decodeHtml(s: string): string {
  const str = s.replace(/\u00a0/g, ' ');
  if (!/[<&]/.test(str)) return str;
  // Twice: JSON-LD strings are sometimes double-encoded ("&amp;frac12;").
  let out = str;
  for (let i = 0; i < 2 && /[<&]/.test(out); i++) out = cheerio.load(out, null, false).text();
  return out;
}

function absoluteUrl(src: string, base: string): string | null {
  const s = src.trim();
  if (s === '' || s.startsWith('data:')) return null;
  try {
    const u = new URL(s, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function langCode(v: unknown): string | null {
  const s = typeof v === 'string' ? v : isObject(v) ? (v.alternateName ?? v.name) : null;
  if (typeof s !== 'string') return null;
  const m = /^([a-z]{2,3})(?:[-_]|$)/i.exec(s.trim());
  if (m) return m[1]!.toLowerCase();
  const names: Record<string, string> = { spanish: 'es', espanol: 'es', english: 'en', french: 'fr', francais: 'fr' };
  return names[s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? null;
}

// JSON-LD -----------------------------------------------------------------------

/** JSON.parse with the usual repairs: HTML comments, CDATA, raw control characters, trailing commas. */
export function parseJsonLoose(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^<!--|-->$/g, '')
    .replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // fall through to repairs
  }
  const repaired = stripped.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

function hasRecipeType(node: Json): boolean {
  const t = node['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && /(?:^|[/:])Recipe$/i.test(x.trim()));
}

/** Depth-first search through arrays, @graph and nested objects (mainEntity, …) for a Recipe node. */
export function findRecipeNode(data: unknown, depth = 0): Json | null {
  if (depth > 8) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(data)) return null;
  if (hasRecipeType(data)) return data;
  if (data['@graph'] !== undefined) {
    const found = findRecipeNode(data['@graph'], depth + 1);
    if (found) return found;
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === '@graph' || key === '@context') continue;
    if (value !== null && typeof value === 'object') {
      const found = findRecipeNode(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
  }
  return null;
}

/** image as a string, an array, or ImageObject {url | contentUrl}; the first usable one wins. */
export function pickImage(v: unknown, base: string): string | null {
  if (typeof v === 'string') return absoluteUrl(v, base);
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickImage(x, base);
      if (u) return u;
    }
    return null;
  }
  if (isObject(v)) {
    for (const key of ['url', 'contentUrl', '@id']) {
      const s = v[key];
      if (typeof s === 'string') {
        const u = absoluteUrl(s, base);
        if (u && (key !== '@id' || !u.includes('#'))) return u;
      }
    }
  }
  return null;
}

const STEP_NUMBER = /^(?:(?:step|paso|etapa|étape)\s*)?\d{1,2}\s*[.):-]\s+|^(?:step|paso|étape)\s*\d{1,2}\s*$/i;

/** Flattens recipeInstructions: strings, HowToStep, HowToSection/ItemList with itemListElement. */
export function collectSteps(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || v === null || v === undefined) return out;
  if (typeof v === 'string') {
    for (const line of cleanLines(v)) {
      const text = line.replace(STEP_NUMBER, '').trim();
      if (text.length > 1) out.push(text);
    }
    return out;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectSteps(x, out, depth + 1);
    return out;
  }
  if (isObject(v)) {
    if (v.itemListElement !== undefined) {
      collectSteps(v.itemListElement, out, depth + 1);
      return out;
    }
    const text = firstString(v.text) ?? firstString(v.description) ?? firstString(v.name);
    if (text) collectSteps(text, out, depth + 1);
  }
  return out;
}

/**
 * recipeIngredient (or the old `ingredients`): strings, one per line. Section headings ("For the sauce:")
 * stay: the import reads them as the sections of the lines under them (ingredient-lines.ts).
 */
export function collectIngredients(v: unknown): string[] {
  const raw: string[] = [];
  const visit = (x: unknown): void => {
    if (typeof x === 'string') raw.push(...cleanLines(x));
    else if (Array.isArray(x)) x.forEach(visit);
    else if (isObject(x)) {
      const s = firstString(x.text) ?? firstString(x.name);
      if (s) raw.push(...cleanLines(s));
    }
  };
  visit(v);
  return raw
    .map((l) => l.replace(/^[-–•*▢□☐]\s*/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 100);
}

/** author as a string, a Person / Organization, or an array of them: the first name given. */
export function authorName(v: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof v === 'string') return cleanInline(v) || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const name = authorName(x, depth + 1);
      if (name) return name;
    }
    return null;
  }
  return isObject(v) ? authorName(v.name, depth + 1) : null;
}

export function recipeFromNode(node: Json, pageUrl: string, pageLanguage: string | null): WebRecipe {
  const name = firstString(node.name) ?? firstString(node.headline) ?? '';
  return {
    title: cleanInline(name),
    servings: parseServings(node.recipeYield ?? node.yield),
    totalMinutes: recipeTotalMinutes(node),
    ingredients: collectIngredients(node.recipeIngredient ?? node.ingredients),
    steps: collectSteps(node.recipeInstructions),
    image: pickImage(node.image, pageUrl) ?? pickImage(node.thumbnailUrl, pageUrl),
    language: langCode(node.inLanguage) ?? pageLanguage,
    author: authorName(node.author ?? node.creator),
  };
}

function meta($: cheerio.CheerioAPI, ...names: string[]): string | null {
  for (const n of names) {
    const v = $(`meta[property="${n}"], meta[name="${n}"]`).first().attr('content');
    if (v && v.trim() !== '') return cleanInline(v);
  }
  return null;
}

/** Everything the website pipeline needs from one HTML document. */
export function parsePage(html: string, pageUrl: string): PageInfo {
  const $ = cheerio.load(html);
  const language = langCode($('html').attr('lang') ?? meta($, 'og:locale') ?? '');
  const ogImage = meta($, 'og:image:secure_url', 'og:image', 'twitter:image');

  let recipe: WebRecipe | null = null;
  $('script[type]').each((_, el) => {
    if (recipe) return;
    const type = ($(el).attr('type') ?? '').toLowerCase();
    if (!type.includes('ld+json')) return;
    const data = parseJsonLoose($(el).html() ?? '');
    const node = findRecipeNode(data);
    if (node) recipe = recipeFromNode(node, pageUrl, language);
  });

  return {
    url: pageUrl,
    title: meta($, 'og:title', 'twitter:title') ?? (cleanInline($('title').first().text()) || null),
    description: meta($, 'og:description', 'description', 'twitter:description'),
    image: ogImage ? absoluteUrl(ogImage, pageUrl) : null,
    language,
    siteName: meta($, 'og:site_name', 'application-name'),
    recipe,
  };
}

// Readable text -------------------------------------------------------------------

const NOISE =
  'script, style, noscript, template, svg, canvas, iframe, object, embed, nav, header, footer, aside, form, button, ' +
  'select, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"], .comments, #comments, ' +
  '.comment-list, .related, .share, .social, .newsletter, .advertisement, .ad, .ads, .cookie, #cookie-notice';
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, div, section, article, tr, dd, dt, blockquote, pre, figcaption, td, th';

/**
 * The page's visible text for the model when there is no JSON-LD: scripts, styles, navigation,
 * headers, footers and comment sections removed; one block per line; capped at `maxChars`.
 */
export function extractReadableText(html: string, maxChars = 30_000): string {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  const candidates = ['[itemtype*="schema.org/Recipe" i]', '.wprm-recipe-container', '.tasty-recipes', 'article', 'main', '[role="main"]'];
  const chosen = candidates.find((sel) => $(sel).first().text().replace(/\s+/g, ' ').trim().length >= 400) ?? 'body';
  const root = $(chosen).first();
  root.find('br').replaceWith('\n');
  root.find(BLOCKS).each((_, el) => {
    $(el).append('\n');
  });
  const lines: string[] = [];
  for (const raw of root.text().split('\n')) {
    const line = raw.replace(/[\s\u00a0]+/g, ' ').trim();
    if (line.length === 0 || line === lines[lines.length - 1]) continue;
    lines.push(line);
  }
  const text = lines.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
