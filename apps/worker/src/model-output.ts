// What the model must return, and the zod layer that turns sloppy JSON into an ExtractedRecipe.
import { Type, type Schema } from '@google/genai';
import { z } from 'zod';
import { parseIngredientLine, type Category, type ExtractedIngredient, type ExtractedRecipe } from '@mesa/shared';
import { parseDurationMinutes } from './duration';
import { parseServings } from './servings';

export const CATEGORIES = ['produce', 'bakery', 'meat', 'dairy', 'frozen', 'cupboard', 'drinks', 'household', 'other'] as const;

const nullable = (s: Schema): Schema => ({ ...s, nullable: true });

const INGREDIENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    raw_text: { type: Type.STRING, description: 'The ingredient as written or said in the source, in its language.' },
    name_en: { type: Type.STRING, description: 'Canonical English grocery product name, singular, lowercase.' },
    quantity: nullable({ type: Type.NUMBER, description: 'Amount as a number; null when not stated.' }),
    unit: nullable({ type: Type.STRING, description: 'Unit as written ("taza", "cda", "g"); null for plain counts.' }),
    is_guessed: { type: Type.BOOLEAN },
    is_optional: { type: Type.BOOLEAN },
    category: nullable({ type: Type.STRING, format: 'enum', enum: [...CATEGORIES] }),
  },
  required: ['raw_text', 'name_en', 'quantity', 'unit', 'is_guessed', 'is_optional', 'category'],
  propertyOrdering: ['raw_text', 'name_en', 'quantity', 'unit', 'is_guessed', 'is_optional', 'category'],
};

/** responseSchema for full extraction: ExtractedRecipe + not_a_recipe (+ image_shows_dish for photos). */
export const RECIPE_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    not_a_recipe: { type: Type.BOOLEAN },
    title: { type: Type.STRING },
    servings: nullable({ type: Type.INTEGER }),
    total_minutes: nullable({ type: Type.INTEGER }),
    language: nullable({ type: Type.STRING, description: 'ISO 639-1 code of the source language.' }),
    ingredients: { type: Type.ARRAY, items: INGREDIENT_SCHEMA },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_shows_dish: nullable({ type: Type.BOOLEAN, description: 'True when a provided image shows the finished dish.' }),
  },
  required: ['not_a_recipe', 'title', 'servings', 'total_minutes', 'language', 'ingredients', 'steps'],
  propertyOrdering: ['not_a_recipe', 'title', 'servings', 'total_minutes', 'language', 'ingredients', 'steps', 'image_shows_dish'],
};

/** responseSchema for the small batched name translation used with JSON-LD recipes. */
export const TRANSLATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          i: { type: Type.INTEGER },
          name_en: { type: Type.STRING },
          category: nullable({ type: Type.STRING, format: 'enum', enum: [...CATEGORIES] }),
          is_optional: { type: Type.BOOLEAN },
        },
        required: ['i', 'name_en', 'category', 'is_optional'],
        propertyOrdering: ['i', 'name_en', 'category', 'is_optional'],
      },
    },
  },
  required: ['items'],
};

// Coercions -----------------------------------------------------------------------

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

