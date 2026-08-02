# Radareum Package 3 — Implementation & Compatibility Plan

**Status:** Implementation delivered — see `docs/ai-package-3-implementation-audit.md` (verdict: Partial).  
**Date:** 2026-08-02  
**Depends on:** Package 1 Complete · Package 2 Complete (reasoning layer + quality gates)  
**Supersedes for persistence:** `docs/ai-package-2-persistence-decision.md` Option B → **Option A now required**

---

## 1. Executive summary

Packages 1–2 make Radareum authoritative and selective **within a single request**. Package 3 adds **persistent intelligence memory** so the product can answer temporal and continuity questions without treating memory as current financial truth.

```text
Authenticated request
→ Package 1 grounding (current wallet data)
→ Package 2 reasoning (current approved insights)
→ Package 3 memory retrieval (historical, bounded, labeled)
→ Historical comparison + lifecycle resolution
→ Persist analysis / lifecycle / timeline (when policy says so)
→ Memory-aware narrative (current primary; historical labeled)
→ Package 1 numeric validation (current + historical namespaces)
→ UI
```

**Non-negotiable:** Current wallet data remains authoritative. Memory cannot override grounding, entitlements, ownership, tool permissions, or evidence. Preferences affect presentation only. No Telegram AI, alerts, or Package 4 in this package. No vector DB as a substitute for relational memory.

---

## 2. Repository inspection findings (as-is)

### 2.1 Package 1 / 2 contracts and versions (reuse)

| Area | Location | Notes |
| --- | --- | --- |
| Scope / domains / evidence / narrative / traces | `src/lib/ai/trust/*` | `PIPELINE_VERSION` / `RESPONSE_SCHEMA_VERSION` / `STRUCTURED_NARRATIVE_SCHEMA_VERSION` = `2.0.0` |
| Reasoned package | `src/lib/ai/intelligence-quality/types.ts` | `REASONED_INTELLIGENCE_SCHEMA_VERSION` = `1.0.0`; `WhatMattersSummary`, attribution, monitoring, diagnostics |
| Reasoning versions | `intelligence-quality/config.ts` `MODEL_VERSIONS` | Must be snapshotted into persisted analyses |
| Orchestration | `intelligence-quality/run.ts` → `tools/index.ts` | Persist **after** successful Package 2 package; before/with narrative |
| Jobs | `ai_analysis_jobs` + `src/lib/ai/jobs/*` | `result_ref` holds aggregates today — **not** full reasoned history |
| Traces / idempotency | `ai_request_traces`, `ai_idempotency_keys` | Extend timings JSON with memory fields; no full message bodies |
| Numeric validation | `trust/numeric-validator.ts` | Must gain **temporal namespaces** (current vs historical) |
| Prompt assembly | `llm/prompts.ts`, `llm/index.ts` | Already has Package 2 selected-insight constraints; add memory boundaries |
| Analysis level | Wallet-only AI context (`loadWalletContext`) | Persist `analysis_level = wallet`; do not invent `user_portfolio` |

### 2.2 Supabase schema — reusable vs missing

| Existing | Reuse for P3 |
| --- | --- |
| `auth.users` / `user_profiles` | Owner FK; profile has plan/status/name/avatar — **no AI preference columns** |
| `wallets` (+ RLS, `ON DELETE CASCADE` children for txs/lots/etc.) | Wallet-scoped memory parent; delete wallet cascades financial children |
| `ai_request_traces`, `ai_idempotency_keys` | Observability / replay; link `conversation_id` / `analysis_id` in timings or nullable columns |
| `ai_analysis_jobs` | Async completion → persist reasoned result when job finishes |
| `ai_usage` | Quota only — not conversation memory |
| `portfolio_snapshots`, holdings, txs | **Current data sources** — never replaced by memory |
| Telegram connect routes + in-memory `telegramUserMap` | Account-linking foundation only; **no Telegram AI in P3** |

**Missing (must add):**

