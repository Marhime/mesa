// Contact sheet of food drawings, to review them by eye:
//   npx tsx scripts/render-pictos.ts src/ds/atoms/pictos/fresh.ts /tmp/fresh.png
// Each picto: large (96 px), then actual size (32 px) on the light and the dark surface. Needs Google Chrome.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { palettes } from '../src/ds/tokens';
import { paint, type PictoArt } from '../src/ds/atoms/pictos/types';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COLUMNS = 6;

async function main(): Promise<void> {
  const [file, out] = process.argv.slice(2);
  if (!file || !out) {
    console.error('usage: npx tsx scripts/render-pictos.ts <pictos module> <out.png>');
    process.exit(1);
  }
  const mod = (await import(resolve(file))) as Record<string, unknown>;
  const set = Object.assign({}, ...Object.values(mod).filter((v) => v && typeof v === 'object')) as Record<string, PictoArt>;
  const names = Object.keys(set);
  const cells = names
    .map(
      (name) =>
        `<figure><div class="big">${paint(set[name]!)}</div>` +
        `<div class="pair"><span class="light">${paint(set[name]!)}</span><span class="dark">${paint(set[name]!)}</span></div>` +
        `<figcaption>${name}</figcaption></figure>`,
    )
    .join('');
  const html = `<!doctype html><html><head><style>
    body { margin: 0; padding: 16px; font: 13px -apple-system, sans-serif; background: ${palettes.light.surfaceRaised}; }
    main { display: grid; grid-template-columns: repeat(${COLUMNS}, 1fr); gap: 12px; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .big svg { width: 96px; height: 96px; }
    .pair { display: flex; }
    .pair span { display: flex; padding: 6px; }
    .pair svg { width: 32px; height: 32px; }
    .light { background: ${palettes.light.surface}; }
    .dark { background: ${palettes.dark.surfaceRaised}; }
  </style></head><body><main>${cells}</main></body></html>`;
  const dir = mkdtempSync(join(tmpdir(), 'pictos-'));
  const page = join(dir, 'sheet.html');
  writeFileSync(page, html);
  const rows = Math.ceil(names.length / COLUMNS);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--screenshot=${resolve(out)}`,
    `--window-size=1000,${rows * 190 + 40}`,
    `file://${page}`,
  ], { stdio: 'ignore' });
  console.log(`${names.length} pictos → ${resolve(out)}`);
}

void main();
