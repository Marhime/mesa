// The guarded fetch: no address of the server's own network, by name, by literal or by redirect; only
// http(s) on their default ports; at most 5 redirects. A fake lookup stands in for DNS (nothing leaves
// the machine: every request here is refused before a connection opens).
import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';

import { ImportError } from '../src/errors';
import { downloadImage, fetchPage } from '../src/http';
import {
  BlockedLinkError,
  checkLink,
  guardedFetchOnce,
  guardedLookup,
  isBlockedAddress,
  isBlockedLink,
  linkFetcher,
  MAX_REDIRECTS,
  type FetchOnce,
  type ResolveAll,
} from '../src/safe-fetch';

describe('isBlockedAddress', () => {
  it('refuses this machine, private, shared and unroutable networks, in IPv4 and IPv6', () => {
    const blocked = [
      '127.0.0.1', '127.8.9.10', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
      '100.64.0.1', '100.127.255.255', '0.0.0.0', '0.1.2.3', '192.0.0.8', '198.18.0.1', '198.19.255.255',
      '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
      '::', '::1', '::7f00:1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1',
      // IPv4-mapped IPv6, written both ways
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '::ffff:c0a8:101',
      'not an address',
    ];
    for (const a of blocked) expect(isBlockedAddress(a), a).toBe(true);
  });

  it('lets the rest of the internet through', () => {
    for (const a of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '198.20.0.1', '192.0.1.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isBlockedAddress(a), a).toBe(false);
    }
  });
});

const fakeResolve = (answers: Record<string, string[]>): ResolveAll => (hostname, _options, callback) => {
  const list = answers[hostname];
  if (!list) return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), []);
  callback(null, list.map((address): LookupAddress => ({ address, family: address.includes(':') ? 6 : 4 })));
};

/** The lookup's answer, in the one-address or the all-addresses form. */
const lookUp = (hostname: string, all: boolean, resolve: ResolveAll) =>
  new Promise<{ err: Error | null; address: unknown; family?: number }>((done) =>
    guardedLookup(resolve)(hostname, { all }, (err, address, family) => done({ err, address, family })),
  );