```text
ai_conversations
ai_conversation_messages
ai_conversation_summaries
ai_user_preferences
ai_reasoned_analysis_results
ai_insight_snapshots
ai_insight_lifecycles
ai_monitoring_point_states
ai_intelligence_timeline_events
```

Optional supporting columns/tables:

- `ai_reasoned_analysis_results.fingerprint` + unique partial index for reuse  
- `ai_reasoned_analysis_results.job_id` FK → `ai_analysis_jobs` (nullable)  
- Soft-delete / `status` on conversations; hard-delete RPC for privacy  
- Export staging via existing API patterns (no dedicated export table required in v1)

### 2.3 Chat UI / client history (critical gap)

| Finding | Evidence |
| --- | --- |
| Client owns the thread | `src/components/ai-chat.tsx`: React state only; comment: “runtime is stateless — the client owns the thread” |
| History replay | Last `MAX_HISTORY_MESSAGES = 10` sent each turn |
| Server trusts client history today | `chatRequestSchema` accepts `history[]`; server does not load DB history |
| No persistence | Refresh / new login loses conversation |
| Clear = local only | Trash clears React state |

**Migration:** Additive. Client may send `conversationId` + current message; server loads authoritative history. Temporary: accept client `history` only when `conversationId` absent **and** mark as `source=client_untrusted` (never as verified assistant history for persistence of forged assistant roles).

### 2.4 Preferences today

| Store | Scope |
| --- | --- |
| `ui-preferences-store` (zustand persist) | `showSpamAndDust` only — local, not AI prefs |
| `user_profiles` API | `full_name`, avatar, plan display — no language/currency/depth |
| Locale | Next-intl / request locale — not durable AI preference rows |

P3 introduces **server `ai_user_preferences`** for explicit AI presentation prefs; UI store remains for non-AI display toggles.

### 2.5 Auth, RLS, deletion

| Flow | Behavior | P3 implication |
| --- | --- | --- |
| Wallet DELETE `/api/wallets` | Deletes wallet row with `user_id` filter; DB cascades financial children | New AI tables must `ON DELETE CASCADE` from `wallets` **or** explicit delete RPC matching product choice |
| Account delete | No dedicated first-class “delete account + AI memory” API found | P3 must add **AI history deletion/export** endpoints; document account-delete hook when product adds full account wipe |
| RLS pattern (P1) | Users SELECT own rows; service role writes traces/jobs | Same pattern for analyses/lifecycle/timeline/summaries |
| Client forge risk | Clients must not INSERT assistant messages / analyses / lifecycle | RLS: messages INSERT only `role=user` for authenticated; assistant/system_event service-only |

### 2.6 Reports / jobs / Telegram

| Area | Finding |
| --- | --- |
| Reports | `src/lib/export/ai-analysis-report.ts` embeds live analysis into PDF/Excel — not durable history |
| Jobs | Persist reasoned package on job completion into `ai_reasoned_analysis_results` |
| Telegram | Connect + in-memory map; webhook alerts exist; **out of scope for P3 AI chat** — schema `channel` includes `telegram` for future use only |

### 2.7 Tracing / idempotency

Reuse `AiRequestTracer`, `claimIdempotencyKey`, `buildRequestHash`. Extend:

- Request hash inputs to include `conversationId` when present  
- Idempotent chat must not double-persist messages or double-increment lifecycle  
- Analysis fingerprint separate from HTTP idempotency key  

---

## 3. Target architecture

```text
Current Request
      │
      ▼
Auth + Scope + Entitlements (P1)
      │
      ├──────────────────────────────┐
      ▼                              ▼
Current wallet intelligence     MemoryRetrievalPlan
(P1 engines + P2 reasoning)            │
      │                     ┌──────────┼───────────┐
      │                     ▼          ▼           ▼
      │              Conversation  Preferences  Prior analyses
      │                                            │
      │                                            ▼
      │                                     Lifecycle records
      └──────────────────┬─────────────────────────┘
                         ▼
              Historical comparison (compatible only)
                         ▼
              Lifecycle resolution + monitoring states
                         ▼
              Persist (policy) + timeline events
                         ▼
         Memory-aware structured narrative + UI
```

