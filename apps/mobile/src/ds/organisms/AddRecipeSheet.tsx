import { useEffect, useState } from 'react';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { TextField } from '../atoms/TextField';
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

  useEffect(() => {
    if (!visible) {
      setStep('menu');
      setLink('');
    }
  }, [visible]);

  const openLink = () => {
    setStep('link');
    readClipboardUrl()
      .then((url) => {
        if (url) setLink((current) => (current.length === 0 ? url : current));
      })
      .catch(() => undefined);
  };

  if (step === 'link') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Paste a link"
        description="YouTube, Instagram, TikTok or any recipe page."
        footer={
          <>
            <Button label="Import" size="lg" fullWidth disabled={link.trim().length === 0} loading={busy} onPress={() => onSubmitLink(link)} />
            <Button label="Back" variant="ghost" fullWidth onPress={() => setStep('menu')} />
          </>
        }
      >
        <TextField
          value={link}
          onChangeText={setLink}
          label="Link"
          placeholder="https://"
          icon="link"
          clearable
          autoFocus
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => link.trim() && onSubmitLink(link)}
        />
        {error ? <Banner tone="danger" text={error} /> : null}
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Add recipe">
      <ListGroup>
        <ListRow title="Paste a link" subtitle="From a video or a website" leading={<Icon name="link" />} chevron onPress={openLink} />
        <ListRow
          title="From a screenshot"
          subtitle="Pick a photo of a recipe"
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