describe('guardedLookup', () => {
  const resolve = fakeResolve({
    'recipes.test': ['93.184.216.34', '2606:4700::1111'],
    'inside.test': ['10.0.0.7'],
    'both.test': ['93.184.216.34', '127.0.0.1'],
    'nothing.test': [],
  });

  it('answers with the public addresses, one or all as asked', async () => {
    expect(await lookUp('recipes.test', false, resolve)).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    const all = await lookUp('recipes.test', true, resolve);
    expect(all.err).toBeNull();
    expect(all.address).toEqual([{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1111', family: 6 }]);
  });

  it('refuses a name when any of its addresses is blocked, or when it has none', async () => {
    for (const host of ['inside.test', 'both.test', 'nothing.test']) {
      for (const all of [false, true]) expect((await lookUp(host, all, resolve)).err, host).toBeInstanceOf(BlockedLinkError);
    }
  });

  it('passes DNS failures on as they are', async () => {
    const { err } = await lookUp('missing.test', false, resolve);
    expect(err).toMatchObject({ code: 'ENOTFOUND' });
    expect(isBlockedLink(err)).toBe(false);
  });
});

describe('checkLink', () => {
  const blocked = (url: string) => expect(() => checkLink(new URL(url)), url).toThrow(BlockedLinkError);

  it('takes only http and https on their default ports', () => {
    expect(() => checkLink(new URL('https://recipes.test/tinga'))).not.toThrow();
    expect(() => checkLink(new URL('http://recipes.test:80/tinga'))).not.toThrow();
    expect(() => checkLink(new URL('https://recipes.test:443/tinga'))).not.toThrow();
    expect(() => checkLink(new URL('https://8.8.8.8/'))).not.toThrow();
    blocked('ftp://recipes.test/');
    blocked('file:///etc/passwd');
    blocked('https://recipes.test:8443/');
    blocked('http://recipes.test:443/');
  });

  it('checks an address written in the link (no lookup happens for one)', () => {
    blocked('http://127.0.0.1/');
    blocked('http://169.254.169.254/latest/meta-data/');
    blocked('http://[::1]/');
    blocked('http://[::ffff:127.0.0.1]/');
    // URL reads these as 127.0.0.1
    blocked('http://0x7f.1/');
    blocked('http://2130706433/');
  });
});

/** Answers each URL from its own script; records what was asked. */
function scripted(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const once: FetchOnce = async (url) => {
    asked.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return route();
  };
  return { once, asked };
}

const redirect = (location: string | null, status = 302): Response =>
  new Response('moved', { status, headers: location === null ? {} : { location } });
const init = () => ({ headers: {}, signal: new AbortController().signal });

describe('linkFetcher', () => {
  it('follows redirects one hop at a time and says where they led', async () => {
    const { once, asked } = scripted({
      'https://short.test/x': () => redirect('https://recipes.test/a', 301),
      'https://recipes.test/a': () => redirect('/b?c=1', 307),
      'https://recipes.test/b?c=1': () => new Response('<html>tinga</html>', { status: 200 }),
    });
    const { response, url } = await linkFetcher(once)('https://short.test/x', init());
    expect(await response.text()).toBe('<html>tinga</html>');
    expect(url).toBe('https://recipes.test/b?c=1');
    expect(asked).toEqual(['https://short.test/x', 'https://recipes.test/a', 'https://recipes.test/b?c=1']);
  });

  it('never requests a hop that leads inside, to another port or scheme', async () => {
    for (const target of ['http://169.254.169.254/latest/meta-data/', 'https://recipes.test:8080/', 'file:///etc/passwd', 'http://[fd00::1]/']) {
      const { once, asked } = scripted({ 'https://recipes.test/': () => redirect(target) });
      const err = await linkFetcher(once)('https://recipes.test/', init()).catch((e: unknown) => e);
      expect(err, target).toBeInstanceOf(BlockedLinkError);
      expect(asked).toEqual(['https://recipes.test/']);
    }
  });

  it(`stops after ${MAX_REDIRECTS} redirects`, async () => {
    const asked: string[] = [];
    const once: FetchOnce = async (url) => (asked.push(url), redirect(`https://recipes.test/${asked.length}`));
    await expect(linkFetcher(once)('https://recipes.test/0', init())).rejects.toThrow(/more than 5 redirects/);
    expect(asked).toHaveLength(MAX_REDIRECTS + 1);
  });

  it('gives back a redirect that says nowhere to go, and any other answer, as it is', async () => {
    const { once } = scripted({ 'https://recipes.test/': () => redirect(null), 'https://recipes.test/gone': () => new Response('', { status: 404 }) });
    expect((await linkFetcher(once)('https://recipes.test/', init())).response.status).toBe(302);
    expect((await linkFetcher(once)('https://recipes.test/gone', init())).response.status).toBe(404);
  });
});

describe('undici through the guarded pool', () => {
  it('opens no connection to a name that resolves inside', async () => {
    const once = guardedFetchOnce(fakeResolve({ 'inside.test': ['10.0.0.7'], 'mixed.test': ['93.184.216.34', '::1'] }));
    for (const host of ['inside.test', 'mixed.test']) {
      const err = await once(`http://${host}/`, init()).catch((e: unknown) => e);
      expect(isBlockedLink(err), host).toBe(true);
    }
  });
});

describe('fetchPage and downloadImage', () => {
  it('say a link to the server itself is not supported, by name or by address', async () => {
    for (const url of ['http://localhost/', 'http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', 'https://recipes.test:8443/']) {
      const err = await fetchPage(url).catch((e: unknown) => e);
      expect(err, url).toBeInstanceOf(ImportError);
      expect((err as ImportError).code, url).toBe('unsupportedLink');
    }
  });

  it('give no picture for one, without throwing', async () => {
    expect(await downloadImage('http://localhost/dish.jpg', 1024)).toBeNull();
    expect(await downloadImage('http://[::1]/dish.jpg', 1024)).toBeNull();
  });
});