Module root (adapt names to repo conventions, keep separation):

```text
src/lib/ai/memory/
├── types.ts
├── config.ts
├── conversations/
├── preferences/
├── analyses/
├── lifecycle/
├── timeline/
├── retrieval/
├── privacy/
├── observability.ts
└── index.ts
```

---

## 4. New database schema (proposed)

Migration name (suggested): `supabase/migrations/20260802001000_add_ai_memory_package3.sql`  
(Also keep a non-dated alias only if repo convention still duplicates — prefer single dated migration going forward.)

### 4.1 Tables (summary)

| Table | PK | Key FKs | Unique | Notes |
| --- | --- | --- | --- | --- |
| `ai_conversations` | uuid | `user_id` → auth.users | — | `wallet_id` nullable; `channel` web\|telegram\|system; `status` active\|archived\|deleted |
| `ai_conversation_messages` | uuid | `conversation_id` CASCADE; `user_id` | — | `role` check; `related_analysis_id` nullable; `trace_id` |
| `ai_conversation_summaries` | uuid | `conversation_id` CASCADE | `(conversation_id, summary_version, covered_until_message_id)` soft | Structured JSONB `summary` schema-validated in app |
| `ai_user_preferences` | uuid | `user_id` CASCADE | `(user_id, key) WHERE active` | `source`, `confidence`, timestamps, `expires_at` |
| `ai_reasoned_analysis_results` | uuid | `user_id`; `wallet_id` CASCADE | `(user_id, fingerprint)` where not null | Compact JSONB for whatMatters/attribution; versions; data_as_of; completion_status |
| `ai_insight_snapshots` | uuid | `analysis_id` CASCADE | `(analysis_id, finding_id)` | `lifecycle_key`; scores; observed_values JSONB |
| `ai_insight_lifecycles` | uuid | `user_id`; `wallet_id` CASCADE | **`(user_id, wallet_id, lifecycle_key)`** | State machine; occurrence counts; change JSONB |
| `ai_monitoring_point_states` | uuid | `wallet_id` CASCADE; optional lifecycle/analysis | `(wallet_id, monitoring_key)` | States: active\|triggered\|improved\|resolved\|expired\|superseded |
| `ai_intelligence_timeline_events` | uuid | `user_id`; `wallet_id` CASCADE | Dedup key optional `(wallet_id, analysis_id, event_type, lifecycle_key)` | Meaningful events only |

### 4.2 Indexes (minimum)

- Conversations: `(user_id, updated_at DESC)`, `(user_id, status)`  
- Messages: `(conversation_id, created_at ASC)`  
- Analyses: `(wallet_id, created_at DESC)`, `(user_id, created_at DESC)`, `(fingerprint)`  
- Lifecycles: unique above + `(wallet_id, state, last_detected_at DESC)`  
- Timeline: `(wallet_id, occurred_at DESC)`  
- Preferences: unique active key  

### 4.3 RLS strategy

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| conversations | owner | owner (web channel) | owner (title/status) | owner soft/hard |
| messages | owner | owner **only role=user** | none | via conversation delete / service |
| summaries | owner | **service only** | service only | cascade |
| preferences | owner | owner (explicit sources only) | owner | owner |
| analyses / snapshots / lifecycle / monitoring / timeline | owner | **service only** | **service only** | service / cascade on wallet |

Service role (Next server `createServerClient`) performs persistence, lifecycle, summary, timeline writes.

**Live RLS tests:** two users × two wallets (extend `scripts/package1-rls-live.mjs` or add `scripts/package3-rls-live.mjs`).

### 4.4 Retention & deletion cascade

