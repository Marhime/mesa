import { View } from 'react-native';

import { SectionHeader } from '../molecules/SectionHeader';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { ImportRow } from './ImportRow';

export interface ImportListItem {
  id: string;
  source: string;
  status: 'queued' | 'processing' | 'failed';
  error: string | null;
}

export interface ImportListProps {
  items: ImportListItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  retryingId?: string;
  title?: string;
}

/** Recipes on their way in. Renders nothing when there are none. */
export function ImportList({ items, onRetry, onRemove, retryingId, title = 'Importing' }: ImportListProps) {
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      <SectionHeader title={title} />
      {items.map((job) => (
        <ImportRow
          key={job.id}
          source={job.source}
          status={job.status}
          error={job.error}
          retrying={retryingId === job.id}
          onRetry={() => onRetry(job.id)}
          onRemove={() => onRemove(job.id)}
        />
      ))}
    </View>
  );
}

const useStyles = createStyles(() => ({
  list: { gap: space.md },
}));
