/**
 * Pricing Layer — outbound HTTP.
 *
 * Every provider call goes through `pricingFetch`, which guarantees:
 *   - a hard timeout plus propagation of a caller-supplied abort signal
 *   - bounded exponential backoff with jitter on 429 / 5xx / network errors
 *   - `Retry-After` is honoured when the upstream sends it
 *   - URLs and errors are redacted before they ever reach a log line
 */

import { getPricingConfig } from './config';
import { providerFromLabel, recordHttpRequest } from './usage';

const SENSITIVE_PARAM_PATTERN = /(key|token|secret|password|auth|signature)/i;

/**
 * Strip credentials from a URL so it is safe to log.
 *
 * Handles both query-string keys and keys embedded in the path (Alchemy puts
 * the API key in the path). Literal secrets can additionally be masked via
 * `secrets` for anything this heuristic would miss.
 */
export function redactUrl(url: string, secrets: string[] = []): string {
  let output = url;

  try {
    const parsed = new URL(url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_PARAM_PATTERN.test(name)) {
        parsed.searchParams.set(name, '***');
      }
    }
    output = parsed.toString();
  } catch {
    // Not an absolute URL — fall through to literal masking only.
  }

  for (const secret of secrets) {
    if (secret && secret.length >= 8) {
      output = output.split(secret).join('***');
    }
  }

  return output;
}

/** Mask secrets inside an arbitrary error message. */
export function redactMessage(message: string, secrets: string[] = []): string {
  let output = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) {
      output = output.split(secret).join('***');
    }
  }
  return output;
}

export interface PricingFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  /** Literal values to mask in logs and returned error strings. */
  secrets?: string[];
  /** Caller-controlled cancellation, merged with the internal timeout. */
  signal?: AbortSignal;
  /** Label used in log lines, e.g. `defillama.historical`. */
  label?: string;
}

export interface PricingFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** Total attempts made, including the first. */
  attempts: number;
  rateLimited: boolean;
  timedOut: boolean;
  latencyMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null, capMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, capMs);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), capMs);
  }
  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

/**
 * Fetch JSON with timeout, abort support and bounded retries.
 *
 * Never throws — transport failures are returned as `ok: false`. Every call is
 * recorded against the provider derived from `label` so usage accounting stays
 * accurate without each provider having to remember to report.
 */
export async function pricingFetch<T>(
  url: string,
  options: PricingFetchOptions = {},
): Promise<PricingFetchResult<T>> {
  const result = await performFetch<T>(url, options);
  recordHttpRequest(providerFromLabel(options.label), result);
  return result;
}

async function performFetch<T>(
  url: string,
  options: PricingFetchOptions,
): Promise<PricingFetchResult<T>> {
  const config = getPricingConfig();
  const timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const secrets = options.secrets ?? [];
  const safeUrl = redactUrl(url, secrets);
  const startedAt = Date.now();

  let attempts = 0;
  let lastStatus = 0;
  let lastError: string | null = null;
  let rateLimited = false;
  let timedOut = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;

    const controller = new AbortController();
    let didTimeout = false;
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    const external = options.signal;
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });

      lastStatus = response.status;

      if (response.ok) {
        const data = (await response.json()) as T;
        return {
          ok: true,
          status: response.status,
          data,
          error: null,
          attempts,
          rateLimited,
          timedOut: false,
          latencyMs: Date.now() - startedAt,
        };
      }

      if (response.status === 429) rateLimited = true;
      lastError = `HTTP ${response.status}`;

      if (!isRetryableStatus(response.status) || attempt === maxRetries) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: lastError,
          attempts,
          rateLimited,
          timedOut: false,
          latencyMs: Date.now() - startedAt,
        };
      }

      const retryAfter = parseRetryAfter(
        response.headers.get('retry-after'),
        config.retryMaxDelayMs,
      );
      await sleep(retryAfter ?? backoffDelay(attempt, config.retryBaseDelayMs, config.retryMaxDelayMs));
      continue;
    } catch (error) {
      // A caller-driven abort is final; a timeout is retryable.
      if (external?.aborted && !didTimeout) {
        return {
          ok: false,
          status: 0,
          data: null,
          error: 'aborted',
          attempts,
          rateLimited,
          timedOut: false,
          latencyMs: Date.now() - startedAt,
        };
      }

      timedOut = didTimeout;
      lastError = didTimeout
        ? `timeout after ${timeoutMs}ms`
        : redactMessage(error instanceof Error ? error.message : String(error), secrets);

      if (attempt === maxRetries) break;
      await sleep(backoffDelay(attempt, config.retryBaseDelayMs, config.retryMaxDelayMs));
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }

  if (config.verboseLogging) {
    console.warn(`[Pricing] ${options.label ?? 'fetch'} failed: ${lastError} (${safeUrl})`);
  }

  return {
    ok: false,
    status: lastStatus,
    data: null,
    error: lastError,
    attempts,
    rateLimited,
    timedOut,
    latencyMs: Date.now() - startedAt,
  };
}

function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  // Full jitter — avoids synchronized retries across concurrent batches.
  return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
}

/**
 * Split a list into chunks bounded by both item count and serialized length,
 * so batched GET requests stay under provider URL limits.
 */
export function chunkByLength(
  items: string[],
  maxItems: number,
  maxChars: number,
  separatorLength = 1,
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const item of items) {
    const projected = currentLength + item.length + (current.length > 0 ? separatorLength : 0);
    if (current.length > 0 && (current.length >= maxItems || projected > maxChars)) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(item);
    currentLength += item.length + (current.length > 1 ? separatorLength : 0);
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}
