// Response schemas for sweeps and receipts, and the cleanup of what the model returns.
import { enumOf, nullable, Type, type ModelSchema } from './model-schema';
import type { Category, PantryLevel } from '@mesa/shared';
import { z } from 'zod';

import { CATEGORIES, ModelOutputError, toCategory, toQuantity } from './model-output';

const category: ModelSchema = enumOf(CATEGORIES);

export const SWEEP_RESPONSE_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name_en: { type: Type.STRING },
          label: { type: Type.STRING },
          category,
          quantity: nullable({ type: Type.NUMBER }),
          unit: nullable({ type: Type.STRING }),
          level: enumOf(['full', 'half', 'low']),
          expires_on: nullable({ type: Type.STRING }),
          confidence: { type: Type.NUMBER },
        },
        required: ['name_en', 'label', 'category', 'level', 'confidence'],
      },
    },
  },
  required: ['items'],
};

export const RECEIPT_RESPONSE_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    is_receipt: { type: Type.BOOLEAN },
    store: nullable({ type: Type.STRING }),
    date: nullable({ type: Type.STRING }),
    total_mxn: nullable({ type: Type.NUMBER }),
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw: { type: Type.STRING },
          name_en: { type: Type.STRING },
          category,
          quantity: nullable({ type: Type.NUMBER }),
          unit: nullable({ type: Type.STRING }),
          price_mxn: nullable({ type: Type.NUMBER }),
          list_item_id: nullable({ type: Type.STRING }),
          confidence: { type: Type.NUMBER },
        },
        required: ['raw', 'name_en', 'category', 'confidence'],
      },
    },
  },
  required: ['is_receipt', 'lines'],
};

const text = z.preprocess((v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v)), z.string());
const nullableText = z.preprocess((v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || /^(null|none|n\/a)$/i.test(t) ? null : t;
}, z.string().nullable());
const confidence = z.preprocess((v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}, z.number());
const isoDate = nullableText.transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));
const money = z.preprocess((v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}, z.number().nullable());

export interface SweepItem {
  nameEn: string;
  label: string;
  category: Category;
  quantity: number | null;
  unit: string | null;
  level: Exclude<PantryLevel, 'out'>;
  expiresOn: string | null;
  confidence: number;
}

const SweepItemSchema = z.object({
  name_en: text,
  label: text,
  category: z.preprocess(toCategory, z.enum(CATEGORIES).nullable()),
  quantity: z.preprocess(toQuantity, z.number().positive().nullable()),
  unit: nullableText,
  level: z.preprocess((v) => (v === 'half' || v === 'low' ? v : 'full'), z.enum(['full', 'half', 'low'])),
  expires_on: isoDate,
  confidence,
});

/** {items: [...]} → clean items; bad entries are skipped. */
export function normalizeSweep(raw: unknown): SweepItem[] {
  const items = raw !== null && typeof raw === 'object' ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) throw new ModelOutputError('sweep response has no items');
  const out: SweepItem[] = [];
  for (const item of items) {
    const p = SweepItemSchema.safeParse(item);
    if (!p.success || (p.data.name_en === '' && p.data.label === '')) continue;
    out.push({
      nameEn: p.data.name_en.toLowerCase(),
      label: p.data.label || p.data.name_en,
      category: p.data.category ?? 'other',
      quantity: p.data.quantity,
      unit: p.data.unit,
      level: p.data.level,
      expiresOn: p.data.expires_on,
      confidence: p.data.confidence,
    });
  }
  return out;
}

export interface ReceiptLine {
  raw: string;
  nameEn: string;
  category: Category;
  quantity: number | null;
  unit: string | null;
  priceMxn: number | null;
  listItemId: string | null;
  confidence: number;
}

export interface Receipt {
  isReceipt: boolean;
  store: string | null;
  date: string | null;
  totalMxn: number | null;
  lines: ReceiptLine[];
}

const ReceiptLineSchema = z.object({
  raw: text,
  name_en: text,
  category: z.preprocess(toCategory, z.enum(CATEGORIES).nullable()),
  quantity: z.preprocess(toQuantity, z.number().positive().nullable()),
  unit: nullableText,
  price_mxn: money,
  list_item_id: nullableText,
  confidence,
});

export function normalizeReceipt(raw: unknown): Receipt {
  if (raw === null || typeof raw !== 'object') throw new ModelOutputError('receipt response is not an object');
  const r = raw as Record<string, unknown>;
  const lines: ReceiptLine[] = [];
  for (const line of Array.isArray(r.lines) ? r.lines : []) {
    const p = ReceiptLineSchema.safeParse(line);
    if (!p.success || p.data.name_en === '') continue;
    lines.push({
      raw: p.data.raw,
      nameEn: p.data.name_en.toLowerCase(),
      category: p.data.category ?? 'other',
      quantity: p.data.quantity,
      unit: p.data.unit,
      priceMxn: p.data.price_mxn,
      listItemId: p.data.list_item_id,
      confidence: p.data.confidence,
    });
  }
  return {
    isReceipt: r.is_receipt !== false && lines.length > 0,
    store: nullableText.parse(r.store ?? null),
    date: isoDate.parse(r.date ?? null),
    totalMxn: money.parse(r.total_mxn ?? null),
    lines,
  };
}
