import { Stack } from '../atoms/Stack';
import { ProgressNote } from '../molecules/ProgressNote';
import { SectionHeader } from '../molecules/SectionHeader';
import { StepRow, type StepRowProps } from './StepRow';

export interface RecipeStepsProps {
  steps: (StepRowProps & { key: string })[];
  /** "Read in Español" / "Show original" next to the title; `working` shows the progress instead. */
  translate?: { label: string; onPress: () => void; working: boolean } | null;
}

/** The Steps section of a recipe: title, the translate link, and the numbered steps. */
export function RecipeSteps({ steps, translate }: RecipeStepsProps) {
  return (
    <Stack gap="lg">
      <SectionHeader title="Steps" action={translate && !translate.working ? { label: translate.label, onPress: translate.onPress } : undefined} />
      {translate?.working ? <ProgressNote text="Translating…" canLeave /> : null}
      {steps.map(({ key, ...step }) => (
        <StepRow key={key} {...step} />
      ))}
    </Stack>
  );
}
