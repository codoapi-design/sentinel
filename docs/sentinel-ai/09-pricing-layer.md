# Part 9 — Pricing Layer

> **Scope.** Provider-agnostic USD pricing for tokens, plus a historical
> backfill for transactions synced before pricing existed. Normative for how
> the app obtains prices. Complements Part 3 (Data Layer) and Part 6 (Database
> & Function Architecture); it introduces no schema changes.

---

## 1. Why this exists

A large share of historical `transactions` rows carry `value_usd = NULL` and
`price_usd = NULL`. Every downstream module that reasons about money —
Performance Intelligence (Module 01), Flow Intelligence (Module 02), ROI, and
Trading Volume — silently under-reports as a result. Unpriced rows are not a
display problem; they are a correctness problem for the whole Intelligence
Framework.

The pricing layer solves two things at once: a durable abstraction so no feature
ever talks to a price vendor directly, and a batched backfill that can repair
existing rows at a cost that scales with *days × tokens* rather than
*transactions*.

---

## 2. Architecture

```
        features / sync / backfill / intelligence
                          │
                          ▼
              ┌───────────────────────┐
              │     PriceService      │  façade — the only entry point
              │  price-service.ts     │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   PriceCache        failover chain      usage counters
   cache.ts          providers/*.ts      usage.ts
   ├ memory LRU      ├ DefiLlama
   └ blockchain_     ├ CoinGecko
     cache (Supabase)├ Alchemy
                     └ NullProvider
```

### Files

| File | Responsibility |
| --- | --- |
| `src/lib/pricing/types.ts` | `TokenRef`, `PriceQuote`, `PriceResult`, `PriceProvider`, normalization, **centralized chain mapping** |
| `src/lib/pricing/config.ts` | Env-driven runtime configuration with safe defaults |
| `src/lib/pricing/http.ts` | Timeout, abort, retry/backoff, credential redaction, batch chunking |
| `src/lib/pricing/cache.ts` | Two-tier cache (memory LRU + `blockchain_cache`) |
| `src/lib/pricing/usage.ts` | Per-provider request/latency/resolution counters |
| `src/lib/pricing/providers/defillama.ts` | Primary historical provider (batched) |
| `src/lib/pricing/providers/coingecko.ts` | Market context + fallback |
| `src/lib/pricing/providers/alchemy.ts` | Spot prices (already-provisioned key) |
| `src/lib/pricing/providers/null.ts` | Terminal no-op provider |
| `src/lib/pricing/price-service.ts` | Failover, batching, de-duplication, concurrency, stats |
| `src/lib/pricing/backfill.ts` | Transaction backfill job |
| `src/lib/pricing/index.ts` | Barrel exports |
| `src/app/api/pricing/backfill/route.ts` | `POST` backfill, `GET` usage stats |

### The contract

```ts
interface PriceProvider {
  id: string;
  isConfigured(): boolean;
  supportsHistorical: boolean;
  getSpotPrices(tokens: TokenRef[]): Promise<PriceResult>;
  getHistoricalPrices(tokens: TokenRef[], timestampSec: number): Promise<PriceResult>;
}

interface TokenRef  { chain?: string; address?: string; symbol?: string; coingeckoId?: string }
interface PriceQuote { key: string; priceUsd: number; source: PriceSource; confidence: number; asOf: number }
interface PriceResult { prices: Map<string, PriceQuote>; misses: PriceMiss[] }
```

**Rule: features must not import a vendor endpoint.** Everything goes through
`getPriceService()`. Swapping or adding a vendor must be a change inside
`providers/` and nowhere else.

### Normalized cache keys

`normalizeTokenRef` collapses a reference to one stable key:

| Input | Key |
| --- | --- |
| `{ chain: 'ethereum', address: '0xA0b8…' }` | `ethereum:0xa0b8…` (EVM lower-cased; Solana/Tron kept verbatim) |
| `{ chain: 'base', address: '0x0000…0000' }` | `coingecko:ethereum` (native → chain's coin) |
| `{ symbol: 'BTC' }` | `coingecko:bitcoin` (known-symbol table) |
| `{ symbol: 'XYZZY' }` | `symbol:XYZZY` |

Two consequences worth knowing: ETH on Base, Arbitrum and Optimism share a
single cache entry, and a batch is de-duplicated by key before any request is
made.

### Chain mapping

`CHAIN_MAP` in `types.ts` is the **single source of truth** translating the
app's network keys (`ethereum`, `base`, `arbitrum`, `optimism`, `polygon`,
`solana`, `tron`, …) into each vendor's slug — DefiLlama `avax`, CoinGecko
`optimistic-ethereum`, Alchemy `arb-mainnet`, and so on — plus each chain's
native CoinGecko id. Divergent ad-hoc mappings are the most common source of
silent mispricing; add new chains here and nowhere else. `resolveChainKey` also
accepts numeric chain ids and common aliases so stored rows normalize cleanly.

