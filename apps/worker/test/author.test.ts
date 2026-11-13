import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { authorColumns, authorFromYtDlp, cleanAuthorName, webAuthor } from '../src/author';
import { authorName, parsePage } from '../src/jsonld';
import { parseYtDlpInfo } from '../src/ytdlp';

const UC = 'UCE-NIVMcV8A2GwGcCYLSMDQ';

describe('authorFromYtDlp', () => {
  it('YouTube: channel name, id and canonical page', () => {
    expect(
      authorFromYtDlp({
        extractor_key: 'Youtube',
        channel: 'Food is Love',
        channel_id: UC,
        channel_url: `https://www.youtube.com/channel/${UC}`,
        uploader: 'Food is Love',
        uploader_id: '@FoodisLove',
        uploader_url: 'https://www.youtube.com/@FoodisLove',
      }),
    ).toEqual({ name: 'Food is Love', channelUrl: `https://www.youtube.com/channel/${UC}`, channelId: UC });
  });

  it('YouTube without a channel id: the handle page, and the handle as a last-resort name', () => {
    expect(authorFromYtDlp({ extractor_key: 'Youtube', uploader_id: '@FoodisLove', uploader_url: 'https://www.youtube.com/@FoodisLove' })).toEqual({
      name: '@FoodisLove',
      channelUrl: 'https://www.youtube.com/@FoodisLove',
      channelId: null,
    });
  });

  it('Instagram: the full name, else the username; the account id, no page', () => {
    expect(authorFromYtDlp({ extractor_key: 'Instagram', uploader: 'Lupita Ramírez', channel: 'cocinaconlupita', uploader_id: '5512345' })).toEqual({
      name: 'Lupita Ramírez',
      channelUrl: null,
      channelId: '5512345',
    });
    expect(authorFromYtDlp({ extractor_key: 'Instagram', uploader: '', channel: 'cocinaconlupita' })).toMatchObject({ name: 'cocinaconlupita' });
  });

  it('TikTok: the display name, else the handle', () => {
    expect(authorFromYtDlp({ extractor_key: 'TikTok', channel: 'Food is Love', uploader: 'foodislove', uploader_id: '6812', channel_id: 'MS4wLjAB' })).toEqual({
      name: 'Food is Love',
      channelUrl: null,
      channelId: '6812',
    });
    expect(authorFromYtDlp({ extractor_key: 'TikTok', uploader: 'foodislove' })).toMatchObject({ name: 'foodislove' });
  });

  it('nothing known: null', () => {
    expect(authorFromYtDlp({ extractor_key: 'Instagram', uploader_id: '5512345' })).toBeNull();
    expect(authorFromYtDlp({ title: 'Video by someone' })).toBeNull();
  });

  it('comes with the video metadata, from a carousel entry when the post lacks it', () => {
    const meta = parseYtDlpInfo({
      _type: 'playlist',
      extractor_key: 'Instagram',
      entries: [{ uploader: 'Lupita', uploader_id: '42', thumbnail: 'https://cdn/a.jpg' }],
    });
    expect(meta.author).toEqual({ name: 'Lupita', channelUrl: null, channelId: '42' });
  });
});

describe('website author', () => {
  const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

  it('reads the JSON-LD author of the recipe', () => {
    const page = parsePage(fixture('tinga-graph.html'), 'https://cocinaconlupita.example/tinga-de-pollo/');
    expect(page.recipe?.author).toBe('Lupita');
    expect(webAuthor(page)).toEqual({ name: 'Lupita', channelUrl: null, channelId: null });
  });

  it('falls back to the site name, and to nothing', () => {
    const html = `<html><head><meta property="og:site_name" content="Simply Weeknight">
      <script type="application/ld+json">{"@type":"Recipe","name":"Guacamole","recipeIngredient":["2 avocados"]}</script></head></html>`;
    const page = parsePage(html, 'https://simplyweeknight.example/guacamole');
    expect(page.siteName).toBe('Simply Weeknight');
    expect(page.recipe?.author).toBeNull();
    expect(webAuthor(page)?.name).toBe('Simply Weeknight');
    expect(webAuthor(parsePage('<html><body>hi</body></html>', 'https://x.example/'))).toBeNull();
  });

  it('reads the forms author takes', () => {
    expect(authorName('Jane Doe')).toBe('Jane Doe');
    expect(authorName({ '@type': 'Person', name: 'Jane Doe' })).toBe('Jane Doe');
    expect(authorName([{ '@id': 'https://x/#person' }, { '@type': 'Organization', name: 'Kitchn' }])).toBe('Kitchn');
    expect(authorName({ '@id': 'https://x/#person' })).toBeNull();
    expect(authorName(42)).toBeNull();
  });

  it('cleans names', () => {
    expect(cleanAuthorName('  By   Jane Doe ')).toBe('Jane Doe');
    expect(cleanAuthorName('par: Julie')).toBe('Julie');
    expect(cleanAuthorName('Byron Smith')).toBe('Byron Smith');
    expect(cleanAuthorName('https://example.com/author/jane')).toBeNull();
    expect(cleanAuthorName('x'.repeat(200))).toBeNull();
  });
});

describe('authorColumns', () => {
  it('writes the three columns when known, nothing otherwise', () => {
    expect(authorColumns({ name: 'Food is Love', channelUrl: `https://www.youtube.com/channel/${UC}`, channelId: UC })).toEqual({
      source_author: 'Food is Love',
      source_channel_url: `https://www.youtube.com/channel/${UC}`,
      source_channel_id: UC,
    });
    expect(authorColumns(null)).toEqual({});
  });
});
