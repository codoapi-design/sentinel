/**
 * Pricing Layer — cost and usage accounting.
 *
 * Counters are process-local and monotonic since the last reset. They exist to
 * answer two commercial questions: how many billable upstream requests a
 * feature costs, and how much of that the cache is absorbing. Subscription cost
 * modeling reads these through `getPricingStats()`.
 */

export interface ProviderUsage {
  provider: string;
  /** Outbound HTTP requests, including retries. */
  requests: number;
  successes: number;
  failures: number;
  /** Requests that needed at least one retry. */
  retried: number;
  rateLimited: number;
  timeouts: number;
  latencyMsTotal: number;
  /** Tokens handed to the provider across all façade calls. */
  tokensRequested: number;
  /** Tokens the provider actually priced. */
  tokensResolved: number;
  /** Times the provider was skipped because it had no credentials. */
  skippedUnconfigured: number;
}

function emptyUsage(provider: string): ProviderUsage {
  return {
    provider,
    requests: 0,
    successes: 0,
    failures: 0,
    retried: 0,
    rateLimited: 0,
    timeouts: 0,
    latencyMsTotal: 0,
    tokensRequested: 0,
    tokensResolved: 0,
    skippedUnconfigured: 0,
  };
}

const usage = new Map<string, ProviderUsage>();
let startedAt = Date.now();

function bucketFor(provider: string): ProviderUsage {
  const existing = usage.get(provider);
  if (existing) return existing;
  const created = emptyUsage(provider);
  usage.set(provider, created);
  return created;
}

/** `defillama.historical` → `defillama`. */
export function providerFromLabel(label: string | undefined): string {
  if (!label) return 'unknown';
  const dot = label.indexOf('.');
  return dot === -1 ? label : label.slice(0, dot);
}

export function recordHttpRequest(
  provider: string,
  result: {
    ok: boolean;
    attempts: number;
    rateLimited: boolean;
    timedOut: boolean;
    latencyMs: number;
  },
): void {
  const bucket = bucketFor(provider);
  bucket.requests += result.attempts;
  if (result.ok) bucket.successes++;
  else bucket.failures++;
  if (result.attempts > 1) bucket.retried++;
  if (result.rateLimited) bucket.rateLimited++;
  if (result.timedOut) bucket.timeouts++;
  bucket.latencyMsTotal += result.latencyMs;
}

export function recordResolution(
  provider: string,
  tokensRequested: number,
  tokensResolved: number,
): void {
  const bucket = bucketFor(provider);
  bucket.tokensRequested += tokensRequested;
  bucket.tokensResolved += tokensResolved;
}

export function recordSkip(provider: string): void {
  bucketFor(provider).skippedUnconfigured++;
}

export interface ProviderUsageSnapshot extends ProviderUsage {
  avgLatencyMs: number;
  /** Share of requested tokens the provider priced, 0..1. */
  resolveRate: number;
}

export function getUsageSnapshot(): Record<string, ProviderUsageSnapshot> {
  const out: Record<string, ProviderUsageSnapshot> = {};
  for (const [provider, bucket] of usage) {
    out[provider] = {
      ...bucket,
      avgLatencyMs:
        bucket.requests === 0 ? 0 : Math.round(bucket.latencyMsTotal / bucket.requests),
      resolveRate:
        bucket.tokensRequested === 0 ? 0 : bucket.tokensResolved / bucket.tokensRequested,
    };
  }
  return out;
}

export function getUsageStartedAt(): number {
  return startedAt;
}

export function resetUsage(): void {
  usage.clear();
  startedAt = Date.now();
}
