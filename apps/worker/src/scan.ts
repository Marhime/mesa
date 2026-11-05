// Kitchen Sweep and Ticket In: a fridge video / photo, or a receipt, becomes a pantry proposal that the
// household reviews in the app (nothing changes until they apply it).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { capitalize, normalizeText, type Category, type ImportJob, type ImportPlatform, type PantryLevel, type Zone } from '@mesa/shared';

import { ImportError, MESSAGES } from './errors';
import { isModelImage, sniffImage } from './http';
import { RECIPE_IMAGES_BUCKET } from './images';
import type { Logger } from './log';
import { matchIngredient, normalizeQuantity, type Catalog } from './mapping';
import type { PipelineDeps } from './pipeline';
import type { PushContent } from './push';
import { receiptSystemPrompt, sweepSystemPrompt, type ListItemContext } from './scan-prompts';
import { normalizeReceipt, normalizeSweep, RECEIPT_RESPONSE_SCHEMA, SWEEP_RESPONSE_SCHEMA, type Receipt, type SweepItem } from './scan-output';

export const SCANS_BUCKET = 'scans';
const MAX_INLINE_BYTES = 15 * 1024 * 1024;
/** Below this, a line is shown but not pre-ticked. */
const SURE = { add: 0.5, update: 0.6, bought: 0.4 } as const;

const VIDEO_MIME: Record<string, string> = { '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.m4v': 'video/x-m4v' };

export interface ProposalLine {
  action: 'add' | 'update' | 'out' | 'bought';
  product_id: string | null;
  label: string;
  category: Category;
  zone: Zone | null;
  quantity: number | null;
  unit: string | null;
  level: PantryLevel | null;
  expires_on: string | null;
  price_mxn: number | null;
  grocery_item_id: string | null;
  confidence: number;
  suggested: boolean;
}

export interface ScanResult {
  proposalId: string;
  kind: 'sweep' | 'receipt';
  changes: number;
  platform: ImportPlatform;
  push: PushContent;
}

// Pure: sweeps -------------------------------------------------------------------------------------

export interface ZoneStock {
  product_id: string;
  name: string;
  category: Category;
  level: PantryLevel | null;
  state: string;
}

/**
 * What the video shows against what the zone holds: new things (add), less left or back from "past its
 * date" (update), and what wasn't seen (out — never pre-ticked: a video rarely shows everything).
 */
export function sweepLines(items: SweepItem[], zone: Zone, stock: ZoneStock[], catalog: Catalog): { lines: ProposalLine[]; confirmed: number } {
  const byProduct = new Map(stock.map((s) => [s.product_id, s]));
  const seen = new Set<string>();
  const lines: ProposalLine[] = [];
  let confirmed = 0;
  for (const item of items) {
    const product = matchIngredient(catalog, item.nameEn, item.label);
    if (product && seen.has(product.id)) continue;
    if (product) seen.add(product.id);
    const amount = normalizeQuantity(item.quantity, item.unit);
    const current = product ? byProduct.get(product.id) : undefined;
    const base = {
      product_id: product?.id ?? null,
      label: product?.name_en ?? capitalize(item.label || item.nameEn),
      category: product?.category ?? item.category,
      zone,
      quantity: amount.quantity,
      unit: amount.unit,
      level: item.level,
      expires_on: item.expiresOn,
      price_mxn: null,
      grocery_item_id: null,
      confidence: item.confidence,
    };
    if (!current) {
      lines.push({ ...base, action: 'add', suggested: item.confidence >= SURE.add });
    } else if (current.state === 'check' || current.state === 'gone' || item.level !== (current.level ?? 'full')) {
      lines.push({ ...base, action: 'update', suggested: item.confidence >= SURE.update });
    } else {
      confirmed += 1;
    }
  }
  for (const s of stock) {
    if (seen.has(s.product_id)) continue;
    lines.push({
      action: 'out',
      product_id: s.product_id,
      label: s.name,
      category: s.category,
      zone,
      quantity: null,
      unit: null,
      level: null,
      expires_on: null,
      price_mxn: null,
      grocery_item_id: null,
      confidence: 0.3,
      suggested: false,
    });
  }
  return { lines, confirmed };
}

// Pure: receipts -----------------------------------------------------------------------------------

export interface ListLine {
  id: string;
  label: string;
  product_id: string | null;
  category: Category;
}