| Object | Default retention | On conversation delete | On wallet delete | On account AI wipe |
| --- | --- | --- | --- | --- |
| Messages / summaries | With conversation | CASCADE | Conversation may remain without wallet or null wallet_id | CASCADE user rows |
| Analyses / snapshots | Product: keep while wallet connected + optional grace | Unlink `conversation_id` SET NULL | **CASCADE** (default P3) | CASCADE |
| Lifecycles / monitoring / timeline | With wallet | — | **CASCADE** | CASCADE |
| Preferences | Until user reset/delete | — | — | CASCADE |

**Product default for P3:** Wallet delete → cascade AI wallet history (analyses, lifecycle, timeline, monitoring). Conversations with that `wallet_id` → set `wallet_id` NULL or delete if policy prefers; recommended: **delete conversations scoped to that wallet** via explicit RPC for honesty.

Export: `GET /api/ai/export` JSON of conversations + analyses metadata (no secrets, no raw txs).

### 4.5 Rollback

Single migration reversible via:

```sql
DROP TABLE IF EXISTS ... CASCADE; -- reverse dependency order
```

Document in migration header. No data backfill required for greenfield tables.

---

## 5. Persistence format (analyses)

Persist a **compact** `PersistedReasonedAnalysis`:

**Include:** scope, completionStatus, whatMatters, approved insight snapshots (selected + optionally diagnostics-eligible for lifecycle “still present”), monitoring points, attribution summary, domainStatuses, limitations, versions (P1 + P2 + memoryModel), dataAsOf timestamps, traceId, fingerprint, optional conversationId / parentAnalysisId / jobId.

**Exclude:** raw transactions, full engine envelopes, full prompts, secrets, auth tokens, unfiltered candidate dumps (store only IDs/types needed for “not selected but present” via `diagnostics` or `eligibleFindingTypes[]` compact list).

**Fingerprint inputs:** `userId|walletId|analysisType|analysisLevel|scopeHash|dataFingerprint|engineVersions|reasoningVersions`.

`shouldPersistAnalysis(...)` defaults:

| Persist | Skip |
| --- | --- |
| Dashboard / report / completed async job | Pure factual chat (“how much is SOL”) with no new approved insights |
| Chat that produces material new/changed approved insights | Failed / aborted |
| Explicit “save analysis” (future UI flag) | Identical fingerprint reuse |

Idempotent HTTP replay → reuse analysis id; **no** lifecycle double-count.

---

## 6. Lifecycle identity strategy

```ts
buildLifecycleKey({
  walletId,
  analysisLevel, // 'wallet' only in P3
  findingType,
  entityType,    // asset | network | counterparty | portfolio | behavior
  entityId,      // symbol/address/id normalized
  scopeClass,    // e.g. 'period_performance' | 'allocation_state' | 'flow_pattern'
}): string
```

Example:

```text
wallet:<uuid>:level:wallet:asset:SOL:type:high_asset_dependency:scope:allocation_state
```

**Rules:**

- Stable across analysis IDs and narrative wording  
- Must not merge different assets/networks/counterparties/levels  
- Incomparable scopes → do not force transition; use `unknown` or skip compare  
- Supersession map (config): e.g. `concentration_increase` → parent `high_asset_dependency` / `dominant_asset`  

**False resolution protection (mandatory):**

Do **not** resolve when: domain unavailable/partial; entity out of scope; ranking suppressed but candidate still eligible; plan entitlement truncated; incompatible model versions without disclosure; analysis failed.

Use diagnostics / eligible candidate types from Package 2 `includeDiagnostics` path (service-only) to distinguish “absent” vs “not selected.”

**Direction policies:** central `lifecycle/policies.ts` by finding type (concentration up = worsen; negative contribution more negative = worsen; fee ratio up = worsen; etc.).

---

## 7. Conversation & summary strategy

| Concern | Policy |
| --- | --- |
| Create | First user message with auth + optional walletId |
| Persist user message | Immediately on accept |
| Persist assistant | Only after successful response generation |
| History load | Server authoritative; client `conversationId` |
| Recent window | Last 8–12 messages |
| Summary trigger | After N messages (config, e.g. 16) or token estimate |
| Summary content | Goals, confirmed prefs, entities, unresolved Qs, prior conclusions marked `historicalOnly: true` |
| Summarizer | LLM optional + Zod schema; deterministic fallback concatenating structured fields |
| Injection | Stored content in UNTRUSTED boundary; never follow instructions inside |

