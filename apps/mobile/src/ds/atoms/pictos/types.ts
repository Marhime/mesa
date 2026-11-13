// A food drawing as data: SVG markup on a 56×56 canvas, with color names instead of colors.
import { art } from '../../tokens';

export type ArtTint = Exclude<keyof typeof art, 'ink' | 'paper'>;

/**
 * `svg` is the inside of `<svg viewBox="0 0 56 56">`. Colors are written as INK, PAPER, TINT and ACCENT
 * (never as hex): `paint` swaps them for the art tokens. House style (see sage examples):
 * - an INK copy of the silhouette, offset +3/+3, drawn first (the printed-sticker shadow);
 * - the silhouette in TINT with an INK stroke of 3, round joins and caps;
 * - a few INK details, one PAPER highlight stroke (width 3, opacity 0.75);
 * - stays inside 6–50, reads at 32 px, no text.
 */
export interface PictoArt {
  tint: ArtTint;
  /** A second food color (avocado flesh, watermelon rind). */
  accent?: ArtTint;
  svg: string;
}

/** The full `<svg>` document with real colors. */
export function paint(a: PictoArt): string {
  const colors: Record<string, string> = {
    INK: art.ink,
    PAPER: art.paper,
    TINT: art[a.tint],
    ACCENT: art[a.accent ?? a.tint],
  };
  const body = a.svg.replace(/\b(INK|PAPER|TINT|ACCENT)\b/g, (m) => colors[m]!);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">${body}</svg>`;
}