/** Receipt lines matched to the grocery list (by the model's id, then product, then name); unmatched list items are "missed". */
export function receiptLines(receipt: Receipt, list: ListLine[], catalog: Catalog): { lines: ProposalLine[]; missed: ListLine[] } {
  const byId = new Map(list.map((l) => [l.id, l]));
  const used = new Set<string>();
  const free = (l: ListLine | undefined) => (l && !used.has(l.id) ? l : undefined);
  const lines = receipt.lines.map((line): ProposalLine => {
    const product = matchIngredient(catalog, line.nameEn, line.raw);
    const item =
      free(line.listItemId ? byId.get(line.listItemId) : undefined) ??
      (product ? free(list.find((l) => l.product_id === product.id && !used.has(l.id))) : undefined) ??
      free(list.find((l) => !used.has(l.id) && normalizeText(l.label) === normalizeText(line.nameEn)));
    if (item) used.add(item.id);
    const amount = normalizeQuantity(line.quantity, line.unit);
    return {
      action: 'bought',
      product_id: product?.id ?? item?.product_id ?? null,
      label: product?.name_en ?? item?.label ?? capitalize(line.nameEn),
      category: product?.category ?? item?.category ?? line.category,
      zone: null,
      quantity: amount.quantity,
      unit: amount.unit,
      level: null,
      expires_on: null,
      price_mxn: line.priceMxn,
      grocery_item_id: item?.id ?? null,
      confidence: line.confidence,
      suggested: line.confidence >= SURE.bought,
    };
  });
  return { lines, missed: list.filter((l) => !used.has(l.id)) };
}