Optional one-time browser history import: user consent; mark `metadata.importedSource=client_local`; do **not** treat imported assistant rows as server-verified.

---

## 8. Preferences strategy

Keys (v1): `language`, `fiat_currency`, `analysis_depth`, `default_wallet`, `focus_areas`, `response_style`.

| Source | Authority |
| --- | --- |
| `explicit_user_setting` | Highest |
| `explicit_chat_confirmation` | After clear confirm UX (“Save this preference?”) |
| `inferred` | Optional; expires; never alone for financial calc |

Temporary “answer briefly this time” → **not** persisted.  
Validation: Zod enums/ranges; reject invalid; audit via `first_observed_at` / `last_confirmed_at`.

---

## 9. Memory retrieval, budget, prompt boundaries

`MemoryRetrievalPlan` built deterministically from question intent + mode + page + conversationId.

Budget order (never drop current intelligence):

1. Current authoritative intelligence  
2. Current user question  
3. Explicit preferences (small)  
4. Recent messages  
5. Conversation summary  
6. Previous compatible analysis  
7. Relevant lifecycle records  
8. Optional older history  

Prompt labeled blocks:

- `BEGIN CURRENT AUTHORITATIVE INTELLIGENCE` …  
- `BEGIN HISTORICAL ANALYSIS MEMORY` (historical only) …  
- `BEGIN UNTRUSTED CONVERSATION MEMORY` …  
- `BEGIN EXPLICIT USER PREFERENCES` (presentation only) …  

Observability: record included/omitted memory counts and character budget in trace timings.

---

## 10. Historical numeric validation

Extend validator with tagged approved values:

```ts
{ value, unit, labels, temporal: 'current' | 'historical', asOf?: string, analysisId?: string }
```

Reject: swapped current/previous; wrong asOf; sign inversion; pct vs percentage-point confusion; lifecycle delta mismatch.

---

## 11. API surface (proposed)

