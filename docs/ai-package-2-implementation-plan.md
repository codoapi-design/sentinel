# Radareum Package 2 — Implementation & Compatibility Plan

**Status:** Plan only — implementation must not begin until this document is accepted as the working baseline.  
**Date:** 2026-08-02  
**Depends on:** Package 1 Complete (trust, evidence, jobs, entitlements, numeric validation)

---

## 1. Executive summary

Package 1 established authoritative grounding: deterministic engines compute facts; the LLM only explains; numeric validation, evidence, scope honesty, RLS, jobs, and entitlements are enforced.

Package 2 adds a **deterministic intelligence-quality / reasoning layer** between engine outputs and narrative:

```text
Authenticated request
→ Trusted data retrieval (Package 1)
→ Deterministic financial engines (unchanged contracts)
→ Package 2 reasoning layer (NEW)
→ Approved structured insights + what-matters
→ LLM explanation of approved intelligence only
→ Package 1 numeric validation
→ UI
```

**Goal:** Stop promoting every mathematically correct observation to a primary insight. Gate on eligibility, sample adequacy, materiality, significance, novelty, causality, attribution, contradiction/dedup, and ranked selection.

---

## 2. Existing behavior (as-is)

### 2.1 Request pipeline

| Stage | Location | Behavior today |
| --- | --- | --- |
| Auth + Zod | `src/app/api/ai/analyze/route.ts`, `chat/route.ts` | Server-forced mode; traceId; idempotency |
| Entitlements | `src/lib/ai/trust/entitlements.ts` | Plan history window; async full-history gate |
| Context load | `src/lib/ai/tools/context.ts` | One wallet per request; holdings, txs, snapshots (730d), optional lots |
| Tool plan | `tools/planner.ts`, `bundles.ts` | Section → ≤4 tools |
| Engines | `src/lib/ai/intelligence/*.ts` | Pure functions → `IntelligenceResult` / `EngineOutput` |
| Finding filter | `trust/domain-status.ts` `filterProhibitedFindings` | Domain availability gate |
| Evidence | `trust/evidence.ts` + engine `sourceRefs` | Normalized evidence items |
| Ranking | `intelligence/index.ts` `rankInsights` | Severity → confidence → \|impactUsd\| → module order |
| Narrative | `llm/index.ts` | Structured JSON → validate IDs + numbers → markdown |
| Response | Analyze/Chat `data` | Additive Package 1 fields; legacy `insights`/`metrics`/`narrative` |

### 2.2 Insight production problems Package 2 must fix

1. **Equal presentation of weak patterns** — e.g. flow `concentrated_inflow_source` / counterparty dominance can fire on `sharePct ≥ 40` with `interaction_count = 1`, and wording can imply dependency.
2. **Fixed USD materiality** — `MATERIAL_USD_THRESHOLD = 1` in `shared.ts`; not portfolio-relative.
3. **Shallow ranking** — `rankInsights` ignores sample adequacy, novelty, user context diversity, causal support.
4. **No root-cause / attribution layer** — performance engine has some contribution language, but there is no versioned portfolio/asset/allocation-drift reconciliation package exposed to narrative selection.
5. **LLM receives all allowed findings** — `allowedFindingIds` includes every non-prohibited finding (capped at 15), not a curated “what matters” set. Structured narrative can only pick from that set, but weak findings still compete.
6. **No contradiction / semantic dedup** — ID dedup only; overlapping concentration narratives (portfolio + asset + risk) can all surface.
7. **Multi-wallet external flow** — internal transfer detection uses **addresses on the same wallet row** (`walletAddresses` / `isInternalCounterparty`). Cross-wallet same-user ownership is **not** modeled in AI context today.
8. **No persisted reasoned results** — only `ai_analysis_jobs.result_ref` (aggregates), traces, idempotency. No `ai_reasoned_analysis_results` table.
9. **Dual confidence** — engines use `high|medium|low`; Package 1 adds five-level `ConfidenceScore` on `NormalizedFinding`. Package 2 must add reasoning-level confidence without collapsing these layers.

### 2.3 Active engines and insight surface