---

## 3. Providers

### DefiLlama — primary for historical

No API key, no per-key rate tier, and — the reason it leads the historical
chain — it **batches**. One request carries up to 60 coin keys:

```
GET https://coins.llama.fi/prices/current/{coins}
GET https://coins.llama.fi/prices/historical/{timestamp}/{coins}?searchWidth=6h
```

A coin key is `ethereum:0x…` for contracts or `coingecko:bitcoin` for native and
symbol fallbacks. Requests are chunked at **60 coins or ~2000 URL characters**,
whichever binds first. Confidence comes from the vendor (typically 0.99).

### CoinGecko — market context and fallback

Credentials follow the convention already in `src/lib/pricing/service.ts`:
`COINGECKO_API_KEY` (resolved via `@/lib/env`, so the `COINGECKO=` shorthand
still works) and `COINGECKO_API_TIER` selecting the demo surface
(`api.coingecko.com`, `x-cg-demo-api-key`) or Pro (`pro-api.coingecko.com`,
`x-cg-pro-api-key`).

Spot batches well: `/simple/price` at 100 ids per call and
`/simple/token_price/{platform}` at 40 contracts per call. Historical does not —
CoinGecko needs one request per token — so historical mode serves at most **25
tokens per façade call** and reports the remainder as `rate_limited` misses
rather than burning the quota. This asymmetry is precisely why DefiLlama leads
the historical chain.

### Alchemy Prices — spot only

`ALCHEMY_API_KEY` is already provisioned for RPC and transfer history, so spot
pricing here is effectively free capacity. Both surfaces are implemented —
`tokens/by-symbol` (GET) and `tokens/by-address` (POST) — at 25 items per
request. Alchemy exposes no batched historical endpoint, so `supportsHistorical`
is `false` and the historical chain skips it entirely.

The API key sits in the URL **path**, so every Alchemy call passes it to
`pricingFetch` as a secret to be masked before anything reaches a log.

### NullProvider

Terminal provider used when nothing is configured. It keeps the façade total:
callers always get a `PriceResult`, with every token carried as a `no_provider`
miss instead of a thrown error or a fabricated zero.

---

## 4. Failover

| Mode | Order |
| --- | --- |
| **Spot** | Alchemy → CoinGecko → DefiLlama |
| **Historical** | DefiLlama → CoinGecko |

Rules:

- Unconfigured providers are **skipped**, not attempted (and the skip is
  counted).
- Each provider only receives the tokens still unresolved by the previous one,
  so a fallback never re-pays for work already done.
- `PRICING_SPOT_PROVIDER` / `PRICING_HISTORICAL_PROVIDER` promote one provider
  to the front of its chain without removing the others.
- If a chain ends up empty, `NullProvider` terminates it.

---

## 5. Caching

### Tier 1 — memory

Process-local LRU with per-entry TTL, capped at 5,000 entries. Absorbs the
repeated lookups inside a single request or backfill batch.

### Tier 2 — `blockchain_cache` (Supabase)

Conforms to the existing table (`wallet_address`, `data_type`, `provider`,
`payload`, `fetched_at`, `expires_at`, `hit_count`) with no migration. Pricing
rows use:

- `data_type = 'price_cache'`, `provider = 'pricing'`
- `wallet_address = px:<namespace>:<bucket>` — a synthetic row id, where
  namespace is a chain key / `coingecko` / `symbol`, and bucket is `spot`,
  `d:YYYY-MM-DD`, or `t:<unix>`
- `payload = { v: 1, entries: { "<key>": { p, s, c, a } } }`

Sharding this way means a 500-token day is **one row and one round trip**, not
500 of each. Writes are read-modify-write so rows accumulate tokens instead of
clobbering each other. Three consecutive Supabase failures shed the tier for 60
seconds — pricing degrades to memory-only rather than stalling behind a sick
database.

### TTLs

| Data | Memory | Persistent |
| --- | --- | --- |
| Spot | 60s | 5 min |
| Historical | 1h | ~10 years (immutable) |

Historical prices never change, so re-fetching them is pure waste; they are
written once and effectively never expire. Historical timestamps are bucketed to
**UTC midnight** by default (`PRICING_BUCKET_HISTORICAL_TO_DAY`) so that every
transaction on a given day shares one cache entry per token.

**Misses are never cached.** Absence of a price is transient; caching it would
freeze a token as permanently unpriced.

---

