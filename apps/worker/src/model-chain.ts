// The Gemini models to try, in order: the configured one, then the fallbacks.
// A model that was just busy goes to the back of the line for a few minutes; a retired one is dropped.

export const BUSY_COOLDOWN_MS = 5 * 60_000;

export class ModelChain {
  private models: string[];
  private readonly busyUntil = new Map<string, number>();

  constructor(
    models: readonly string[],
    private readonly now: () => number = Date.now,
    private readonly cooldownMs: number = BUSY_COOLDOWN_MS,
  ) {
    this.models = [...new Set(models.map((m) => m.trim()).filter((m) => m !== ''))];
  }

  /** Every model still in the chain, in configured order. */
  get all(): readonly string[] {
    return this.models;
  }

  /** Models to try for one request: rested ones in configured order, then the ones cooling down. */
  order(): string[] {
    const t = this.now();
    const cooling = (m: string): boolean => (this.busyUntil.get(m) ?? 0) > t;
    return [...this.models.filter((m) => !cooling(m)), ...this.models.filter(cooling)];
  }

  markBusy(model: string): void {
    this.busyUntil.set(model, this.now() + this.cooldownMs);
  }

  markHealthy(model: string): void {
    this.busyUntil.delete(model);
  }

  /** For a model Gemini no longer serves. */
  drop(model: string): void {
    this.models = this.models.filter((m) => m !== model);
    this.busyUntil.delete(model);
  }
}
