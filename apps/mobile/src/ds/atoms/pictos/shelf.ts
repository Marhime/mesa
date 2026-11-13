// Tortillas, bread, cupboard, drinks and home. See types.ts for the house style.
import type { Picto } from '@mesa/shared';

import type { PictoArt } from './types';

/** A kidney bean around 0,0 (20×12), placed with a transform. */
const BEAN = 'M-10 0.5 C-10 -4 -6.8 -6 -3.6 -4.6 Q0 -2.6 3.6 -4.6 C6.8 -6 10 -4 10 0.5 C10 4.6 5.5 6 0 6 C-5.5 6 -10 4.6 -10 0.5 Z';
/** Six arms with forked tips around 26.5,26.5, stroked thick in INK then thin in TINT. */
const SNOWFLAKE =
  'M26.5 26.5 L26.5 10.5 M26.5 16 L23.3 12.8 M26.5 16 L29.7 12.8 M26.5 26.5 L40.4 18.5 M35.6 21.3 L36.8 16.9 M35.6 21.3 L39.9 22.4 ' +
  'M26.5 26.5 L40.4 34.5 M35.6 31.8 L39.9 30.6 M35.6 31.8 L36.8 36.1 M26.5 26.5 L26.5 42.5 M26.5 37 L29.7 40.2 M26.5 37 L23.3 40.2 ' +
  'M26.5 26.5 L12.6 34.5 M17.4 31.8 L16.2 36.1 M17.4 31.8 L13.1 30.6 M26.5 26.5 L12.6 18.5 M17.4 21.3 L13.1 22.4 M17.4 21.3 L16.2 16.9';