/** Parses the model's text as JSON, tolerating ```json fences and text around the object. */
export function parseModelJson(text: string | undefined): unknown {
  if (text === undefined || text.trim() === '') throw new ModelOutputError('empty model response');
  let s = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fenced) s = fenced[1]!;
  try {
    return JSON.parse(s);
  } catch {
    const start = s.search(/[[{]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new ModelOutputError('model response is not valid JSON');
  }
}

const NULL_WORDS = new Set(['', 'null', 'none', 'n/a', 'na', 'undefined', '-', 'unknown']);

function toText(v: unknown): string {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function toNullableText(v: unknown): string | null {
  const s = toText(v);
  return NULL_WORDS.has(s.toLowerCase()) ? null : s;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return /^(?:true|yes|si|sí|1|y)$/i.test(v.trim());
  return false;
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined || (typeof v === 'string' && NULL_WORDS.has(v.trim().toLowerCase()))) return null;
  return toBool(v);
}

/** 2, "2", "1/2", "1 ½", "1,5", "2-3" (→ 3), "dos" → number; 0, negatives and junk → null. */
export function toQuantity(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && !NULL_WORDS.has(v.trim().toLowerCase())) n = parseIngredientLine(v.trim()).quantity;
  if (n === null || !Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 1000) / 1000;
}

const CATEGORY_SYNONYMS: Record<string, Category> = {
  vegetable: 'produce', vegetables: 'produce', fruit: 'produce', fruits: 'produce', herbs: 'produce', herb: 'produce',
  'fruits & vegetables': 'produce', 'fresh produce': 'produce', verduras: 'produce', frutas: 'produce',
  bread: 'bakery', breads: 'bakery', tortillas: 'bakery', panaderia: 'bakery',
  'meat & fish': 'meat', 'meat & seafood': 'meat', fish: 'meat', seafood: 'meat', poultry: 'meat', carne: 'meat', meats: 'meat',
  'dairy & eggs': 'dairy', eggs: 'dairy', egg: 'dairy', cheese: 'dairy', lacteos: 'dairy',
  freezer: 'frozen', congelados: 'frozen',
  pantry: 'cupboard', spices: 'cupboard', spice: 'cupboard', condiments: 'cupboard', 'canned goods': 'cupboard',
  'dry goods': 'cupboard', grains: 'cupboard', baking: 'cupboard', sauces: 'cupboard', oils: 'cupboard', despensa: 'cupboard',
  beverages: 'drinks', beverage: 'drinks', drink: 'drinks', bebidas: 'drinks',
  cleaning: 'household', hogar: 'household',
};

export function toCategory(v: unknown): Category | null {
  const s = toText(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if ((CATEGORIES as readonly string[]).includes(s)) return s as Category;
  return CATEGORY_SYNONYMS[s] ?? null;
}

const LANGUAGE_NAMES: Record<string, string> = { spanish: 'es', espanol: 'es', english: 'en', ingles: 'en', french: 'fr', frances: 'fr', francais: 'fr', portuguese: 'pt', italian: 'it' };

function toLanguage(v: unknown): string | null {
  const s = toText(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === '') return null;
  const m = /^([a-z]{2})(?:[-_][a-z]+)?$/.exec(s);
  if (m) return m[1]!;
  return LANGUAGE_NAMES[s] ?? null;
}

const STEP_NUMBER = /^(?:(?:step|paso|étape)\s*)?\d{1,2}\s*[.):-]\s*|^(?:step|paso|étape)\s+\d{1,2}\s*/i;

function toSteps(v: unknown): string[] {
  const items = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const item of items) {
    const text =
      typeof item === 'string' ? item
      : item !== null && typeof item === 'object' ? toText((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).step ?? (item as Record<string, unknown>).description)
      : '';
    for (const line of text.split(/\r?\n/)) {
      const t = line.replace(/\s+/g, ' ').trim().replace(STEP_NUMBER, '').trim();
      if (t.length > 1) out.push(t);
    }
  }
  return out;
}

// Schemas -------------------------------------------------------------------------

const zText = z.preprocess(toText, z.string());
const zNullableText = z.preprocess(toNullableText, z.string().nullable());
const zBool = z.preprocess(toBool, z.boolean());

const IngredientSchema = z.object({
  raw_text: zText,
  name_en: zText,
  quantity: z.preprocess(toQuantity, z.number().positive().nullable()),
  unit: zNullableText,
  is_guessed: zBool,
  is_optional: zBool,
  category: z.preprocess(toCategory, z.enum(CATEGORIES).nullable()),
});

const OutputSchema = z.object({
  not_a_recipe: zBool,
  title: z.preprocess((v) => toText(v).slice(0, 200), z.string()),
  servings: z.preprocess((v) => parseServings(typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v), z.number().int().min(1).max(50).nullable()),
  total_minutes: z.preprocess(parseDurationMinutes, z.number().int().positive().nullable()),
  language: z.preprocess(toLanguage, z.string().nullable()),
  ingredients: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())),
  steps: z.preprocess(toSteps, z.array(z.string())),
  image_shows_dish: z.preprocess(toBoolOrNull, z.boolean().nullable()),
});

