import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { Picto } from '@mesa/shared';

import { art, size } from '../tokens';
import { PICTO_ART, paint } from './pictos';

export interface FoodPictoProps {
  /** Which drawing (pictoOf(product) in @mesa/shared picks it, with a fallback by category). */
  picto: Picto;
  /** sm 32 (rows) · md 40 (cards, sheets). */
  size?: 'sm' | 'md';
}

const PIXELS = { sm: size.pictoSm, md: size.pictoMd } as const;
const documents = new Map<Picto, string>();

function documentFor(picto: Picto): string {
  let xml = documents.get(picto);
  if (!xml) {
    xml = paint(PICTO_ART[picto]);
    documents.set(picto, xml);
  }
  return xml;
}

/** A food as a small outlined sticker in its own color. Decorative: the row names the food. */
export function FoodPicto({ picto, size: sizeName = 'sm' }: FoodPictoProps) {
  const px = PIXELS[sizeName];
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={documentFor(picto)} width={px} height={px} />
    </View>
  );
}

/** The food's own color (a Use soon card is painted with it). */
export function pictoTint(picto: Picto): string {
  return art[PICTO_ART[picto].tint];
}