Eight engines via `runFullIntelligence` / tool registry:

| Engine | File | Example insight types relevant to P2 |
| --- | --- | --- |
| Portfolio | `portfolio.ts` | `extreme_concentration`, `single_asset_dependency`, `allocation_shift` |
| Asset | `asset.ts` | `dominant_asset`, `allocation_drift`, `hidden_underperformer` |
| Performance | `performance.ts` | `deposit_driven_growth`, `investment_return`, `concentrated_growth/loss` |
| Flow | `flow.ts` | `concentrated_inflow_source`, `large_capital_event`, classifications incl. `internal_transfer` |
| Trading | `trading.ts` | `high_turnover_behavior`, `result_attribution`, fee-related patterns |
| Network | `network.ts` | `single_network_dependency`, gas exposure |
| Counterparty | `counterparty.ts` | `major_capital_source/destination`, dominance via `interactionCount` |
| Risk | `risk.ts` | `high_asset_dependency`, contradictory severity vs other modules |

### 2.4 Data available for attribution / novelty

| Data | Source | Adequacy for P2 |
| --- | --- | --- |
| Holdings / allocation | `asset_positions` | Strong for current-state observations |
| Transactions | wallet txs (+ classification) | Strong for flow/trading; pricing gaps common |
| Portfolio snapshots | `portfolio_snapshots` (730d load) | Adequate for PoP value; gaps → insufficient drift cause |
| Investment lots / IR | `investment_lots` (lazy scope) | Needed to separate deposit vs return; may be absent |
| Owned addresses | single wallet multi-chain fields | Internal transfers within wallet only |
| Cross-user-wallet graph | not in AI context | **Limitation** — combined-portfolio external flow needs explicit scope work |
| Prior reasoned state | none persisted | Novelty from historical windows / snapshots, not conversational memory |

### 2.5 Existing tests / fixtures

- `tests/ai/package1-*.test.ts` — trust, entitlements, evidence, HTTP, jobs, integration (SOL inline ~$9,260 / SOL ~$368).
- E2E fixture page `/e2e/ai-package1` with mocked Analyze/Chat.
- **No** `tests/fixtures/ai-intelligence-quality/` yet — Package 2 must create the benchmark dataset.

---

## 3. Target architecture

### 3.1 Module structure (to add)

```text
src/lib/ai/intelligence-quality/
├── types.ts                 # All Package 2 contracts + schemaVersion
├── config.ts                # IntelligenceQualityConfig + ruleIds + versions
├── observations.ts          # Engine metrics/findings → AnalyticalObservation[]
├── candidates.ts            # Observation/finding → CandidateFinding[]
├── eligibility.ts
├── sample-adequacy.ts
├── materiality.ts
├── significance.ts
├── novelty.ts
├── root-cause.ts
├── attribution/
│   ├── portfolio.ts
│   ├── asset-value.ts
│   ├── allocation-drift.ts
│   └── capital-flow.ts
├── graph.ts
├── relationships.ts
├── contradictions.ts
├── deduplication.ts
├── ranking.ts
├── selection.ts
├── behavior.ts
├── monitoring.ts
├── what-matters.ts
├── policies/
│   ├── asset.ts
│   ├── portfolio.ts
│   ├── flow.ts
│   ├── transaction.ts
│   ├── risk.ts
│   ├── trading.ts
│   ├── network.ts
│   └── counterparty.ts
├── serialize.ts             # LLM-facing summaries; diagnostics
├── run.ts                   # Orchestrator: envelopes → ReasonedIntelligencePackage
├── metrics-benchmark.ts     # Quality metric computation over fixtures
└── index.ts
```

Responsibilities stay separated; orchestrator only wires stages and records `TraceTimings` spans.

### 3.2 Insertion point in `runAnalysis`

After envelopes + `filterProhibitedFindings` + evidence normalization, **before** `generateNarrative`:

```text
envelopes + WalletContext + AnalysisScope + DomainStatus[]
  → runIntelligenceQuality(...)
  → ReasonedIntelligencePackage
  → allowedFindingIds := selectedInsightIds ∪ approvedInsightIds (mapped)
  → LLM receives ONLY selected/approved summaries (not full candidate set)
  → Map approved insights → legacy `insights` for primary UI (compatibility)
  → Attach `reasonedIntelligence` (public subset) on RunAnalysisResult / HTTP
```

Legacy `insights` array remains for compatibility but **primary ordering and narrative selection** must follow Package 2 `selectedInsightIds`. Full raw engine findings may still exist in `intelligence` envelopes server-side; HTTP Analyze continues to omit full envelopes (as today). Chat may keep summarized intelligence without suppressed candidates.

### 3.3 Public vs diagnostic API

**Public `reasonedIntelligence` (always additive):**

- `schemaVersion`, `approvedInsights` (trimmed), `rankedInsightIds`, `selectedInsightIds`
- `whatMatters`, `monitoringPoints`, `contradictions` (resolved summaries)
- `attribution` (portfolio / assets / drift / capitalFlow)
- `completionStatus`, `limitations`, `versions`

**Diagnostics (`reasoningDiagnostics`):** only when server flag / admin role (e.g. `AI_REASONING_DIAGNOSTICS=1` or existing admin check). Includes candidate/suppressed counts and reason histograms — never security-sensitive wallet payloads beyond what traces already allow.

---

## 4. Files to modify

| File | Change |
| --- | --- |
| `src/lib/ai/tools/index.ts` | Call quality orchestrator; extend `RunAnalysisResult`; constrain LLM allowed IDs; optional legacy insight remap |
| `src/lib/ai/llm/index.ts` | Pass what-matters + selected summaries; reject narrative IDs outside approved set |
| `src/lib/ai/llm/prompts.ts` | Prompt version bump (`v2.x-package2`); forbid inventing findings/priority/causes |
| `src/lib/ai/trust/structured-narrative.ts` | Extend schema: `whatMatters`, `monitoringPointIds`; keep Package 1 fields |
| `src/lib/ai/trust/types.ts` | Additive types / version constants for narrative + AI versions |
| `src/lib/ai/trust/tracing.ts` | Timing keys: observations, eligibility, materiality, attribution, graph, contradictions, ranking, selection |
| `src/app/api/ai/analyze/route.ts` | Expose `reasonedIntelligence` (+ gated diagnostics) |
| `src/app/api/ai/chat/route.ts` | Same authoritative approved set for same scope/question |
| `src/lib/ai-client.ts` | Optional typed fields for UI |
| `src/components/ai-analysis-section.tsx` | Prefer What Matters / approved insights when present |
| `src/app/e2e/ai-package1/` or new `ai-package2` fixture | What Matters, priority, monitoring, confidences |
| `tests/ai/package1-*.test.ts` | Ensure still green (regression) |
| `package.json` | Test scripts if needed for benchmark runner |

**Engines (`intelligence/*.ts`):** Prefer **minimal** changes — emit clearer metric keys / interaction counts for observation normalization. Do **not** move eligibility into engines. Optional: soften dependency wording in titles once candidates own interpretation (compatibility: keep types stable).

**Capital-flow multi-wallet:** If combined-portfolio scope is required for Test D, extend `loadWalletContext` / scope with explicit `analysisLevel: 'wallet' | 'user_portfolio'` and load sibling wallet addresses for the same `user_id` — gated, bounded, and documented. Default remains single-wallet (Package 1 behavior).

---

## 5. Files to add

| Path | Responsibility |
| --- | --- |
| `src/lib/ai/intelligence-quality/**` | Full reasoning layer (see §3.1) |
| `tests/ai/package2-*.test.ts` | Unit + integration + quality metrics |
| `tests/fixtures/ai-intelligence-quality/**` | Versioned JSON fixtures (portfolio/asset/counterparty/trading/risk) |
| `tests/ai/package2-http-routes.test.ts` | HTTP additive contract + suppression |
| `e2e/ai-package2.spec.ts` (+ fixture page if needed) | Minimal UI fixture |
| `supabase/migrations/YYYYMMDD_add_ai_reasoned_analysis_results.sql` | **Only if** persistence chosen (see §10) |
| `docs/ai-package-2-implementation-plan.md` | This document |