## 6. Reliability and cost control

| Control | Default | Env var |
| --- | --- | --- |
| Hard timeout per HTTP call | 10s | `PRICING_REQUEST_TIMEOUT_MS` |
| Retries (408/429/5xx/network) | 2, exponential + full jitter | `PRICING_MAX_RETRIES` |
| Backoff base / cap | 400ms / 4s | `PRICING_RETRY_BASE_DELAY_MS`, `PRICING_RETRY_MAX_DELAY_MS` |
| Concurrent calls per provider | 4 | `PRICING_MAX_CONCURRENCY` |
| Memory cache entries | 5,000 | `PRICING_MEMORY_MAX_ENTRIES` |

`Retry-After` is honoured when the upstream sends it. Every request carries an
`AbortController`; a caller-supplied `signal` is merged with the internal
timeout, and a caller-driven abort is final (not retried).

**In-flight de-duplication.** Concurrent callers asking for the same
`(bucket, token)` share one upstream request. Measured: three concurrent
`getSpotPrices` calls over the same 7 tokens produced 12 deduped lookups and a
single set of provider requests.

**Never fabricate.** Zero is a real price and is only ever returned when a
provider reported it. Unresolved tokens surface as misses with a reason:
`invalid_ref`, `unsupported_chain`, `unsupported_operation`, `not_found`,
`provider_error`, `rate_limited`, `timeout`, `unconfigured`, `no_provider`.

**Never log credentials.** `redactUrl` strips query params matching
`key|token|secret|password|auth|signature`, and providers additionally pass
literal secrets to be masked — which covers Alchemy's path-embedded key.

---

## 7. Observability and the cost model

`getPricingStats()` returns, per provider: outbound requests (including
retries), successes, failures, retried, rate-limited, timeouts, average latency,
tokens requested, tokens resolved, resolve rate, and unconfigured skips — plus
cache hit/miss counts across both tiers, the overall hit rate, and totals for
provider requests, deduped lookups and façade calls.

`GET /api/pricing/backfill` exposes this snapshot for monitoring.

### Cost model

Billable cost is **provider requests**, not tokens priced. Three multipliers
reduce it:

1. **Batching** — DefiLlama carries up to 60 coins per request, so cost scales
   with `ceil(tokens / 60)` per timestamp instead of `tokens`.
2. **Day bucketing** — all transactions on a UTC day collapse onto one
   timestamp, so cost scales with distinct days, not transactions.
3. **Immutable caching** — the second run over the same history costs zero.

For a backfill of `N` transactions spanning `D` days and `T` distinct tokens:

```
naive       = N requests
this layer  = D × ceil(T / 60) requests   (first run)
            ≈ 0                           (subsequent runs)
```

A wallet with 500 unpriced transactions over 30 days and 8 tokens costs **30
requests instead of 500 — a ~94% reduction** — and zero on re-run. Measured on a
live call: 7 token refs (2 of which normalized onto a shared native key)
resolved in **1 DefiLlama request**, and an immediate identical call added no
requests for the tokens that had resolved.

When Alchemy is configured it absorbs spot traffic against a key the project
already pays for, leaving CoinGecko's metered quota for fallback only.

---

## 8. Backfill

### Contract

```ts
backfillTransactionPrices({
  walletId: string;
  userId: string;
  limit?: number;    // default 500, hard cap 2000
  dryRun?: boolean;  // resolve and report, write nothing
  force?: boolean;   // re-price rows that already have a value
}): Promise<BackfillReport>
```

Pipeline:

1. Verify the wallet exists and `wallets.user_id` matches — otherwise
   `BackfillAccessError`.
2. Select up to `limit` transactions for the wallet where `value_usd IS NULL OR
   price_usd IS NULL` (no filter under `force`), newest first.
