// Every food drawing, by picto name. A missing one is a type error.
import type { Picto } from '@mesa/shared';

import { FRESH } from './fresh';
import { FRUIT_FRIDGE } from './fruitFridge';
import { SHELF } from './shelf';
import type { PictoArt } from './types';

export const PICTO_ART: Record<Picto, PictoArt> = { ...FRESH, ...FRUIT_FRIDGE, ...SHELF };

export { paint, type PictoArt, type ArtTint } from './types';
