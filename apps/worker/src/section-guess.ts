// The parts of a recipe saved without them ("Marinade", "Sauce", "Noodles"): the model reads the ingredient
// lines and the steps, and says which lines go into which part, the way a cookbook prints them. A recipe
// that is one simple list (most are) gets none. Redo ingredients asks it for a recipe with no section yet;
// what it answers goes through the same rules as an import's sections (ingredient-sections.ts).
import type { Logger } from './log';
import type { JsonModel } from './model-port';
import { Type, type ModelSchema } from './model-schema';
import { textPart } from './pipeline-common';

/** Fewer lines than this are one list, whatever the steps say. */
export const MIN_LINES_FOR_PARTS = 6;

const PARTS_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    parts: {
      type: Type.ARRAY,
      description: 'Empty when the recipe is one simple list.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'The part, in 1 to 3 words ("Marinade", "Sauce", "To serve").' },
          lines: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: 'The numbers of its ingredient lines.' },
        },
        required: ['name', 'lines'],
      },
    },
  },
  required: ['parts'],
};

export const PARTS_SYSTEM_PROMPT = `You lay out a recipe's ingredient list the way a good cookbook prints it.
You get the ingredient lines, numbered, and the steps. When the dish is made of separate parts (a
marinade, a sauce, a dough, a filling, noodles, a garnish…), group the lines into those parts, reading the
steps to know where each line is used. A line used in one part only goes in that part; a line the steps
don't place goes in the part around it in the list. Name each part in 1 to 3 words, in the language of
the lines, with the recipe's own words when it has them. Every line goes in exactly one part. When the
recipe is one simple list, answer no parts: never make a part for its own sake.`;

export interface PartsInput {
  title: string;
  lines: readonly string[];
  steps: readonly string[];
}

export function partsUserPrompt({ title, lines, steps }: PartsInput): string {
  return [
    `Recipe: ${title}`,
    'Ingredient lines:',
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    'Steps:',
    ...(steps.length > 0 ? steps.map((s, i) => `${i + 1}. ${s}`) : ['(none)']),
  ].join('\n');
}

/** The model's answer, one entry per line (null: no part); every line null when it is not usable. */
export function partsOf(raw: unknown, lineCount: number): (string | null)[] {
  const sections: (string | null)[] = Array.from({ length: lineCount }, () => null);
  const parts = (raw as { parts?: unknown })?.parts;
  if (!Array.isArray(parts)) return sections;
  for (const part of parts as Array<{ name?: unknown; lines?: unknown }>) {
    if (typeof part?.name !== 'string' || !Array.isArray(part.lines)) continue;
    for (const n of part.lines) {
      // 1-based; a line already placed keeps its first part.
      if (Number.isInteger(n) && n >= 1 && n <= lineCount && sections[n - 1] === null) sections[n - 1] = part.name;
    }
  }
  return sections;
}

/**
 * The part of each line, or all null: for a short list, or when the model fails (the reread goes on
 * without parts: they are a layout, never a reason to fail).
 */
export async function guessParts(ai: JsonModel, input: PartsInput, log: Logger, signal: AbortSignal): Promise<(string | null)[]> {
  const none = input.lines.map(() => null);
  if (input.lines.length < MIN_LINES_FOR_PARTS) return none;
  try {
    const raw = await ai.askJson(
      { parts: [textPart(partsUserPrompt(input))], systemInstruction: PARTS_SYSTEM_PROMPT, schema: PARTS_SCHEMA, thinking: 'low' },
      'sections',
      signal,
    );
    return partsOf(raw, input.lines.length);
  } catch (err) {
    if (signal.aborted) throw err;
    log.warn('sections_guess_failed', { err });
    return none;
  }
}
