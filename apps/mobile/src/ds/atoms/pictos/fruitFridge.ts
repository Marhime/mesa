// Fruit, dairy, eggs, meat and fish. See types.ts for the house style.
import type { Picto } from '@mesa/shared';

import type { PictoArt } from './types';

/** The printed-sticker shadow: an INK copy of a silhouette, offset +3/+3. */
const SHADOW = 'fill="INK" transform="translate(3 3)"';
/** The INK outline of a filled shape. */
const LINE = 'stroke="INK" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
/** A shape (`path d="…"`, `circle …`) as a sticker: its shadow, then itself filled with the INK outline. */
const sticker = (shape: string, fill = 'TINT'): string => `<${shape} ${SHADOW}/><${shape} fill="${fill}" ${LINE}/>`;
/** The one PAPER highlight stroke. */
const SHINE = 'fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"';

export const FRUIT_FRIDGE = {
  // ── Fruit ──────────────────────────────────────────────
  apple: {
    tint: 'brick',
    accent: 'leaf',
    svg:
      sticker('path d="M28 18 C22 12 10 14 10 27 C10 38 17 46 24 45 C26 44.6 30 44.6 32 45 C39 46 45 38 45 27 C45 14 34 12 28 18 Z"') +
      '<path d="M28 18 Q28 12 26 8" fill="none" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      `<path d="M29 13 Q34 6 42 9 Q37 15 29 13 Z" fill="ACCENT" ${LINE}/>` +
      `<path d="M15 28 Q15 22 20 20" ${SHINE}/>`,
  },
  citrus: {
    tint: 'leaf',
    accent: 'sage',
    svg:
      sticker('circle cx="26" cy="26" r="18"') +
      `<circle cx="26" cy="26" r="11.5" fill="ACCENT" ${LINE}/>` +
      '<path d="M26 22 L26 15.5 M26 30 L26 36.5 M22.5 24 L17 21 M29.5 28 L35 31 M22.5 28 L17 31 M29.5 24 L35 21" stroke="INK" stroke-width="2.5" stroke-linecap="round"/>' +
      `<path d="M12.5 21 Q15 13.5 22 11.5" ${SHINE}/>`,
  },
  banana: {
    tint: 'butter',
    svg:
      `<path d="M44 13 C47 33 34 47 12 43 Q8 41 10 36 C24 36 37 26 38 13 Z" ${SHADOW}/>` +
      '<path d="M41 13 L41.5 9" stroke="INK" stroke-width="6" stroke-linecap="round"/>' +
      `<path d="M44 13 C47 33 34 47 12 43 Q8 41 10 36 C24 36 37 26 38 13 Z" fill="TINT" ${LINE}/>` +
      '<path d="M8.5 38 L11 42" stroke="INK" stroke-width="3.5" stroke-linecap="round"/>' +
      `<path d="M39 28 Q36 36 28 39.5" ${SHINE}/>`,
  },
  berry: {
    tint: 'brick',
    accent: 'leaf',
    svg:
      sticker('path d="M10 23 C10 16 20 15 28 18 C36 15 46 16 46 23 C46 33 36 43 28 46 C20 43 10 33 10 23 Z"') +
      `<path d="M16 18 L21 11 L25 15 L28 8 L31 15 L35 11 L40 18 Q28 23 16 18 Z" fill="ACCENT" ${LINE}/>` +
      '<path d="M21 27 l0 .1 M28 29 l0 .1 M35 27 l0 .1 M24 35 l0 .1 M32 35 l0 .1 M28 41 l0 .1" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      `<path d="M14 24 Q15 31 20 36" ${SHINE}/>`,
  },
  melon: {
    tint: 'leaf',
    accent: 'brick',
    svg:
      sticker('path d="M27 9 L46 35 Q27 52 8 35 Z"') +
      `<path d="M27 9 L43.8 32 Q27 44 10.2 32 Z" fill="ACCENT" ${LINE}/>` +
      '<path d="M27 22 l0 .1 M21 30 l0 .1 M33 30 l0 .1 M27 35 l0 .1" stroke="INK" stroke-width="3.5" stroke-linecap="round"/>' +
      `<path d="M22 19 L17 26" ${SHINE}/>`,
  },
  tropical: {
    tint: 'butter',
    accent: 'leaf',
    svg:
      sticker('path d="M15 14 C28 7 47 20 45 35 C44 44 36 47 29 44 C25 42 25 37 21 34 C16 31 8 27 10 19 C11 16 13 15 15 14 Z"') +
      `<path d="M17 13.5 C19 9 26 7.5 32 9 C29 14 23 15 17 13.5 Z" fill="ACCENT" ${LINE}/>` +
      '<path d="M15 14 L11.5 9.5" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      `<path d="M14 22 Q15 18 19 17" ${SHINE}/>`,
  },
  pineapple: {
    tint: 'butter',
    accent: 'leaf',
    svg:
      `<ellipse cx="26" cy="33" rx="12" ry="12.5" ${SHADOW}/>` +
      `<path d="M19 22 L14 12 L22 16.5 L26 9 L30 16.5 L38 12 L33 22 Z" fill="ACCENT" ${LINE}/>` +
      `<ellipse cx="26" cy="33" rx="12" ry="12.5" fill="TINT" ${LINE}/>` +
      '<path d="M20.4 21.9 L36.8 38.3 M15.2 27.7 L31.6 44.1 M15.2 38.3 L31.6 21.9 M20.4 44.1 L36.8 27.7" stroke="INK" stroke-width="2.5" stroke-linecap="round"/>',
  },
  // ── Dairy & eggs ───────────────────────────────────────
  milk: {
    tint: 'mist',
    svg:
      '<path d="M20 22 L25 12 L37 12 L42 22 L42 48 L20 48 Z" fill="INK"/>' +
      '<path d="M17 19 L22 9 L34 9 L39 19 L39 45 L17 45 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M17 19 L39 19" stroke="INK" stroke-width="3"/>' +
      '<rect x="22" y="26" width="12" height="11" rx="3" fill="PAPER" stroke="INK" stroke-width="3"/>',
  },
  cheese: {
    tint: 'butter',
    svg:
      sticker('path d="M8 29 L44 14 L46 22 L46 43 L8 43 Z"') +
      '<path d="M8 29 L46 29" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="19" cy="36" r="3" fill="INK"/>' +
      '<circle cx="35" cy="37" r="2.5" fill="INK"/><circle cx="36" cy="23" r="2" fill="INK"/>' +
      `<path d="M20 25.5 L29 22" ${SHINE}/>`,
  },
  egg: {
    tint: 'oat',
    accent: 'butter',
    svg:
      sticker('path d="M14 20 C18 10 30 10 36 14 C44 15 47 24 43 31 C45 40 34 46 27 42 C18 46 8 40 11 31 C7 27 9 21 14 20 Z"') +
      `<circle cx="27" cy="28" r="8" fill="ACCENT" ${LINE}/>` +
      `<path d="M23 27 Q23.5 23.5 27 23" ${SHINE}/>`,
  },
  cup: {
    tint: 'mist',
    accent: 'oat',
    svg:
      sticker('path d="M12 20 L44 20 L40 45 L16 45 Z"') +
      `<rect x="9" y="12" width="38" height="8" rx="3" fill="ACCENT" ${LINE}/>` +
      `<rect x="17" y="27" width="22" height="10" rx="3" fill="PAPER" ${LINE}/>`,
  },
  butter: {
    tint: 'butter',
    svg:
      sticker('path d="M8 42 L16 31 L47 31 L39 42 Z"', 'PAPER') +
      `<path d="M13 24 L19 17 L41 17 L41 30 L35 37 L13 37 Z" fill="TINT" ${LINE}/>` +
      '<path d="M13 24 L35 24 L41 17 M35 24 L35 37" fill="none" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      `<path d="M20 20.5 L33 20.5" ${SHINE}/>`,
  },
  // ── Meat & fish ────────────────────────────────────────
  poultry: {
    tint: 'clay',
    svg:
      '<path d="M15 30 C15 18 30 12 38 19 C45 25 42 38 32 40 C25 41 15 40 15 30 Z" fill="INK"/>' +
      '<path d="M32 33 L43 44" stroke="INK" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="45" cy="42" r="4" fill="PAPER" stroke="INK" stroke-width="3"/>' +
      '<circle cx="41" cy="46" r="4" fill="PAPER" stroke="INK" stroke-width="3"/>' +
      '<path d="M12 27 C12 15 27 9 35 16 C42 22 39 35 29 37 C22 38 12 37 12 27 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M18 24 Q20 18 26 16" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  meat: {
    tint: 'brick',
    accent: 'oat',
    svg:
      sticker('path d="M8 25 C8 15 18 11 28 12 C38 13 47 15 47 25 C47 36 38 44 27 43 C16 43 8 36 8 25 Z"', 'ACCENT') +
      `<path d="M8 25 C8 15 18 11 28 12 C38 13 47 15 47 25 C47 30 44 33 40 33 C30 33 22 36 14 39 C10 35 8 30 8 25 Z" fill="TINT" ${LINE}/>` +
      `<circle cx="30" cy="24" r="4.5" fill="ACCENT" ${LINE}/>` +
      `<path d="M14 24 Q16 18 22 16" ${SHINE}/>`,
  },
  fish: {
    tint: 'mist',
    svg:
      sticker('path d="M8 30 C14 19 28 17 37 28 L46 20 L46 40 L37 32 C28 43 14 41 8 30 Z"') +
      '<circle cx="16" cy="28" r="2.5" fill="INK"/>' +
      '<path d="M23 23 Q26 30 23 37" fill="none" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      `<path d="M27 24 Q31 25 34 28" ${SHINE}/>`,
  },
  shrimp: {
    tint: 'clay',
    svg:
      '<g transform="translate(3 3)" fill="INK"><path d="M35.9 14 A17 17 0 1 0 29.4 43.4 L28.75 36 A7.5 7.5 0 1 1 30.7 24.7 C37 25 41 18 35.9 14 Z"/><path d="M28 36 L38 31 C40.5 34 40.5 37 36.5 39 C40.5 41 40.5 44 38 46.5 L28.5 43.5 Z"/></g>' +
      `<path d="M28 36 L38 31 C40.5 34 40.5 37 36.5 39 C40.5 41 40.5 44 38 46.5 L28.5 43.5 Z" fill="TINT" ${LINE}/>` +
      `<path d="M35.9 14 A17 17 0 1 0 29.4 43.4 L28.75 36 A7.5 7.5 0 1 1 30.7 24.7 C37 25 41 18 35.9 14 Z" fill="TINT" ${LINE}/>` +
      '<path d="M22.4 22.5 L19.2 11 M18.5 25.8 L10.3 18.5 M17.6 30.8 L8.3 30 M20.2 35.3 L14.1 40 M36.5 14.5 Q41 8 47 9" fill="none" stroke="INK" stroke-width="2.5" stroke-linecap="round"/>' +
      '<circle cx="34.5" cy="19" r="2" fill="INK"/>' +
      `<path d="M12 31 Q12.5 34 14.7 35.7" ${SHINE}/>`,
  },
  sausage: {
    tint: 'brick',
    svg:
      '<path d="M13 39.5 Q14 30 22 27 M31 23 Q39 20 40 14" fill="none" stroke="INK" stroke-width="14" stroke-linecap="round" transform="translate(3 3)"/>' +
      '<path d="M12 41 L8.5 44.5 M41 12.5 L44.5 9" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M13 39.5 Q14 30 22 27" fill="none" stroke="INK" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M13 39.5 Q14 30 22 27" fill="none" stroke="TINT" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M31 23 Q39 20 40 14" fill="none" stroke="INK" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M31 23 Q39 20 40 14" fill="none" stroke="TINT" stroke-width="8" stroke-linecap="round"/>' +
      `<path d="M30 21 Q35 19.5 37 16" ${SHINE}/>`,
  },
} satisfies Partial<Record<Picto, PictoArt>>;
