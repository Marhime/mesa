import { AnimatedList } from '../molecules/AnimatedList';
import { ListGroup } from '../molecules/ListGroup';
import { AisleSection } from './AisleSection';
import { IngredientRow, type IngredientRowProps } from './IngredientRow';

type Section = IngredientListProps['sections'][number];

export interface IngredientListProps {
  /**
   * The recipe's parts in order ("Marinade", "Sauce", "Noodles"), each with its lines; `title` null: no heading
   * (a recipe with one list, or the lines before the first part).
   */
  sections: { key: string; title: string | null; rows: (IngredientRowProps & { key: string })[] }[];
}

const rowsOf = (s: Section) => s.rows.map(({ key, ...row }) => <IngredientRow key={key} {...row} />);

/**
 * A recipe's ingredients, one IngredientRow per line: one list, or one per part of the recipe under an overline
 * heading, like the aisles of the grocery list. Lines and parts that come or go fade, and the rest slide into place.
 */
export function IngredientList({ sections }: IngredientListProps) {
  // A recipe with one list (most of them): just its rows.
  const only = sections.length === 1 && !sections[0]!.title ? sections[0]! : null;
  if (only) return <ListGroup inset="picto">{rowsOf(only)}</ListGroup>;
  return (
    <AnimatedList gap="xl">
      {sections.map((s) =>
        s.title ? (
          <AisleSection key={s.key} title={s.title} inset="picto">
            {rowsOf(s)}
          </AisleSection>
        ) : (
          <ListGroup key={s.key} inset="picto">
            {rowsOf(s)}
          </ListGroup>
        ),
      )}
    </AnimatedList>
  );
}
