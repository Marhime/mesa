import { View } from 'react-native';

import { Stack } from '../atoms/Stack';
import { Rail } from '../molecules/Rail';
import { SectionHeader } from '../molecules/SectionHeader';
import { createStyles } from '../theme';
import { size } from '../tokens';
import { RecipeCard } from './RecipeCard';

export interface RecipeRailProps {
  /** "Cook again". */
  title: string;
  /** One muted line under the title. */
  subtitle?: string;
  recipes: { key: string; title: string; imageUrl: string | null; meta?: string }[];
  /** Opens the recipe. */
  onOpen: (key: string) => void;
}

/** A titled row of RecipeCards that scrolls sideways ("Cook again" on Home). Nothing when it is empty. */
export function RecipeRail({ title, subtitle, recipes, onOpen }: RecipeRailProps) {
  const styles = useStyles();
  if (recipes.length === 0) return null;
  return (
    <Stack gap="md">
      <SectionHeader title={title} subtitle={subtitle} />
      <Rail accessibilityLabel={title} itemWidth={size.recipeRailCard}>
        {recipes.map((r) => (
          <View key={r.key} style={styles.cell}>
            <RecipeCard title={r.title} imageUrl={r.imageUrl} seed={r.key} meta={r.meta} onPress={() => onOpen(r.key)} />
          </View>
        ))}
      </Rail>
    </Stack>
  );
}

const useStyles = createStyles(() => ({
  cell: { width: size.recipeRailCard },
}));