/** One ingredient from the model; strings are parsed as lines; null when there is nothing in it. */
export function normalizeIngredient(raw: unknown): ExtractedIngredient | null {
  const input = typeof raw === 'string' ? { raw_text: raw } : raw;
  if (input === null || typeof input !== 'object') return null;
  const parsed = IngredientSchema.safeParse(input);
  if (!parsed.success) return null;
  const ing = parsed.data;
  let rawText = ing.raw_text;
  let nameEn = ing.name_en.toLowerCase();
  let quantity = ing.quantity;
  let unit = ing.unit;

  if (rawText === '' && nameEn === '') return null;
  if (typeof raw === 'string') {
    const line = parseIngredientLine(rawText);
    quantity = line.quantity;
    unit = line.unit;
    nameEn = line.label.toLowerCase();
  }
  if (rawText === '') rawText = [quantity, unit, nameEn].filter((x) => x !== null && x !== '').join(' ');
  if (nameEn === '') nameEn = parseIngredientLine(rawText).label.toLowerCase();
  if (nameEn === '' || !/\p{L}/u.test(nameEn)) return null;
  if (quantity === null) unit = null;

  return {
    raw_text: rawText,
    name_en: nameEn,
    quantity,
    unit,
    is_guessed: quantity !== null && ing.is_guessed,
    is_optional: ing.is_optional,
    category: ing.category,
  };
}

export type ModelOutcome =
  | { kind: 'not_recipe' }
  | { kind: 'recipe'; recipe: ExtractedRecipe; imageShowsDish: boolean | null };

/** Validates and cleans the model's JSON. Throws ModelOutputError when it is not an object at all. */
export function normalizeModelOutput(raw: unknown): ModelOutcome {
  let obj: unknown = raw;
  if (Array.isArray(obj)) obj = obj.find((x) => x !== null && typeof x === 'object');
  if (obj !== null && typeof obj === 'object' && 'recipe' in obj && typeof (obj as { recipe: unknown }).recipe === 'object') {
    const outer = obj as { recipe: unknown; not_a_recipe?: unknown };
    obj = { not_a_recipe: outer.not_a_recipe, ...(outer.recipe as object) };
  }
  if (obj === null || typeof obj !== 'object') throw new ModelOutputError('model response is not an object');
  const parsed = OutputSchema.safeParse(obj);
  if (!parsed.success) throw new ModelOutputError(`model response failed validation: ${parsed.error.message}`);
  const out = parsed.data;
  if (out.not_a_recipe) return { kind: 'not_recipe' };

  const ingredients = out.ingredients.map(normalizeIngredient).filter((i): i is ExtractedIngredient => i !== null);
  return {
    kind: 'recipe',
    imageShowsDish: out.image_shows_dish,
    recipe: {
      title: out.title,
      servings: out.servings,
      total_minutes: out.total_minutes,
      ingredients,
      steps: out.steps,
      language: out.language,
    },
  };
}

export interface Translation {
  name_en: string;
  category: Category | null;
  is_optional: boolean;
}

const TranslationItem = z.object({
  i: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().nonnegative()),
  name_en: zText,
  category: z.preprocess(toCategory, z.enum(CATEGORIES).nullable()),
  is_optional: zBool,
});

/** {items:[{i, name_en, category, is_optional}]} → Map by line index; bad items are skipped. */
export function normalizeTranslations(raw: unknown): Map<number, Translation> {
  const out = new Map<number, Translation>();
  const items = Array.isArray(raw) ? raw : raw !== null && typeof raw === 'object' ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) throw new ModelOutputError('translation response has no items');
  for (const item of items) {
    const parsed = TranslationItem.safeParse(item);
    if (!parsed.success) continue;
    const name = parsed.data.name_en.toLowerCase();
    if (name === '' || out.has(parsed.data.i)) continue;
    out.set(parsed.data.i, { name_en: name, category: parsed.data.category, is_optional: parsed.data.is_optional });
  }
  return out;
}
