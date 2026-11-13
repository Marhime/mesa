// The sections of a recipe's lines ("Marinade", "Sauce", "Noodles"), the same for every way in (the model's
// answer, a website's lines, the parts Redo ingredients finds for a recipe saved without them): cleaned (cleanSection), one spelling per section, kept only when the
// recipe has two or more (meaningfulSections), and the lines in an order the editor can write back
// (inSectionOrder: lines without a section first, then each section's lines together). Done before the
// lines get their positions, so positions, text order and sections agree.
import { inSectionOrder, meaningfulSections } from '@mesa/shared';

export function withSections<T extends { section?: string | null }>(lines: readonly T[]): Array<T & { section: string | null }> {
  const sections = meaningfulSections(lines.map((line) => line.section));
  // "Sauce" and "sauce" are one section: the first spelling stays.
  const spelling = new Map<string, string>();
  const named = lines.map((line, i) => {
    const section = sections[i] ?? null;
    if (section === null) return { ...line, section };
    const key = section.toLowerCase();
    if (!spelling.has(key)) spelling.set(key, section);
    return { ...line, section: spelling.get(key)! };
  });
  return inSectionOrder(named);
}
