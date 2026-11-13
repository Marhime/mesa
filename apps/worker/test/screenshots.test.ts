import { describe, expect, it } from 'vitest';

import { jobImagePaths, screenshotParts, type Screenshot } from '../src/pipeline-screenshots';
import { jobPlatform, jobSourceUrl } from '../src/pipeline';
import type { ImportJob } from '@mesa/shared';

const shot = (path: string, size: number): Screenshot => ({ path, bytes: Buffer.alloc(size, path.charCodeAt(0)), mime: 'image/png' });
const images = (parts: ReturnType<typeof screenshotParts>['parts']) =>
  parts.flatMap((p) => (p.inlineData ? [Buffer.from(p.inlineData.data!, 'base64').toString('latin1').charAt(0)] : []));
const texts = (parts: ReturnType<typeof screenshotParts>['parts']) => parts.flatMap((p) => (p.text !== undefined ? [p.text] : []));

describe('screenshotParts', () => {
  it('sends every screenshot in order, each labelled, after saying they are one recipe', () => {
    const batch = screenshotParts([shot('a', 10), shot('b', 10), shot('c', 10)], 100);
    expect(images(batch.parts)).toEqual(['a', 'b', 'c']);
    expect(batch.sent.map((s) => s.path)).toEqual(['a', 'b', 'c']);
    expect(batch.bytes).toBe(30);
    const t = texts(batch.parts);
    expect(t[0]).toMatch(/3 screenshots of the same recipe, in order/);
    expect(t).toContain('Screenshot 2 of 3:');
    expect(t.at(-1)).toMatch(/screenshot 1 shows the prepared dish/);
    // label, then its image
    const second = batch.parts.findIndex((p) => p.text === 'Screenshot 2 of 3:');
    expect(Buffer.from(batch.parts[second + 1]!.inlineData!.data!, 'base64').toString('latin1').charAt(0)).toBe('b');
  });

  it('stops at the first screenshot that would pass the cap', () => {
    const batch = screenshotParts([shot('a', 40), shot('b', 50), shot('c', 20), shot('d', 5)], 100);
    expect(images(batch.parts)).toEqual(['a', 'b']);
    expect(batch.bytes).toBe(90);
    expect(texts(batch.parts)[0]).toMatch(/These are 2 screenshots/);
  });

  it('sends nothing when the first one alone is too large', () => {
    const batch = screenshotParts([shot('a', 200), shot('b', 10)], 100);
    expect(batch.sent).toEqual([]);
  });
});

describe('jobImagePaths', () => {
  const job = (input_image_path: string | null, input_image_paths: string[] | null) => ({ input_image_path, input_image_paths });

  it('lists every screenshot in order without repeats, else the single image', () => {
    expect(jobImagePaths(job('h/1.png', ['h/1.png', 'h/2.png', 'h/1.png', '']))).toEqual(['h/1.png', 'h/2.png']);
    expect(jobImagePaths(job('h/1.png', null))).toEqual(['h/1.png']);
    expect(jobImagePaths(job(null, []))).toEqual([]);
  });

  it('makes a job with screenshots an image import, without a source link', () => {
    const base = { input_url: null, input_text: null } as unknown as ImportJob;
    const screenshots = { ...base, input_image_path: null, input_image_paths: ['h/1.png', 'h/2.png'] } as ImportJob;
    expect(jobPlatform(screenshots)).toBe('image');
    expect(jobSourceUrl(screenshots)).toBeNull();
  });
});
