import { AnimatedList } from '../molecules/AnimatedList';
import { SectionHeader } from '../molecules/SectionHeader';
import { ImportRow, type ImportRowProps } from './ImportRow';

export interface ImportListProps {
  /** "Saving", "Just saved". */
  title: string;
  /**
   * Your shares. A failed one's `remove` action (always its last way out) is its ×, like every card's; its
   * other actions stay buttons.
   */
  rows: (ImportRowProps & { key: string })[];
}

/** Your shares on their way in, just saved, or stuck; cards come and go smoothly. Renders nothing when there are none. */
export function ImportList({ title, rows }: ImportListProps) {
  if (rows.length === 0) return null;
  return (
    <AnimatedList gap="md">
      <SectionHeader key="title" title={title} />
      {rows.map(({ key, ...row }) => {
        if (row.state !== 'failed') return <ImportRow key={key} {...row} />;
        const remove = row.actions?.find((a) => a.key === 'remove');
        return (
          <ImportRow
            key={key}
            {...row}
            actions={row.actions?.filter((a) => a !== remove)}
            onDismiss={remove?.onPress}
            dismissLabel={remove ? `Remove ${row.title}` : undefined}
          />
        );
      })}
    </AnimatedList>
  );
}