---

## 6. Proposed contracts (summary)

Full TypeScript interfaces will live in `intelligence-quality/types.ts`, matching the Package 2 spec:

- `AnalyticalObservation` — deterministic facts only (no interpretive claims)
- `SampleAdequacy`, `MaterialityScore`, `SignificanceScore`, `NoveltyScore`
- `CandidateFinding`, `FindingEligibility`, `FindingTrigger`
- `ApprovedInsight` (+ `ReasoningResult`, relationships, `PriorityScore`)
- `CausalHypothesis`, `ContributionAttribution`, `AssetValueAttribution`, `AllocationDriftAttribution`
- `IntelligenceNode` / `IntelligenceEdge`, `ContradictionResult`
- `BehaviorAssessment`, `MonitoringPoint`, `WhatMattersSummary`
- `ReasonedIntelligencePackage` (top-level orchestrator output)
- `ReasoningConfidence` — observation vs causal vs interpretation

**Compatibility mapping:**

| Package 2 | Package 1 bridge |
| --- | --- |
| Observation evidenceIds | `EvidenceItem.evidenceId` from `normalizeAllFindings` |
| Candidate from engine finding | Preserve legacy `Insight.id` / `type` as trigger `ruleId` |
| ApprovedInsight | Projected to `AnalysisInsight` for `insights[]` |
| ConfidenceScore | Reuse `trust/types.ConfidenceScore` / `buildConfidenceScore` |
| AnalysisScope / DomainStatus | Pass-through from Package 1; never invent coverage |

---

## 7. Configuration and rule versions

Central `IntelligenceQualityConfig` in `config.ts` (single source for prod + tests):

| Version id | Purpose |
| --- | --- |
| `reasoning-engine-v1` | Orchestrator |
| `eligibility-rules-v1` | Eligibility decisions |
| `sample-adequacy-v1` | Domain sample models |
| `materiality-model-v1` | Relative materiality |
| `significance-model-v1` | Historical significance |
| `novelty-model-v1` | New/recurring/persistent/resolved |
| `root-cause-model-v1` | Causal hypotheses |
| `portfolio-attribution-v1` | Portfolio contribution + tolerance |
| `asset-attribution-v1` | Price/qty/interaction formula |
| `allocation-drift-v1` | Drift drivers |
| `ranking-model-v1` | Priority weights |
| `behavior-model-v1` | Behavior profiles |

**Default thresholds (initial proposal — tune via fixtures, not prompts):**

| Key | Default | Rationale |
| --- | --- | --- |
| Counterparty min interactions for “dependency/recurring” | 3 | Blocks 1×100% dependency |
| Counterparty min active days for pattern | 2 | Patterns need repetition window |
| Materiality medium portfolio pct | 5% | Relative gate |
| Materiality high portfolio pct | 15% | Primary insight bar |
| Materiality critical portfolio pct | 30% | Critical concentration/events |
| Near-zero portfolio change USD | max($1, 0.1% portfolio) | Avoid explosive % attribution |
| Attribution reconcile tolerance | $0.01 or 0.5% of \|totalChange\| | Documented |
| Price/qty formula | `ΔV = q0·Δp + p0·Δq + Δp·Δq` | Standard interaction decomposition; versioned |
| Dashboard primary insights | 3–5 | Spec |
| Chat primary | 1 + ≤2 support | Spec |
| Report | 5–12 | Spec |
| Max pairwise contradiction checks | Group by entity/category first | Performance |

Every rule records stable `ruleId` (e.g. `elig.counterparty.single_interaction_v1`).

---

## 8. Workstream mapping (execution order)

Matches required order §44; each step is a PR-sized unit with tests before the next:

1. **Contracts + config** — types, config, version constants, barrel export  
2. **Observations** — normalize all 8 engines; unit tests per engine  
3. **Candidates** — from observations + legacy findings; triggers + proposedMeaning  
4. **Sample adequacy → materiality → significance → novelty** — pure scorers + wallet-size tests  
5. **Eligibility** — including single-interaction counterparty rule + material one-time event  
6. **Attribution suite** — portfolio / asset / allocation-drift / capital-flow (+ multi-wallet scope if in scope)  
7. **Root-cause** — hypotheses from attribution + evidence; unknown when unsupported  
8. **Graph + relationships + contradictions + dedup**  
9. **Ranking + contextual relevance + selection + what-matters + monitoring**  
10. **Behavior + confidence refinement + domain policies**  
11. **Serialize + LLM/prompt/API + UI additive fields**  
12. **Persistence (optional)** — see §10  
13. **Benchmark fixtures + quality metrics + HTTP/E2E + regression + build**

---

## 9. Critical rule designs (must not shortcut)

### 9.1 Counterparty / flow concentration

```text
IF interactionCount == 1
AND counterparty not suspicious
AND materiality level < high
  → suppress dependency / recurring concentration
  → decision: suppressed_insufficient_sample | suppressed_not_meaningful

IF interactionCount == 1 AND materiality >= high (or novelty = new + high $)
  → approve as one-time material event (type distinct from dependency)
```

Observation `share = 100%` may remain; narrative must not say “recurring dependency.”

### 9.2 Portfolio attribution reconciliation

```text
sum(contributor.contributionUsd) + unexplainedChangeUsd ≈ totalChangeUsd
```

within `portfolio-attribution-v1` tolerance. Near-zero total change: report absolute contributions and offsets; **do not** emit misleading `% of total change`.

### 9.3 Deposit vs investment return

Never claim positive investment performance solely from balance increase when external inflow explains growth (`deposit_driven_growth` / contribution split). Large-deposit fixture is mandatory.

### 9.4 Internal transfers

- Wallet-level: keep flow classification `internal_transfer` via owned addresses.  
- User-portfolio level (if implemented): outflow on A to B (same user) ≠ external portfolio outflow.  
- Default API scope remains individual wallet until user-portfolio level is explicitly requested and tested.

### 9.5 LLM constraints

LLM receives:

- Selected approved insight IDs + structured reasoning summaries  
- What-matters, monitoring points, attribution summaries, limitations  
- Metric tokens / approved numerics  

LLM must **not** receive unranked candidates as equal facts; must not invent findings, priorities, causes, or numbers. Package 1 numeric validator remains mandatory; `selectedFindingIds` ⊆ approved/selected set.

---

## 10. Persistence and migrations

**Inspected:** No general analysis-results table; `ai_analysis_jobs` stores job checkpoints/`result_ref` only.

**Recommendation:**

| Phase | Approach |
| --- | --- |
| P2 MVP | Compute reasoned package in-request; optionally embed compact summary in job `result_ref` for async completion; persist diagnostics only in `ai_request_traces` timings/metadata |
| P2 persistence (if benchmark/eval needs replay) | Add `ai_reasoned_analysis_results` with RLS (`user_id` SELECT own), indexes `(user_id, wallet_id, created_at)`, retention (e.g. 90d), version fields, **no** raw tx dumps |

Migration needs **only if** persistence table is added; not required to start reasoning layer. Rollback = drop table / stop writes.

---

## 11. Data limitations (explicit)

1. Snapshot gaps → no confident historical allocation-drift cause; current allocation still usable.  
2. Unpriced assets → unexplained attribution slices; lower confidence.  
3. Missing lots → cannot cleanly separate IR from deposits; limitation required.  
4. Single-wallet AI default → cross-wallet internal transfers look external unless analysis level expanded.  
5. Counterparty labels/heuristics imperfect → classification confidence caps causal certainty.  
6. No prior reasoned state store → novelty from windows/snapshots; `unknown` when insufficient.  
7. Full-history pending jobs → reasoning must not invent completion (Package 1 pending path).

---

## 12. Compatibility risks