export const SHELF = {
  tortilla: {
    tint: 'butter',
    svg:
      '<path d="M10.5 28 A19.5 6.5 0 0 1 49.5 28 L49.5 37 A19.5 6.5 0 0 1 10.5 37 Z" fill="INK"/>' +
      '<ellipse cx="27" cy="34" rx="19.5" ry="6.5" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<ellipse cx="28" cy="29.5" rx="19.5" ry="6.5" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<ellipse cx="27" cy="25" rx="19.5" ry="6.5" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<path d="M19 26 h1.5 M25 21.5 h0.1 M31.5 25.5 h1 M37 22 h0.1 M27 28 h0.1" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M13 24 Q16 20.5 22 19.5" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  bread: {
    tint: 'clay',
    accent: 'butter',
    svg:
      '<path d="M11 39 C14 22.5 37.5 13.5 49 24 C49 38.5 25.5 49 11 39 Z" fill="INK"/>' +
      '<path d="M8 36 C11 19.5 34.5 10.5 46 21 C46 35.5 22.5 46 8 36 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M15 31 Q26 19.5 40 19.5 Q29.5 27.5 15 31 Z" fill="ACCENT" stroke="INK" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M12.5 34 Q13.5 29 17.5 26" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  sack: {
    tint: 'oat',
    svg:
      '<path d="M25 24 L20 14 Q25 16 27 12 Q30 15 33 12 Q35 16 40 14 L35 24 C43 28 46 36 47 47 Q47 50 44 50 L16 50 Q13 50 13 47 C14 36 17 28 25 24 Z" fill="INK"/>' +
      '<path d="M22 21 L17 11 Q22 13 24 9 Q27 12 30 9 Q32 13 37 11 L32 21 C40 25 43 33 44 44 Q44 47 41 47 L13 47 Q10 47 10 44 C11 33 14 25 22 21 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M20 21 L34 21 M33 21 L37.5 25" stroke="INK" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M27 29.5 L27 42 M23 33 L25 36.5 M31 33 L29 36.5 M23 38 L25 41.5 M31 38 L29 41.5" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M14.5 41 Q15 33 19 27" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  beans: {
    tint: 'clay',
    svg:
      '<g transform="translate(3 3)" fill="INK">' +
      `<path transform="translate(28 19.5) rotate(-14)" d="${BEAN}"/>` +
      `<path transform="translate(18.5 32.5) rotate(18)" d="${BEAN}"/>` +
      `<path transform="translate(36.5 31.5) rotate(-20)" d="${BEAN}"/></g>` +
      `<path transform="translate(28 19.5) rotate(-14)" d="${BEAN}" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>` +
      `<path transform="translate(18.5 32.5) rotate(18)" d="${BEAN}" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>` +
      `<path transform="translate(36.5 31.5) rotate(-20)" d="${BEAN}" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>` +
      '<path d="M11.5 31 Q12 28.5 15 27.5" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  pasta: {
    tint: 'butter',
    accent: 'brick',
    svg:
      '<g transform="translate(3 3) rotate(45 27 27)"><path d="M20 7 L34 7 Q31 17 32 27 Q31 37 34 47 L20 47 Q23 37 22 27 Q23 17 20 7 Z" fill="INK"/></g>' +
      '<g transform="rotate(45 27 27)">' +
      '<path d="M20 7 L34 7 Q31 17 32 27 Q31 37 34 47 L20 47 Q23 37 22 27 Q23 17 20 7 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M24.5 9 Q26 27 24.5 45 M29.5 9 Q28 27 29.5 45" fill="none" stroke="INK" stroke-width="2.5" stroke-linecap="round"/>' +
      '<rect x="20.5" y="24" width="13" height="6" rx="2" fill="ACCENT" stroke="INK" stroke-width="3"/>' +
      '<path d="M22.5 34 L23.5 43" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>' +
      '</g>',
  },
  can: {
    tint: 'stone',
    accent: 'clay',
    svg:
      '<path d="M16 15 L16 45 A14 4.5 0 0 0 44 45 L44 15 A14 4.5 0 0 0 16 15 Z" fill="INK"/>' +
      '<path d="M13 12 L13 42 A14 4.5 0 0 0 41 42 L41 12 A14 4.5 0 0 0 13 12 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="27" cy="12" rx="14" ry="4.5" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<path d="M13 21 A14 4.5 0 0 0 41 21 L41 33 A14 4.5 0 0 1 13 33 Z" fill="ACCENT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M13 37.5 A14 4.5 0 0 0 41 37.5" fill="none" stroke="INK" stroke-width="2.5"/>' +
      '<path d="M17.5 27 L17.5 34" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  jar: {
    tint: 'oat',
    svg:
      '<rect x="17" y="19" width="26" height="31" rx="8" fill="INK"/>' +
      '<rect x="14" y="16" width="26" height="31" rx="8" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<rect x="17" y="8" width="20" height="8" rx="3" fill="INK"/>' +
      '<rect x="19" y="26" width="16" height="11" rx="3" fill="PAPER" stroke="INK" stroke-width="3"/>',
  },
  oil: {
    tint: 'butter',
    svg:
      '<path d="M20 15 L26 15 L26 20 C26 23 31 25 31 30 L31 47 Q31 50 28 50 L18 50 Q15 50 15 47 L15 30 C15 25 20 23 20 20 Z M40 25 C40 25 47 34 47 38 A7 7 0 0 1 33 38 C33 34 40 25 40 25 Z" fill="INK"/>' +
      '<path d="M17 12 L23 12 L23 17 C23 20 28 22 28 27 L28 44 Q28 47 25 47 L15 47 Q12 47 12 44 L12 27 C12 22 17 20 17 17 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<rect x="16" y="7" width="8" height="6" rx="1.5" fill="INK"/>' +
      '<path d="M37 22 C37 22 44 31 44 35 A7 7 0 0 1 30 35 C30 31 37 22 37 22 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M16 30 L16 41" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  sauce: {
    tint: 'brick',
    svg:
      '<path d="M27 21 L32 21 L32 27 C32 30 39 30 39 35 L39 47 Q39 50 36 50 L23 50 Q20 50 20 47 L20 35 C20 30 27 30 27 27 Z" fill="INK"/>' +
      '<path d="M24 18 L29 18 L29 24 C29 27 36 27 36 32 L36 44 Q36 47 33 47 L20 47 Q17 47 17 44 L17 32 C17 27 24 27 24 24 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M22 19 L22 13 Q22 8 26.5 8 Q31 8 31 13 L31 19 Z" fill="INK"/>' +
      '<path d="M26.5 30 C29 33 32 35 32 39 C32 42 29.5 44 26.5 44 C23.5 44 21 42 21 39 C21 37 22 35.5 23.5 34.5 C23.5 36.5 24.5 37.5 25.5 37.5 C25 35 25 32 26.5 30 Z" fill="PAPER" stroke="INK" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M20.5 33 L20.5 41" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  shaker: {
    tint: 'stone',
    svg:
      '<path d="M18 24 C18 15 23 11 30 11 C37 11 42 15 42 24 L44 46 Q44 50 40 50 L20 50 Q16 50 16 46 Z" fill="INK"/>' +
      '<path d="M16 21 L38 21 L41 43 Q41 47 37 47 L17 47 Q13 47 13 43 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M15 21 C15 12 20 8 27 8 C34 8 39 12 39 21 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M21 15.5 h0.1 M27 13.5 h0.1 M33 15.5 h0.1" stroke="INK" stroke-width="3.5" stroke-linecap="round"/>' +
      '<path d="M19 27 L18 40" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  snack: {
    tint: 'clay',
    accent: 'butter',
    svg:
      '<path d="M17 14 L20.25 11 L23.5 14 L26.75 11 L30 14 L33.25 11 L36.5 14 L39.75 11 L43 14 C45.5 24 45.5 37 43 47 L17 47 C14.5 37 14.5 24 17 14 Z" fill="INK"/>' +
      '<path d="M14 11 L17.25 8 L20.5 11 L23.75 8 L27 11 L30.25 8 L33.5 11 L36.75 8 L40 11 C42.5 21 42.5 34 40 44 L14 44 C11.5 34 11.5 21 14 11 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M15 15.5 L39 15.5 M14.5 39.5 L39.5 39.5" stroke="INK" stroke-width="2.5"/>' +
      '<path d="M18 33 Q22 25 29 20 Q34 27 36 35 Q27 36.5 18 33 Z" fill="ACCENT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M17 20 Q16 27 17 34" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  sweet: {
    tint: 'clay',
    accent: 'brick',
    svg:
      '<g transform="translate(3 3) rotate(-12 27 28)"><rect x="15" y="11" width="24" height="33" rx="3" fill="INK"/></g>' +
      '<g transform="rotate(-12 27 28)">' +
      '<rect x="16" y="11" width="22" height="30" rx="3" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<path d="M27 11 L27 27 M16 19 L38 19" stroke="INK" stroke-width="2.5"/>' +
      '<path d="M15 27 L18.5 24.5 L22 27 L25.5 24.5 L29 27 L32.5 24.5 L36 27 L39 24.5 L39 44 L15 44 Z" fill="ACCENT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M19 31 L19 40" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>' +
      '</g>',
  },
  mug: {
    tint: 'oat',
    svg:
      '<g transform="translate(3 3)" fill="INK" stroke="INK"><path d="M12 22 L36 22 L36 40 Q36 46 30 46 L18 46 Q12 46 12 40 Z"/><path d="M36 27 L39 27 Q44 27 44 32.5 Q44 38 39 38 L36 38" fill="none" stroke-width="4"/></g>' +
      '<path d="M36 27 L39 27 Q44 27 44 32.5 Q44 38 39 38 L36 38" fill="none" stroke="INK" stroke-width="4"/>' +
      '<path d="M12 22 L36 22 L36 40 Q36 46 30 46 L18 46 Q12 46 12 40 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M19 8 Q16 11 19 14 Q22 17 19 19 M28 8 Q25 11 28 14 Q31 17 28 19" fill="none" stroke="INK" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M16 27 L16 38" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  drink: {
    tint: 'mist',
    svg:
      '<g transform="translate(3 3) rotate(14 27 27)"><path d="M24 10.5 L30 10.5 L30 17.5 C30 21.5 37 22.5 37 27.5 L37 42.5 Q37 45 34.5 45 L19.5 45 Q17 45 17 42.5 L17 27.5 C17 22.5 24 21.5 24 17.5 Z" fill="INK"/></g>' +
      '<g transform="rotate(14 27 27)">' +
      '<path d="M24 10.5 L30 10.5 L30 17.5 C30 21.5 37 22.5 37 27.5 L37 42.5 Q37 45 34.5 45 L19.5 45 Q17 45 17 42.5 L17 27.5 C17 22.5 24 21.5 24 17.5 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<rect x="22.5" y="7.5" width="9" height="4.5" rx="1.5" fill="INK"/>' +
      '<rect x="17" y="30" width="20" height="9.5" fill="PAPER" stroke="INK" stroke-width="3"/>' +
      '<path d="M21 25.5 Q21.5 23 24 21.5" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>' +
      '</g>',
  },
  ice: {
    tint: 'mist',
    svg:
      `<path transform="translate(3 3)" d="${SNOWFLAKE}" fill="none" stroke="INK" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${SNOWFLAKE}" fill="none" stroke="INK" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${SNOWFLAKE}" fill="none" stroke="TINT" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
      '<circle cx="26.5" cy="26.5" r="2.5" fill="PAPER" opacity="0.75"/>',
  },
  roll: {
    tint: 'stone',
    svg:
      '<path d="M15 17 L15 45 A13 5 0 0 0 41 45 L41 17 A13 5 0 0 0 15 17 Z M41 23 L48 25 L48 48 L41 46 Z" fill="INK"/>' +
      '<path d="M12 14 L12 42 A13 5 0 0 0 38 42 L38 14 A13 5 0 0 0 12 14 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M37 20 L45 22 L45 45 L37 43 Z" fill="TINT" stroke="INK" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="25" cy="14" rx="13" ry="5" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<ellipse cx="25" cy="14" rx="5" ry="2" fill="INK" stroke="INK" stroke-width="2"/>' +
      '<path d="M16 22 L16 37" fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"/>',
  },
  cleaner: {
    tint: 'mist',
    svg:
      '<rect x="18" y="23" width="24" height="27" rx="8" fill="INK"/>' +
      '<rect x="15" y="20" width="24" height="27" rx="8" fill="TINT" stroke="INK" stroke-width="3"/>' +
      '<rect x="22" y="11" width="10" height="9" rx="2" fill="INK"/>' +
      '<path d="M27 11 L27 7 L38 7" fill="none" stroke="INK" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="22" cy="32" r="3" fill="PAPER"/>' +
      '<circle cx="29" cy="38" r="2" fill="PAPER"/>',
  },
} satisfies Partial<Record<Picto, PictoArt>>;
