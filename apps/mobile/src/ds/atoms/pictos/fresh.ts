// Vegetables, herbs and chiles. See types.ts for the house style.
import type { Picto } from '@mesa/shared';

import type { PictoArt } from './types';

/**
 * The sticker shadow: the same shape in INK, 3 px down and right, drawn first. When one path holds
 * several shapes, draw them all clockwise: opposite windings punch holes where they overlap.
 */
const DROP = 'fill="INK" transform="translate(3 3)"';
/** The outline every shape and detail shares. */
const EDGE = 'stroke="INK" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const LINE = `fill="none" ${EDGE}`;
/** The one paper highlight. */
const SHINE = 'fill="none" stroke="PAPER" stroke-width="3" stroke-linecap="round" opacity="0.75"';

export const FRESH = {
  tomato: {
    tint: 'brick',
    accent: 'leaf',
    svg:
      `<ellipse cx="27" cy="32" rx="17" ry="14" ${DROP}/>` +
      `<ellipse cx="27" cy="32" rx="17" ry="14" fill="TINT" ${EDGE}/>` +
      `<path d="M27 19 Q27 14 30 10.5" ${LINE}/>` +
      `<path d="M27 26 L24.6 22 L15.6 21.9 L23.2 19.2 L19.9 15.1 L27 17.5 L34.1 15.1 L30.8 19.2 L38.4 21.9 L29.4 22 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M13.5 34 Q13.5 28 17 25" ${SHINE}/>`,
  },
  onion: {
    tint: 'blush',
    svg:
      `<path d="M23 44 L21 47 M27 44 L27 48 M31 44 L33 47" ${LINE}/>` +
      `<path d="M27 8 C29 15 43 20 43 31 C43 39 36 43 27 43 C18 43 11 39 11 31 C11 20 25 15 27 8 Z" ${DROP}/>` +
      `<path d="M27 8 C29 15 43 20 43 31 C43 39 36 43 27 43 C18 43 11 39 11 31 C11 20 25 15 27 8 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M24 17 Q16 30 23 42 M30 17 Q38 30 31 42" ${LINE}/>` +
      `<path d="M15 31 Q15 25 19 22" ${SHINE}/>`,
  },
  garlic: {
    tint: 'oat',
    svg:
      `<path d="M24 8 L30 8 L30 15 C38 18 45 24 45 33 C45 40 41 45 37 45 C35 45 34 44 33 43 C32 45 29 46 27 46 C25 46 22 45 21 43 C20 44 19 45 17 45 C13 45 9 40 9 33 C9 24 16 18 24 15 Z" ${DROP}/>` +
      `<path d="M24 8 L30 8 L30 15 C38 18 45 24 45 33 C45 40 41 45 37 45 C35 45 34 44 33 43 C32 45 29 46 27 46 C25 46 22 45 21 43 C20 44 19 45 17 45 C13 45 9 40 9 33 C9 24 16 18 24 15 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M24 17 C18 25 18 36 21 43 M30 17 C36 25 36 36 33 43" ${LINE}/>` +
      `<path d="M13 33 Q13 27 17 23" ${SHINE}/>`,
  },
  carrot: {
    tint: 'clay',
    accent: 'leaf',
    svg:
      `<path d="M30 20 C25.5 17 24.5 12 27.5 9.5 C31 10 33 12 33.2 15 C33 11.5 34.5 9 37.5 8.5 C40 10.5 40 13.5 37.7 16.2 C40 13.5 43 13 45.5 14.5 C45.5 18 42.5 22 38 23 Z M26 19.2 A7 7 0 0 1 36 28.8 Q27 40 10 46 Q14 29 26 19.2 Z" ${DROP}/>` +
      `<path d="M30 20 C25.5 17 24.5 12 27.5 9.5 C31 10 33 12 33.2 15 C33 11.5 34.5 9 37.5 8.5 C40 10.5 40 13.5 37.7 16.2 C40 13.5 43 13 45.5 14.5 C45.5 18 42.5 22 38 23 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M26 19.2 A7 7 0 0 1 36 28.8 Q27 40 10 46 Q14 29 26 19.2 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M31 34.1 L28.1 31.3 M23.7 39.5 L21.2 37.1" ${LINE}/>` +
      `<path d="M24 25.5 Q20.5 29 18.5 33" ${SHINE}/>`,
  },
  radish: {
    tint: 'blush',
    accent: 'leaf',
    svg:
      `<path d="M27 22 C22 17 23 11 27 8 C31 11 32 17 27 22 Z M25 22 C18 22 13 17 13 11 C19 11 25 16 25 22 Z M29 22 C29 16 35 11 41 11 C41 17 36 22 29 22 Z M27 21 C35 21 39 26 39 32 C39 38 32 42 27 45 C22 42 15 38 15 32 C15 26 19 21 27 21 Z" ${DROP}/>` +
      `<path d="M27 22 C22 17 23 11 27 8 C31 11 32 17 27 22 Z M25 22 C18 22 13 17 13 11 C19 11 25 16 25 22 Z M29 22 C29 16 35 11 41 11 C41 17 36 22 29 22 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M27 21 C35 21 39 26 39 32 C39 38 32 42 27 45 C22 42 15 38 15 32 C15 26 19 21 27 21 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M27 44 Q27.5 46.5 25.5 48" ${LINE}/>` +
      `<path d="M19 31 Q19 27 22 25" ${SHINE}/>`,
  },
  leafy: {
    tint: 'sage',
    accent: 'leaf',
    svg:
      `<path d="M10 30 C10 20 15 13 20 14 C22 10 27 9 30 12 C34 10 39 13 39 17 C43 19 45 25 44 31 C43 40 36 46 27 46 C18 46 10 40 10 30 Z" ${DROP}/>` +
      `<path d="M10 30 C10 20 15 13 20 14 C22 10 27 9 30 12 C34 10 39 13 39 17 C43 19 45 25 44 31 C43 40 36 46 27 46 C18 46 10 40 10 30 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M27 45 C18 41 15 29 19 19 C22 21 24 18 27 16 C30 18 32 21 35 19 C39 29 36 41 27 45 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M27 43 L27 26 M27 36 L22.5 31 M27 36 L31.5 31" ${LINE}/>` +
      `<path d="M20.5 27 Q20.5 24 22 22" ${SHINE}/>`,
  },
  corn: {
    tint: 'butter',
    accent: 'leaf',
    svg:
      `<path d="M20 18 C20 11 23 8 27 8 C31 8 34 11 34 18 L34 36 L27 45 L20 36 Z M28 46 C18 46 12 37 12 24 C17 28 22 33 25 38 C26 41 27 44 28 46 Z M26 46 C27 44 28 41 29 38 C32 33 37 28 42 24 C42 37 36 46 26 46 Z" ${DROP}/>` +
      `<path d="M20 18 C20 11 23 8 27 8 C31 8 34 11 34 18 L34 36 L27 45 L20 36 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M24 11 L24 38 M30 11 L30 38 M20 17 L34 17 M20 23 L34 23 M20 29 L34 29" fill="none" stroke="INK" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M28 46 C18 46 12 37 12 24 C17 28 22 33 25 38 C26 41 27 44 28 46 Z M26 46 C27 44 28 41 29 38 C32 33 37 28 42 24 C42 37 36 46 26 46 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M15.5 29 Q16 35 20 39" ${SHINE}/>`,
  },
  pepper: {
    tint: 'brick',
    accent: 'leaf',
    svg:
      `<path d="M27 17 C30 13 39 12 41 18 C43 24 42 34 40 40 C39 45 35 46 33 43 C31 46 23 46 21 43 C19 46 15 45 14 40 C12 34 11 24 13 18 C15 12 24 13 27 17 Z" ${DROP}/>` +
      `<path d="M27 17 C30 13 39 12 41 18 C43 24 42 34 40 40 C39 45 35 46 33 43 C31 46 23 46 21 43 C19 46 15 45 14 40 C12 34 11 24 13 18 C15 12 24 13 27 17 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M21 43 Q20 39 21.5 35 M33 43 Q34 39 32.5 35" ${LINE}/>` +
      `<path d="M27 15 Q27.5 11 31 10" fill="none" stroke="INK" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M27 15 Q27.5 11 31 10" fill="none" stroke="ACCENT" stroke-width="2.5" stroke-linecap="round"/>` +
      `<ellipse cx="27" cy="17" rx="6" ry="3.2" fill="ACCENT" ${EDGE}/>` +
      `<path d="M16.5 23 Q15 28 16.5 34" ${SHINE}/>`,
  },
  squash: {
    tint: 'leaf',
    svg:
      `<path d="M8.5 28 C8.5 23 12.5 20.5 18 20.5 L37 21.5 C42 21.5 45.5 24.5 45.5 28 C45.5 31.5 42 34.5 37 34.5 L18 35.5 C12.5 35.5 8.5 33 8.5 28 Z" fill="INK" transform="translate(3 3) rotate(-45 27 28)"/>` +
      `<g transform="rotate(-45 27 28)">` +
      `<path d="M45 28 L49 28" fill="none" stroke="INK" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M8.5 28 C8.5 23 12.5 20.5 18 20.5 L37 21.5 C42 21.5 45.5 24.5 45.5 28 C45.5 31.5 42 34.5 37 34.5 L18 35.5 C12.5 35.5 8.5 33 8.5 28 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M19 31 L24 31 M29 31 L34 30.5" ${LINE}/>` +
      `<path d="M16 25 L34 25.5" ${SHINE}/>` +
      `</g>`,
  },
  potato: {
    tint: 'oat',
    svg:
      `<path d="M10 30 C8 22 14 16 22 17 C27 17.5 30 14 36 15 C42 16 46 21 45 28 C44.5 33 41 34 40 37 C38 41 32 42 27 41.5 C22 41 20 43 15 40 C11 38 10.5 34 10 30 Z" ${DROP}/>` +
      `<path d="M10 30 C8 22 14 16 22 17 C27 17.5 30 14 36 15 C42 16 46 21 45 28 C44.5 33 41 34 40 37 C38 41 32 42 27 41.5 C22 41 20 43 15 40 C11 38 10.5 34 10 30 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M17.3 31 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0 Z M29.3 22.5 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0 Z M34.3 32.5 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0 Z M24.8 36 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0 Z" fill="INK"/>` +
      `<path d="M15 27 Q15 22 19 20" ${SHINE}/>`,
  },
  broccoli: {
    tint: 'leaf',
    accent: 'sage',
    svg:
      `<path d="M33 30 C31 33 30.5 35 30.5 38 L30.5 43 C29.5 46 24.5 46 23.5 43 L23.5 38 C23.5 35 23 33 21 30 Z M11 31 A7 7 0 0 1 14 19 A6 6 0 0 1 22 12 A6 6 0 0 1 32 12 A6 6 0 0 1 40 19 A7 7 0 0 1 43 31 Q27 35 11 31 Z" ${DROP}/>` +
      `<path d="M33 30 C31 33 30.5 35 30.5 38 L30.5 43 C29.5 46 24.5 46 23.5 43 L23.5 38 C23.5 35 23 33 21 30 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M11 31 A7 7 0 0 1 14 19 A6 6 0 0 1 22 12 A6 6 0 0 1 32 12 A6 6 0 0 1 40 19 A7 7 0 0 1 43 31 Q27 35 11 31 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M14 19 Q17.5 21 18 25 M40 19 Q36.5 21 36 25 M22 12 Q24.5 14.5 24 18 M32 12 Q29.5 14.5 30 18" ${LINE}/>` +
      `<path d="M13 28 Q12.5 24 14.5 22" ${SHINE}/>`,
  },
  avocado: {
    tint: 'leaf',
    accent: 'butter',
    svg:
      `<path d="M27 8 C33 8 35 13 36 18 C37 24 43 28 43 35 C43 42 36 46 27 46 C18 46 11 42 11 35 C11 28 17 24 18 18 C19 13 21 8 27 8 Z" ${DROP}/>` +
      `<path d="M27 8 C33 8 35 13 36 18 C37 24 43 28 43 35 C43 42 36 46 27 46 C18 46 11 42 11 35 C11 28 17 24 18 18 C19 13 21 8 27 8 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M27 12.5 C30.5 12.5 31.5 16 32.5 20 C33.5 26 39 29 39 35 C39 40 34 42.5 27 42.5 C20 42.5 15 40 15 35 C15 29 20.5 26 21.5 20 C22.5 16 23.5 12.5 27 12.5 Z" fill="ACCENT"/>` +
      `<circle cx="27" cy="33" r="6.5" fill="INK"/>` +
      `<path d="M24 31.5 Q24.5 29 27 28.5" ${SHINE}/>`,
  },
  nopal: {
    tint: 'leaf',
    svg:
      `<ellipse cx="37" cy="17" rx="6" ry="8.5" fill="INK" transform="translate(3 3) rotate(30 37 17)"/>` +
      `<path d="M24 46.5 C18 46.5 12 41 11 32 C10 23 15 16 24 16 C33 16 38 23 37 32 C36 41 30 46.5 24 46.5 Z" ${DROP}/>` +
      `<ellipse cx="37" cy="17" rx="6" ry="8.5" fill="TINT" transform="rotate(30 37 17)" ${EDGE}/>` +
      `<path d="M24 46.5 C18 46.5 12 41 11 32 C10 23 15 16 24 16 C33 16 38 23 37 32 C36 41 30 46.5 24 46.5 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M18 25 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M28 26 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M22 33 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M17 40 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M28 40 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M36 15 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z" fill="INK"/>` +
      `<path d="M14.5 34 Q13.5 27 16 22" ${SHINE}/>`,
  },
  mushroom: {
    tint: 'stone',
    accent: 'oat',
    svg:
      `<path d="M34 31 C34 36 36 41 34 44 C32 47 22 47 20 44 C18 41 20 36 20 31 Z M9 28 C9 17 17 10 27 10 C37 10 45 17 45 28 C45 31 43 32 40 32 L14 32 C11 32 9 31 9 28 Z" ${DROP}/>` +
      `<path d="M34 31 C34 36 36 41 34 44 C32 47 22 47 20 44 C18 41 20 36 20 31 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M9 28 C9 17 17 10 27 10 C37 10 45 17 45 28 C45 31 43 32 40 32 L14 32 C11 32 9 31 9 28 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M14 25 Q15 18 21 15" ${SHINE}/>`,
  },
  pod: {
    tint: 'leaf',
    accent: 'sage',
    svg:
      `<path d="M9 28 C17 16 37 16 45 28 C37 40 17 40 9 28 Z" fill="INK" transform="translate(3 3) rotate(-20 27 28)"/>` +
      `<g transform="rotate(-20 27 28)">` +
      `<path d="M45 28 Q49 27 49 23" ${LINE}/>` +
      `<path d="M9 28 C17 16 37 16 45 28 C37 40 17 40 9 28 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M14.5 26.5 a4.5 4.5 0 1 1 9 0 a4.5 4.5 0 1 1 -9 0 Z M22.5 25.5 a4.5 4.5 0 1 1 9 0 a4.5 4.5 0 1 1 -9 0 Z M30.5 26.5 a4.5 4.5 0 1 1 9 0 a4.5 4.5 0 1 1 -9 0 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M9 28 C17 40 37 40 45 28 C37 27 17 27 9 28 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M17 33 Q27 35.5 37 33" ${SHINE}/>` +
      `</g>`,
  },
  herb: {
    tint: 'leaf',
    svg:
      `<g transform="translate(3 3)">` +
      `<path d="M19 43 Q20.5 29 31 15" fill="none" stroke="INK" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M31 16 A6 6 0 0 1 37 8.5 A6 6 0 0 1 31 16 Z M27 22 A7.5 7.5 0 0 1 41 19 A7.5 7.5 0 0 1 27 22 Z M26 22 A8 8 0 0 1 13 14 A8 8 0 0 1 26 22 Z M22 32 A7.5 7.5 0 0 1 35 35 A7.5 7.5 0 0 1 22 32 Z M21 32 A7 7 0 0 1 9 28 A7 7 0 0 1 21 32 Z" fill="INK"/>` +
      `</g>` +
      `<path d="M19 43 Q20.5 29 31 15" fill="none" stroke="INK" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M19 43 Q20.5 29 31 15" fill="none" stroke="TINT" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M31 16 A6 6 0 0 1 37 8.5 A6 6 0 0 1 31 16 Z M27 22 A7.5 7.5 0 0 1 41 19 A7.5 7.5 0 0 1 27 22 Z M26 22 A8 8 0 0 1 13 14 A8 8 0 0 1 26 22 Z M22 32 A7.5 7.5 0 0 1 35 35 A7.5 7.5 0 0 1 22 32 Z M21 32 A7 7 0 0 1 9 28 A7 7 0 0 1 21 32 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M17.5 15.5 L21.5 18.5" ${SHINE}/>`,
  },
  chile: {
    tint: 'brick',
    accent: 'leaf',
    svg:
      `<path d="M20 10 C35 11 45 27 37 45 C36 32 27 24 13 21 C11 17 15 11 20 10 Z M11 22 C8 16 12 9 19 8 C22 11 22 13 20 15 C20 18 16 21 11 22 Z" ${DROP}/>` +
      `<path d="M20 10 C35 11 45 27 37 45 C36 32 27 24 13 21 C11 17 15 11 20 10 Z" fill="TINT" ${EDGE}/>` +
      `<path d="M15 14 Q12 9 8 9" fill="none" stroke="INK" stroke-width="3.5" stroke-linecap="round"/>` +
      `<path d="M11 22 C8 16 12 9 19 8 C22 11 22 13 20 15 C20 18 16 21 11 22 Z" fill="ACCENT" ${EDGE}/>` +
      `<path d="M25 15.5 Q32 17 35 24" ${SHINE}/>`,
  },
} satisfies Partial<Record<Picto, PictoArt>>;
