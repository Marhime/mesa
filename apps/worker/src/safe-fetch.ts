// Fetching what a shared link points at (a recipe page, its pictures) without letting it reach inside the
// server's own network. Every address a name resolves to is checked when the connection opens, so a name
// can't point inside nor change its answer after a check; redirects are followed here, one hop at a time,
// each checked again (at most 5); only http and https, on their default ports. undici's own fetch, with its
// own connection pool: the pool's lookup is where the check lives (an address in the link itself skips any
// lookup, so it is checked before each request).
import { lookup as systemLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

/** Addresses no shared link may reach: this machine, private and shared networks, what isn't routable. */
const BLOCKED = new BlockList();
const IPV4_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network", and the unspecified address
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local: cloud metadata lives here
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and the broadcast address
];
const IPV6_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // unspecified, loopback (::1) and the old IPv4-compatible form
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];
for (const [net, prefix] of IPV4_BLOCKED) BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of IPV6_BLOCKED) BLOCKED.addSubnet(net, prefix, 'ipv6');

/** True for an address no link may reach. An IPv4-mapped IPv6 address (::ffff:10.0.0.1) is its IPv4 one. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  // Not an address at all: nothing that can be checked, so nothing to connect to.
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** A link (or one of its redirects) that points where the worker must not go. */
export class BlockedLinkError extends Error {
  constructor(readonly reason: string) {
    super(`blocked link: ${reason}`);
    this.name = 'BlockedLinkError';
  }
}

/** The blocked link behind a failure, however deep fetch wrapped it ("fetch failed" → cause → …). */
export function isBlockedLink(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 6 && e instanceof Error; depth++, e = e.cause) {
    if (e instanceof BlockedLinkError) return true;
  }
  return false;
}

/** dns.lookup asking for every address (a fake in tests). */
export type ResolveAll = (
  hostname: string,
  options: Omit<LookupOptions, 'all'>,
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const resolveAll: ResolveAll = (hostname, options, callback) => systemLookup(hostname, { ...options, all: true }, callback);

/**
 * The lookup the connections use: the name's addresses, refused when any one of them is blocked (a name
 * with one public and one private address is not trusted with either). net.connect asks for one address,
 * or for all of them when it races IPv4 and IPv6.
 */
export function guardedLookup(resolve: ResolveAll = resolveAll): LookupFunction {
  return (hostname, options, callback) => {
    const { all, ...rest } = options;
    resolve(hostname, rest, (err, addresses) => {
      if (err) return callback(err, all ? [] : '');
      const blocked = addresses.find((a) => isBlockedAddress(a.address));
      if (blocked || addresses.length === 0) {
        return callback(new BlockedLinkError(`${hostname} is ${blocked?.address ?? 'no address'}`), all ? [] : '');
      }
      if (all) callback(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

/** Throws BlockedLinkError for a URL no request may go to: another scheme, another port, a blocked address. */
export function checkLink(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedLinkError(`scheme ${url.protocol}`);
  // URL drops a default port (":443" on https): any port left is another one.
  if (url.port !== '') throw new BlockedLinkError(`port ${url.port}`);
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0 && isBlockedAddress(host)) throw new BlockedLinkError(`address ${host}`);
}

export interface LinkRequest {
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface LinkResponse {
  response: Response;
  /** Where the last redirect led (the link itself when there was none). */
  url: string;
}

/** One request, redirects not followed. */
export type FetchOnce = (url: string, init: LinkRequest) => Promise<Response>;

/** A GET that follows redirects safely (every hop checked). */
export type FetchLink = (url: string, init: LinkRequest) => Promise<LinkResponse>;

export const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** undici's fetch through a pool whose connections only open to checked addresses. */
export function guardedFetchOnce(resolve?: ResolveAll): FetchOnce {
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(resolve) } });
  // undici's Response is the one Node's global fetch returns (same library), typed apart.
  return (url, init) => undiciFetch(url, { ...init, redirect: 'manual', dispatcher }) as unknown as Promise<Response>;
}

/** Follows up to MAX_REDIRECTS redirects by hand, checking each hop before it is requested. */
export function linkFetcher(once: FetchOnce = guardedFetchOnce()): FetchLink {
  return async (link, init) => {
    let url = new URL(link);
    for (let hop = 0; ; hop++) {
      checkLink(url);
      const response = await once(url.toString(), init);
      const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get('location') : null;
      if (location === null) return { response, url: url.toString() };
      await response.body?.cancel().catch(() => undefined);
      if (hop >= MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects`);
      url = new URL(location, url);
    }
  };
}

let shared: FetchLink | null = null;

/** The worker's one guarded fetch (its pool is made on first use). */
export const fetchLink: FetchLink = (url, init) => (shared ??= linkFetcher())(url, init);
