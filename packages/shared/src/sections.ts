// Ingredient sections: the parts of a recipe ("Marinade", "Sauce", "Noodles"), stored on each line
// (recipe_ingredients.section, migration 26). The import reads them from the source; the editor shows
// them as heading lines ending with ":" ("For the sauce:"), and reads back the ways people write a heading:
// "Sauce:", "[Sauce]", "## Sauce", "**Sauce**", "— Sauce —". SQL's heading_of (migration 29) reads the same.

/** Longest section name kept (the database refuses longer). */
export const MAX_SECTION_CHARS = 60;

/** A section name as stored: one line, trimmed, no trailing colon, at most 60 characters; null when empty. */
export function cleanSection(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value
    .replace(/\s+/g, ' ')
    .replace(/^[\s#*•·\-–—]+/, '')
    .replace(/[\s:：]+$/, '')
    .trim();
  if (!/\p{L}/u.test(s)) return null;
  return s.slice(0, MAX_SECTION_CHARS).trim();
}

/** A heading written around its name: "[Sauce]", "{Sauce}", "**Sauce**", "__Sauce__", "## Sauce", "— Sauce —". */
const WRAPPED = /^(?:\[([^\]]+)\]|\{([^}]+)\}|\*\*([^*]+)\*\*|__([^_]+)__|#{1,6}\s*([^#]+)|[-–—=]+\s*([^-–—=]+?)\s*[-–—=]+)$/u;

/**
 * "For the sauce:", "[Sauce]", "## Sauce" → the section's name; null for an ingredient line. A heading ends
 * with a colon ("Salt: to taste" does not), or is wrapped as above with no digit inside ("[1 cup]" is no part).
 */
export function sectionHeading(line: string): string | null {
  const t = line.trim();
  if (/[:：]$/.test(t)) return cleanSection(t);
  const m = WRAPPED.exec(t);
  const inner = m?.slice(1).find((g) => g !== undefined);
  return inner && !/\d/.test(inner) ? cleanSection(inner) : null;
}

/** The heading line the editor shows for a section ("Sauce" → "Sauce:"). */
export const headingLine = (section: string): string => `${section}:`;

export interface SectionGroup<T> {
  /** null: lines before any heading (or a recipe with one list). */
  section: string | null;
  rows: T[];
}

/** Consecutive rows of one section, in order. */
export function groupBySection<T extends { section: string | null }>(rows: readonly T[]): SectionGroup<T>[] {
  const groups: SectionGroup<T>[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.section === row.section) last.rows.push(row);
    else groups.push({ section: row.section, rows: [row] });
  }
  return groups;
}

/** Editor text: each row's line, with a heading line wherever the section changes. */
export function linesWithHeadings<T extends { section: string | null }>(rows: readonly T[], text: (row: T) => string): string[] {
  return groupBySection(rows).flatMap((g) => [...(g.section ? [headingLine(g.section)] : []), ...g.rows.map(text)]);
}

/** Editor lines back to ingredient lines, each with the section of the heading above it. */
export function readSections(lines: readonly string[]): { line: string; section: string | null }[] {
  let section: string | null = null;
  const out: { line: string; section: string | null }[] = [];
  for (const line of lines) {
    const heading = sectionHeading(line);
    if (heading !== null) section = heading;
    else out.push({ line, section });
  }
  return out;
}

/**
 * An imported recipe's lines in an order the editor can write back: lines without a section first (the
 * editor can only show them before the first heading), then each section's lines together, sections in
 * the order they first appear. Within a group the order is kept.
 */
export function inSectionOrder<T extends { section: string | null }>(rows: readonly T[]): T[] {
  const order: (string | null)[] = [null];
  for (const r of rows) if (!order.includes(r.section)) order.push(r.section);
  return order.flatMap((section) => rows.filter((r) => r.section === section));
}

/**
 * Sections worth showing for an imported recipe: one name for every line ("Ingredients") says nothing,
 * so a recipe needs two different sections to keep them; otherwise every line gets null.
 */
export function meaningfulSections(sections: readonly (string | null | undefined)[]): (string | null)[] {
  const cleaned = sections.map((s) => cleanSection(s));
  const distinct = new Set(cleaned.filter((s): s is string => s !== null).map((s) => s.toLowerCase()));
  return distinct.size >= 2 ? cleaned : cleaned.map(() => null);
}
