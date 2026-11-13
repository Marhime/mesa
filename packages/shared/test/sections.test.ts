import { describe, expect, it } from 'vitest';
import { cleanSection, groupBySection, inSectionOrder, linesWithHeadings, meaningfulSections, readSections, sectionHeading } from '../src/index';

describe('sections', () => {
  it('reads a heading line, never an ingredient', () => {
    expect(sectionHeading('For the sauce:')).toBe('For the sauce');
    expect(sectionHeading('  ## Marinade :  ')).toBe('Marinade');
    expect(sectionHeading('Salsa：')).toBe('Salsa');
    expect(sectionHeading('dark soy sauce 2 tbsp')).toBeNull();
    expect(sectionHeading('Salt: to taste')).toBeNull();
    expect(sectionHeading('2:')).toBeNull();
    // The ways people write a heading.
    expect(sectionHeading('[Marinade]')).toBe('Marinade');
    expect(sectionHeading('## Sauce')).toBe('Sauce');
    expect(sectionHeading('**For the noodles**')).toBe('For the noodles');
    expect(sectionHeading('— To serve —')).toBe('To serve');
    expect(sectionHeading('{Garnish}')).toBe('Garnish');
    expect(sectionHeading('[1 cup]')).toBeNull();
    expect(sectionHeading('- 2 eggs')).toBeNull();
    expect(sectionHeading('beef 7 oz/200 g')).toBeNull();
  });

  it('cleans a name as stored', () => {
    expect(cleanSection('  Beef   marinade: ')).toBe('Beef marinade');
    expect(cleanSection('')).toBeNull();
    expect(cleanSection(null)).toBeNull();
    expect(cleanSection('x'.repeat(80))).toHaveLength(60);
  });

  it('groups consecutive lines and writes them back with headings', () => {
    const rows = [
      { t: 'beef 200 g', section: 'Marinade' },
      { t: 'dark soy sauce 1 tsp', section: 'Marinade' },
      { t: 'dark soy sauce 2 tbsp', section: 'Sauce' },
      { t: 'noodles 450 g', section: null },
    ];
    expect(groupBySection(rows).map((g) => [g.section, g.rows.length])).toEqual([['Marinade', 2], ['Sauce', 1], [null, 1]]);
    const text = linesWithHeadings(rows, (r) => r.t);
    expect(text).toEqual(['Marinade:', 'beef 200 g', 'dark soy sauce 1 tsp', 'Sauce:', 'dark soy sauce 2 tbsp', 'noodles 450 g']);
    // A heading applies until the next one: a line after "Sauce:" stays in the sauce.
    expect(readSections(text).map((l) => l.section)).toEqual(['Marinade', 'Marinade', 'Sauce', 'Sauce']);
    expect(readSections(['salt', 'Sauce:', 'sugar']).map((l) => [l.line, l.section])).toEqual([['salt', null], ['sugar', 'Sauce']]);
    // As typed in the editor (the reported chow mein).
    expect(readSections(['[Marinade]', 'beef 7 oz/200 g', '[Sauce]', 'water 1 tbsp', '[Noodles]', 'fresh chow mein noodle 16 oz/450 g']).map((l) => l.section))
      .toEqual(['Marinade', 'Sauce', 'Noodles']);
  });

  it('orders an import so the editor writes it back the same', () => {
    const rows: { t: string; section: string | null }[] = [
      { t: 'beef', section: 'Marinade' },
      { t: 'dark soy 2 tbsp', section: 'Sauce' },
      { t: 'dark soy 1 tsp', section: 'Marinade' },
      { t: 'noodles', section: null },
    ];
    const ordered = inSectionOrder(rows);
    expect(ordered.map((r) => r.t)).toEqual(['noodles', 'beef', 'dark soy 1 tsp', 'dark soy 2 tbsp']);
    const back = readSections(linesWithHeadings(ordered, (r) => r.t));
    expect(back.map((l) => [l.line, l.section])).toEqual(ordered.map((r) => [r.t, r.section]));
  });

  it('keeps sections only when a recipe has two', () => {
    expect(meaningfulSections(['Ingredients', 'Ingredients:', null])).toEqual([null, null, null]);
    expect(meaningfulSections(['Marinade', 'Sauce', null])).toEqual(['Marinade', 'Sauce', null]);
  });
});