| Risk | Mitigation |
| --- | --- |
| Breaking Analyze/Chat JSON | Additive `reasonedIntelligence` only; keep narrative/insights/metrics/confidence/dataQuality/scope/evidence/validation |
| Empty primary insights after aggressive suppression | Selection floor: always allow data-quality / limitation insights when domains incomplete; never invent material findings |
| ID mismatch for structured narrative | Approved insights keep stable IDs derived from legacy finding IDs where possible |
| Package 1 tests fail | Run full `tests/ai/package1-*` on every PR; do not change validator semantics |
| Performance regression | Consume envelopes/aggregates; no per-candidate LLM; O(n) grouping for dedup/contradictions; chunked attribution reuse jobs |
| Dual ranking (`rankInsights` vs P2) | P2 selection replaces primary order; keep `rankInsights` for envelope-internal use only |
| UI still shows weak cards | Prefer approved/selected in `ai-analysis-section`; legacy list truncated to selected |

**Migration strategy for clients:**

1. Ship additive API fields (backward compatible).  
2. UI reads `reasonedIntelligence.whatMatters` / selected insights when present.  
3. Deprecate equal-weight display of raw `insights` in a later pass (not required for P2 Complete if UI prefers approved when available).

---

## 13. Test strategy

### 13.1 Unit

One file (or describe block) per module in §3.1 scorers + policies; mandatory cases from Package 2 §37.1 including single-interaction suppression and material one-time approval.

### 13.2 Integration (A–J)

Fixtures under `tests/fixtures/ai-intelligence-quality/` with version field; SOL scenario aligned to spec numbers (~$9,257 / SOL ~$4,329 / 46.77% / etc.) as dedicated fixture (distinct from Package 1’s smaller SOL share fixture).

### 13.3 HTTP

Extend Package 1 HTTP patterns: `reasonedIntelligence` present; chat/analyze approved set parity; suppressed not in narrative; validator still blocks; diagnostics unauthorized → absent/403.

### 13.4 E2E

Controlled fixture page (label clearly): What Matters, top insights, evidence, priority, separate confidence, monitoring, limitations.

### 13.5 Benchmark metrics (§39)

Runner over fixture set computes false-positive, duplicate, contradiction, unsupported causal, top-3 relevance, reconciliation error. **Complete only if targets met.**

### 13.6 Regression

All Package 1 tests + `tsc` + production build + lint on touched files.

---

## 14. Performance considerations

- Input = already-loaded `EngineOutput[]` + `IntelligenceInput` / aggregates — **no** unbounded re-query.  
- Attribution uses ledger/snapshots already in context; heavy full history stays on Package 1 jobs.  
- One LLM call per analysis (unchanged).  
- Graph in-memory; edge generation from grouped entity keys.  
- Trace spans for each stage for audit §15.  
- Target overhead: small vs engine+LLM time; document large-fixture timings in audit.

---

## 15. Out of scope (forbidden in Package 2)

Telegram AI, autonomous notifications, price prediction, buy/sell advice, trade execution, long-term conversational memory, vector DBs, tax/news, multi-agent orchestration, DeFi strategy generation.

---

## 16. Acceptance gate (pre-implementation checklist)

Before coding:

- [x] Package 1 contracts inspected  
- [x] Engines / insight types / evidence / confidence inspected  
- [x] Tool envelopes / narrative / snapshots / lots / classification inspected  
- [x] Ownership / entitlements / fixtures inspected  
- [x] This plan written  

Before declaring Package 2 Complete:

- [ ] All Critical acceptance criteria (§45)  
- [ ] Benchmark targets (§39)  
- [ ] Package 1 tests + build green  
- [ ] Final audit document delivered  

---

## 17. Proposed first implementation slice (after plan approval)

**Slice 0 (this plan)** — done.  
**Slice 1:** `types.ts` + `config.ts` + `observations.ts` + per-engine observation tests.  
**Slice 2:** candidates + sample/materiality/significance/novelty + eligibility (counterparty rule).  
**Slice 3:** attribution + root-cause.  
**Slice 4:** graph/dedup/contradiction/rank/select/what-matters/monitoring.  
**Slice 5:** wire `runAnalysis` + LLM + API + UI.  
**Slice 6:** fixtures, benchmarks, HTTP/E2E, audit.

No implementation code for Package 2 has been added in this planning step.
