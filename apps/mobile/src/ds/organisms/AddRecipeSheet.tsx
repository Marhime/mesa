import { useEffect, useState } from 'react';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { TextField } from '../atoms/TextField';
import { haptics } from '../haptics';
import { Banner } from '../molecules/Banner';
import { ListGroup } from '../molecules/ListGroup';
import { ListRow } from '../molecules/ListRow';
import { Sheet } from '../molecules/Sheet';

export interface AddRecipeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Reads a link from the clipboard to prefill the field (null when there is none). */
  readClipboardUrl: () => Promise<string | null>;
  onSubmitLink: (text: string) => void;
  onScreenshot: () => void;
  onWrite: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Three ways to add a recipe: a link, a screenshot, or writing it. */
export function AddRecipeSheet({ visible, onClose, readClipboardUrl, onSubmitLink, onScreenshot, onWrite, busy, error }: AddRecipeSheetProps) {
  const [step, setStep] = useState<'menu' | 'link'>('menu');
  const [link, setLink] = useState('');
  // A link taken from the clipboard is still there: only what was typed or changed would be lost.
  const [pasted, setPasted] = useState<string | null>(null);
  const unsaved = link.trim().length > 0 && link !== pasted;

  useEffect(() => {
    if (!visible) {
      setStep('menu');
      setLink('');
      setPasted(null);
    }
  }, [visible]);

  // Save and Return both add (the `add` haptic at the touch, before the import starts).
  const submit = () => {
    if (busy || link.trim().length === 0) return;
    haptics.add();
    onSubmitLink(link);
  };

  const openLink = () => {
    setStep('link');
    readClipboardUrl()
      .then((url) => {
        if (!url) return;
        setPasted(url);
        setLink((current) => (current.length === 0 ? url : current));
      })
      .catch(() => undefined);
  };

  if (step === 'link') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        unsaved={unsaved}
        title="Paste a link or text"
        description="A YouTube, Instagram or TikTok link, a recipe page, or the recipe text itself."
        footer={
          <>
            <Button label="Save" size="lg" fullWidth disabled={link.trim().length === 0} loading={busy} onPress={submit} />
            <Button label="Back" variant="ghost" fullWidth onPress={() => setStep('menu')} />
          </>
        }
      >
        <TextField
          value={link}
          onChangeText={setLink}
          label="Link or text"
          placeholder="A link, or the recipe text"
          icon="link"
          clearable
          autoFocus
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error ? <Banner tone="danger" text={error} /> : null}
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} unsaved={unsaved} title="Add recipe">
      <ListGroup inset="icon">
        <ListRow title="Paste a link or text" subtitle="A video, a website, or a recipe you copied" leading={<Icon name="link" />} chevron onPress={openLink} />
        <ListRow
          title="From a screenshot"
          subtitle="Up to 4 photos of one recipe"
          leading={<Icon name="image" />}
          chevron
          onPress={onScreenshot}
        />
        <ListRow title="Write it myself" subtitle="Type the ingredients and steps" leading={<Icon name="write" />} chevron onPress={onWrite} />
      </ListGroup>
      {error ? <Banner tone="danger" text={error} /> : null}
    </Sheet>
  );
}