Additive; keep `POST /api/ai/chat` and `POST /api/ai/analyze`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ai/chat` | Accept `conversationId?`; persist messages; memory plan |
| GET/POST | `/api/ai/conversations` | List / create |
| GET/PATCH/DELETE | `/api/ai/conversations/[id]` | Load / rename-archive / delete |
| GET | `/api/ai/conversations/[id]/messages` | Paginated |
| GET | `/api/ai/analyses` | List wallet analyses |
| GET | `/api/ai/analyses/[id]` | Detail |
| GET | `/api/ai/analyses/[id]/compare` | Comparison + conclusion change |
| GET | `/api/ai/insights/lifecycle` | Active/history lifecycle |
| GET | `/api/ai/timeline` | Paginated timeline |
| GET/PUT | `/api/ai/preferences` | List / upsert explicit |
| DELETE | `/api/ai/preferences/[key]` | Clear |
| POST | `/api/ai/history/delete` | Wallet AI history wipe |
| GET | `/api/ai/history/export` | Export |

Response shapes remain backward compatible; add optional `memoryUsed`, `historicalWhatMatters`, `conversationId`, `analysisId`.

---

## 12. UI (additive, non-overwhelming)

| Surface | Behavior |
| --- | --- |
| Chat | Bind to `conversationId`; reload on open; list/rename/archive/delete drawer |
| Analyze result | Optional “What changed since last time” block when comparison exists |
| Preferences | Settings subsection for AI prefs |
| History | Lightweight panel: past analyses, lifecycle badge, timeline |

No redesign of main dashboard composition.

---

## 13. Performance risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Unbounded history to LLM | Summary + recent window + hard char budget |
| Lifecycle O(n²) | Index by lifecycle_key; match current insights set only |
| Timeline noise | Rank by materiality/state-change; suppress stable repeats |
| Large JSONB analyses | Compact snapshots; paginate list APIs |
| Summary every message | Threshold scheduler; incremental covered_until |
| Concurrent analyses | Upsert lifecycle unique key; transactional RPC; fingerprint reuse |
| 1k messages / 10k timeline | Cursor pagination; covering indexes |

Perf fixtures/tests per Package 3 §45.

---

## 14. Backward compatibility

| Preserve | Migration tactic |
| --- | --- |
| `/api/ai/chat`, `/api/ai/analyze` | Additive fields |
| `narrative`, `insights`, `reasonedIntelligence` | Unchanged contracts |
| P1 numeric gate + P2 ranking/benchmark | Regression mandatory |
| Client history during rollout | Accepted only when no conversationId; not authoritative |
| Trace / idempotency | Extended, not replaced |
| Unauthenticated error shape | Unchanged |

---

## 15. Test strategy

| Layer | Location / focus |
| --- | --- |
| Fixtures | `tests/fixtures/ai-memory/v1/` — conversation, prefs, analyses, lifecycle, timeline |
| Unit | Lifecycle keys/transitions; fingerprint; planner; budget; summary schema; prefs validation; historical numerics |
| Integration | Tests A–L from Package 3 §41 |
| HTTP | Isolation, forge rejection, follow-up server history, compare, prefs |
| Live RLS | Two-user script |
| E2E | Conversation refresh; historical intelligence fixture A→B; prefs; delete |
| Regression | `npx vitest run` (P1+P2); Package 2 `runBenchmark` gates; `tsc`; lint; `npm run build`; Playwright |

---

## 16. Execution order (locked)

Matches Package 3 §49:

1. Plan acceptance (this doc)  
2. Contracts + `memory` versions in `config.ts`  
3. Migrations + RLS  
4. Conversations → messages → summaries  
5. Explicit preferences  
6. Analysis persistence + fingerprint + `shouldPersistAnalysis`  
7. Lifecycle identity → transitions → direction policies → resolution safety  
8. Comparison + conclusion-change + Historical What Matters  
9. Monitoring lifecycle + timeline  
10. Retrieval planner + budget + prompt boundaries  
11. Historical numeric validation  
12. Chat + Analyze integration  
13. UI + privacy delete/export  
14. Observability  
15. Full test pyramid + P1/P2 regression + production build  
16. Final audit — **do not start Package 4**

---

## 17. Acceptance gate (Complete vs Partial)

Mark **Complete** only when §50 criteria pass, including:

- Server-side cross-session chat  
- Persisted analyses + deterministic lifecycle (no false resolution)  
- Historical numeric validation  
- Bounded memory retrieval + prompt boundaries  
- Live RLS two-user isolation  
- Real deletion  
- P1 green + P2 benchmark gates green + build green  

Otherwise mark **Partial** with an explicit remaining-gap list.

---

## 18. Out of scope (explicit)

- Telegram AI chat  
- Autonomous alerts / scheduled briefs / push  
- Vector embeddings (unless a later measured retrieval gap appears)  
- News / market benchmarks / tax / execution / multi-agent  
- Inventing combined `user_portfolio` analysis  
- Package 4  

---

## 19. Open decisions for plan acceptance

Confirm before coding:

1. **Wallet delete policy:** CASCADE all wallet AI history (recommended default) vs retain anonymized aggregates.  
2. **Conversation without wallet:** allow global user chats (`wallet_id` null) or require wallet (matches today’s chat UX).  
3. **Import client history:** ship optional consent import in P3 or defer.  
4. **Inferred preferences:** implement with expiry in P3 or defer and ship explicit-only.  
5. **Chat persistence threshold:** persist all chat analyses with any approved insight vs only material novelty.

---

## 20. Plan-first gate

**No Package 3 implementation code, migrations, or API routes should be written until this plan is explicitly approved.**

After approval, implementation proceeds in §16 order and finishes with `# Radareum Package 3 Implementation Audit`.
