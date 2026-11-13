// "Still alive": a GET to a dead-man's-switch URL (healthchecks.io) about once a minute while the worker
// can reach the queue. When the pings stop (crash loop, bad key, VPS down), the service emails you.
import type { Logger } from './log';

const EVERY_MS = 60_000;
const TIMEOUT_MS = 10_000;

export class Heartbeat {
  private last = 0;

  constructor(
    private readonly url: string | null,
    private readonly log: Logger,
  ) {}

  /** Call after each successful claim; sends at most one ping a minute, never throws. */
  beat(now = Date.now()): void {
    if (!this.url || now - this.last < EVERY_MS) return;
    this.last = now;
    fetch(this.url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch((err: unknown) => this.log.warn('heartbeat_failed', { err }));
  }
}