/** "You may have forgotten cilantro and crema." */
export function missedLine(missed: ListLine[]): string | null {
  if (missed.length === 0) return null;
  const names = missed.slice(0, 3).map((m) => m.label.toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `You may have forgotten ${list}${missed.length > 3 ? ' and more' : ''}.`;
}

// I/O ------------------------------------------------------------------------------------------------

type Media = { parts: Part[]; platform: ImportPlatform; cleanup: () => Promise<void> };

async function loadMedia(deps: PipelineDeps, bucket: string, path: string, log: Logger, signal: AbortSignal): Promise<Media> {
  const { data, error } = await deps.db.storage.from(bucket).download(path);
  if (error || !data) throw new ImportError(MESSAGES.imageMissing, { detail: error?.message ?? 'no data' });
  const bytes = Buffer.from(await data.arrayBuffer());
  const videoMime = VIDEO_MIME[extname(path).toLowerCase()];
  if (videoMime) {
    const dir = await mkdtemp(join(tmpdir(), 'mesa-scan-'));
    const file = join(dir, `scan${extname(path)}`);
    await writeFile(file, bytes);
    const uploaded = await deps.ai.uploadFile(file, videoMime, signal);
    log.info('scan_video_ready', { bytes: bytes.length });
    return {
      parts: [{ fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } }],
      platform: 'other',
      cleanup: async () => {
        await deps.ai.deleteFile(uploaded.name);
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  }
  const type = sniffImage(bytes);
  if (!isModelImage(type)) throw new ImportError(MESSAGES.imageUnsupported, { detail: sniffImage(bytes)?.mime ?? 'unknown bytes' });
  if (bytes.length > MAX_INLINE_BYTES) throw new ImportError(MESSAGES.imageTooLarge, { detail: `${bytes.length} bytes` });
  return { parts: [{ inlineData: { mimeType: type.mime, data: bytes.toString('base64') } }], platform: 'image', cleanup: async () => undefined };
}

async function zoneStock(db: SupabaseClient, householdId: string, zone: Zone): Promise<ZoneStock[]> {
  const { data, error } = await db
    .from('pantry_status')
    .select('product_id, name_en, category, level, state')
    .eq('household_id', householdId)
    .eq('zone', zone)
    .neq('state', 'out');
  if (error) throw new Error(`pantry_status: ${error.message}`);
  return (data ?? []).map((r: { product_id: string; name_en: string; category: Category; level: PantryLevel | null; state: string }) => ({
    product_id: r.product_id,
    name: r.name_en,
    category: r.category,
    level: r.level,
    state: r.state,
  }));
}

async function groceryList(db: SupabaseClient, householdId: string): Promise<(ListLine & { quantity: string })[]> {
  const { data, error } = await db
    .from('grocery_items')
    .select('id, label, product_id, category, quantity, unit')
    .eq('household_id', householdId)
    .in('status', ['to_buy', 'in_cart']);
  if (error) throw new Error(`grocery_items: ${error.message}`);
  return (data ?? []).map((r: ListLine & { quantity: number | null; unit: string | null }) => ({
    id: r.id,
    label: r.label,
    product_id: r.product_id,
    category: r.category,
    quantity: [r.quantity, r.unit].filter((v) => v !== null).join(' '),
  }));
}

async function writeProposal(
  db: SupabaseClient,
  job: ImportJob,
  kind: 'sweep' | 'receipt',
  zone: Zone | null,
  summary: Record<string, unknown>,
  lines: ProposalLine[],
): Promise<string> {
  const { data, error } = await db
    .from('pantry_proposals')
    .insert({ household_id: job.household_id, job_id: job.id, kind, zone, summary })
    .select('id')
    .single();
  if (error || !data) throw new Error(`pantry_proposals: ${error?.message ?? 'no row'}`);
  const proposalId = (data as { id: string }).id;
  if (lines.length > 0) {
    const { error: linesError } = await db.from('pantry_proposal_lines').insert(lines.map((l, position) => ({ ...l, proposal_id: proposalId, position })));
    if (linesError) {
      await db.from('pantry_proposals').delete().eq('id', proposalId);
      throw new Error(`pantry_proposal_lines: ${linesError.message}`);
    }
  }
  return proposalId;
}

/** Reads the job's media as a sweep or a receipt and writes the proposal. */
export async function runScan(deps: PipelineDeps, job: ImportJob, kind: 'sweep' | 'receipt', log: Logger, signal: AbortSignal): Promise<ScanResult> {
  if (!job.input_image_path) throw new ImportError(MESSAGES.nothingToImport, { detail: 'scan without media' });
  const bucket = job.kind === 'recipe' ? RECIPE_IMAGES_BUCKET : SCANS_BUCKET;
  const catalog = deps.catalog.forHousehold(job.household_id);
  const known = deps.catalog.knownNames(job.household_id);
  const media = await loadMedia(deps, bucket, job.input_image_path, log, signal);
  try {
    if (kind === 'sweep') {
      const zone = job.zone ?? 'fridge';
      const stock = await zoneStock(deps.db, job.household_id, zone);
      const raw = await deps.ai.askJson(
        { parts: media.parts, systemInstruction: sweepSystemPrompt(zone, known, stock.map((s) => s.name.toLowerCase())), schema: SWEEP_RESPONSE_SCHEMA },
        'sweep',
        signal,
      );
      const items = normalizeSweep(raw);
      if (items.length === 0) throw new ImportError(MESSAGES.sweepEmpty, { detail: 'no items seen' });
      const { lines, confirmed } = sweepLines(items, zone, stock, catalog);
      const proposalId = await writeProposal(deps.db, job, 'sweep', zone, { confirmed, seen: items.length }, lines);
      const changes = lines.filter((l) => l.action !== 'out').length;
      log.info('sweep_read', { zone, seen: items.length, changes, not_seen: lines.length - changes, confirmed });
      return {
        proposalId,
        kind,
        changes: lines.length,
        platform: media.platform,
        push: {
          title: `Your ${zone} scan is ready`,
          body: changes > 0 ? `${changes} ${changes === 1 ? 'change' : 'changes'} to check.` : 'Everything matches. Tap to confirm.',
          data: { proposalId },
        },
      };
    }

    const list = await groceryList(deps.db, job.household_id);
    const raw = await deps.ai.askJson(
      {
        parts: media.parts,
        systemInstruction: receiptSystemPrompt(known, list.map((l): ListItemContext => ({ id: l.id, label: l.label, quantity: l.quantity }))),
        schema: RECEIPT_RESPONSE_SCHEMA,
      },
      'receipt',
      signal,
    );
    const receipt = normalizeReceipt(raw);
    if (!receipt.isReceipt) throw new ImportError(MESSAGES.notReceipt, { detail: 'not a receipt' });
    const { lines, missed } = receiptLines(receipt, list, catalog);
    const proposalId = await writeProposal(
      deps.db,
      job,
      'receipt',
      null,
      { store: receipt.store, date: receipt.date, total_mxn: receipt.totalMxn, missed: missed.map((m) => ({ id: m.id, label: m.label })) },
      lines,
    );
    log.info('receipt_read', { store: receipt.store, lines: lines.length, on_list: lines.filter((l) => l.grocery_item_id).length, missed: missed.length });
    return {
      proposalId,
      kind,
      changes: lines.length,
      platform: media.platform,
      push: {
        title: receipt.store ? `${receipt.store} receipt read` : 'Receipt read',
        body: [`${lines.length} ${lines.length === 1 ? 'thing' : 'things'} to put away.`, missedLine(missed)].filter(Boolean).join(' '),
        data: { proposalId },
      },
    };
  } finally {
    await media.cleanup();
  }
}