3. Classify each row into a token leg (`token_address` + `token_value`), a
   native leg (`value_eth`, via the chain's native coin), or unpriceable.
4. Group by `(normalized token key, UTC day)`.
5. One `getHistoricalPrices` call per day, carrying every token for that day.
6. Compute `value_usd = amount × price_usd` and write in a bounded-concurrency
   batch (8 parallel updates).

Safety properties:

- **Idempotent** — only null columns are written; re-running is a no-op once
  complete.
- **Resumable** — progress is the database state itself; interruption is safe.
- **Non-destructive** — the `UPDATE` carries an `IS NULL` guard, so a concurrent
  writer is never clobbered. `force` is required to overwrite.
- **Honest** — an unpriceable token stays `NULL` and is counted in
  `stillUnpriced`. It is never written as zero.

### Report shape

```ts
{
  walletId, dryRun, force,
  scanned,        // rows read
  priceable,      // rows with a token + amount we could attempt
  skipped,        // approvals, zero-value calls, …
  groups,         // distinct (token, day) pairs
  dayBuckets,     // distinct UTC days = historical round trips
  priced,         // rows a price was resolved for
  updated,        // rows written (0 for a dry run)
  stillUnpriced,
  providerCalls, providerCallsByProvider,
  cacheHits, cacheLookups, cacheHitRate,
  missReasons,    // reason → transaction count
  sampleMisses,   // top 20 unpriced tokens with reason + detail
  durationMs,
  errors
}
```

### API route

`POST /api/pricing/backfill` — authenticated via `createCookieServerClient()`,
wallet ownership verified against `wallets.user_id`, `limit` clamped to 2000,
`maxDuration = 60`. Responds `{ success: true, data: <report> }` or
`{ error }` with 400 / 401 / 404 / 500 following existing route conventions.

```bash
curl -X POST /api/pricing/backfill \
  -H 'content-type: application/json' \
  -d '{"walletId":"…","limit":500,"dryRun":true}'
```

Call repeatedly until `scanned` returns 0.

`GET /api/pricing/backfill` — authenticated; returns the limits and the pricing
usage snapshot.

---

## 9. Environment variables

**Existing, read but never printed:**

| Var | Used by |
| --- | --- |
| `COINGECKO_API_KEY` | CoinGecko provider (via `@/lib/env`; `COINGECKO=` shorthand supported) |
| `COINGECKO_API_TIER` | `demo` (default) or `pro` — selects base URL and auth header |
| `ALCHEMY_API_KEY` | Alchemy Prices provider |

DefiLlama needs no credentials, which is why the layer degrades gracefully to a
working historical path even with nothing configured.

**New, all optional:**

| Var | Default | Purpose |
| --- | --- | --- |
| `PRICING_HISTORICAL_PROVIDER` | — | Promote a provider to the front of the historical chain |
| `PRICING_SPOT_PROVIDER` | — | Promote a provider to the front of the spot chain |
| `PRICING_MAX_CONCURRENCY` | `4` | Concurrent in-flight calls per provider |
| `PRICING_REQUEST_TIMEOUT_MS` | `10000` | Hard timeout per HTTP call |
| `PRICING_MAX_RETRIES` | `2` | Retries on 408/429/5xx/network |
| `PRICING_RETRY_BASE_DELAY_MS` | `400` | Backoff base |
| `PRICING_RETRY_MAX_DELAY_MS` | `4000` | Backoff cap (also caps `Retry-After`) |
| `PRICING_SPOT_MEMORY_TTL_MS` | `60000` | Spot memory TTL |
| `PRICING_SPOT_PERSISTENT_TTL_MS` | `300000` | Spot persistent TTL |
| `PRICING_HISTORICAL_MEMORY_TTL_MS` | `3600000` | Historical memory TTL |
| `PRICING_MEMORY_MAX_ENTRIES` | `5000` | LRU capacity |
| `PRICING_BUCKET_HISTORICAL_TO_DAY` | `true` | Round historical timestamps to UTC midnight |
| `PRICING_PERSISTENT_CACHE` | `true` | Enable the Supabase cache tier |
| `PRICING_VERBOSE` | `false` | One-line usage summary per façade call |

---

## 10. Integration status

**Deliberately not wired yet.** The sync path
(`src/lib/blockchain/provider-manager.ts`) prices transactions through the
legacy `PricingService.enrichTransactions` at five call sites, and
`src/lib/finance/portfolio-history.ts` depends on its market-chart helpers.
Replacing those is not a small, safe change, and destabilizing the sync engine
would cost more than the pricing improvement is worth. Both layers coexist
without conflict.

Integration points, in the order they should be taken:

1. **Spot prices during sync** — `provider-manager.ts` calls
   `pricing.getCurrentTokenPricesUsd(chainId, addresses)` (three sites) and
   `pricing.getCurrentNativePriceUsd(chainId)` (three sites). Both map directly
   onto `getPriceService().getSpotPrices()` with
   `{ chain: chainKeyFromId(chainId), address }` refs. This buys Alchemy-first
   spot pricing and cross-request caching.
2. **Transaction enrichment** — `enrichTransactions` currently issues one
   CoinGecko request per token per transaction. Rewriting it to group by
   `(token, day)` and call `getHistoricalPrices` once per group is the single
   largest cost reduction available, and reuses the grouping logic already
   proven in `backfill.ts`.
3. **Portfolio history** — needs a series endpoint (`getPriceSeries`) that the
   layer does not yet expose; leave on the legacy service until then.

New code should use `@/lib/pricing` from the start.
