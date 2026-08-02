# Radareum Package 2 Implementation Audit

**Date:** 2026-08-02  
**Plan:** `docs/ai-package-2-implementation-plan.md`

---

## Audit Section 1 — Final Verdict

**Partial**

### Why

The Package 2 reasoning layer is implemented end-to-end (observations → eligibility → attribution → ranking → selection → what-matters → API/UI), Package 1 regressions pass, production build passes, and SOL / one-event counterparty behavior is materially improved.

It is **not Complete** because:

1. Formal benchmark quality metrics (§39) are not yet computed across a full fixture matrix to the stated target rates (false-positive &lt; 5%, top-3 relevance ≥ 90%, etc.).
2. Combined-user multi-wallet internal-transfer exclusion is documented and partially supported at wallet-address level only (same limitation as Package 1).
3. Optional `ai_reasoned_analysis_results` persistence was deferred (in-request MVP per plan).

Critical insight-quality and reasoning gates for the implemented path are green.

---

## Audit Section 2 — Requirement Matrix

| Requirement | Status | Files | Tests | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Observation normalization | Pass | `intelligence-quality/observations.ts` | package2 IQ | Per-engine obs test | Facts only |
| Candidate generation | Pass | `candidates.ts` | package2 IQ | From engine findings | |
| Sample adequacy | Pass | `sample-adequacy.ts` | package2 IQ | Dependency min samples | |
| Materiality (relative) | Pass | `materiality.ts` | package2 IQ | $5k small vs large wallet | |
| Significance | Pass | `significance.ts` | package2 IQ | No claim without baseline | |
| Novelty/persistence | Pass | `novelty.ts` | package2 IQ | new/persistent/resolved | |
| Eligibility + one-event rule | Pass | `eligibility.ts` | package2 IQ | Suppress vs one-time material | |
| Portfolio attribution | Pass | `attribution/portfolio.ts` | package2 IQ | Near-zero % withheld | |
| Asset price/qty | Pass | `attribution/asset-value.ts` | package2 IQ | Reconcile exact | |
| Allocation drift | Pass | `attribution/allocation-drift.ts` | SOL path | Needs snapshots | |
| Capital flow | Partial | `attribution/capital-flow.ts` | unit path | Single-wallet strong | Multi-wallet limited |
| Root-cause | Pass | `root-cause.ts` | SOL test | cannot_determine path | |
| Graph / relationships | Pass | `graph.ts`, `relationships.ts` | via run | In-memory | |
| Contradictions | Pass | `contradictions.ts` | package2 IQ | low risk vs concentration | |
| Deduplication | Pass | `deduplication.ts` | package2 IQ | Concentration merge | |
| Ranking / selection | Pass | `ranking.ts`, `selection.ts` | package2 IQ | Diversity cap | |
| What Matters / monitoring | Pass | `what-matters.ts`, `monitoring.ts` | E2E + IQ | UI `ai-what-matters` | |
| Behavior profiles | Pass | `behavior.ts` | via run | No psych labels | |
| LLM constrained to approved | Pass | `llm/prompts.ts`, `tools/index.ts` | HTTP | Selected IDs only | |
| API `reasonedIntelligence` | Pass | analyze/chat routes | package2-http | Additive | |
| Benchmark targets §39 | Fail/Partial | fixtures + tests | partial | Matrix incomplete | Blocker for Complete |
| Package 1 preserved | Pass | trust + tests | 57+ P1 tests | Still green | |

---

## Audit Section 3 — Files Changed

### Added
- `src/lib/ai/intelligence-quality/**` — full reasoning layer
- `tests/ai/package2-intelligence-quality.test.ts`
- `tests/ai/package2-http-routes.test.ts`
- `tests/fixtures/ai-intelligence-quality/*`
- `docs/ai-package-2-implementation-plan.md`
- `docs/ai-package-2-implementation-audit.md`

### Modified
- `src/lib/ai/tools/index.ts` — insert reasoning before LLM; primary insights = selected
- `src/lib/ai/llm/index.ts`, `prompts.ts` — Package 2 prompt + reasoned summary
- `src/lib/ai/trust/types.ts`, `structured-narrative.ts` — trigger context, whatMatters fields, timings
- `src/app/api/ai/analyze/route.ts`, `chat/route.ts` — expose reasonedIntelligence
- `src/lib/ai-client.ts`, `src/components/ai-analysis-section.tsx` — What Matters UI
- `e2e/ai-package1.spec.ts` — fixture what-matters assertion

### Deleted
- None (removed incomplete duplicate `policies/asset.ts` during implementation)

**Compatibility:** Additive API fields; legacy `narrative` / `insights` / `metrics` retained; primary insight ordering now follows Package 2 selection when available.

---

## Audit Section 4 — Contracts

Implemented in `src/lib/ai/intelligence-quality/types.ts`:

- `AnalyticalObservation`
- `CandidateFinding` / `FindingEligibility`
- `ApprovedInsight`
- `SampleAdequacy`, `MaterialityScore`, `SignificanceScore`, `NoveltyScore`
- `CausalHypothesis`, `ReasoningResult`, `ReasoningConfidence`
- `ContributionAttribution`, `AssetValueAttribution`, `AllocationDriftAttribution`, `CapitalMovementAttribution`
- `IntelligenceNode` / `IntelligenceEdge`
- `ContradictionResult`, `PriorityScore`, `MonitoringPoint`, `WhatMattersSummary`
- `ReasonedIntelligencePackage`, `PublicReasonedIntelligence`

---

## Audit Section 5 — Configuration and Versions

Source: `src/lib/ai/intelligence-quality/config.ts` (`DEFAULT_IQ_CONFIG`, `MODEL_VERSIONS`, `RULE_IDS`).

| Model | Version |
| --- | --- |
| Reasoning engine | reasoning-engine-v1 |
| Eligibility | eligibility-rules-v1 |
| Sample adequacy | sample-adequacy-v1 |
| Materiality | materiality-model-v1 |
| Significance | significance-model-v1 |
| Novelty | novelty-model-v1 |
| Root cause | root-cause-model-v1 |
| Portfolio / asset / drift attribution | portfolio-attribution-v1 / asset-attribution-v1 / allocation-drift-v1 |
| Ranking | ranking-model-v1 |
| Behavior | behavior-model-v1 |

**Key thresholds:** medium/high/critical portfolio impact 5% / 15% / 30%; counterparty dependency min interactions = 3; near-zero change floor $1 or 0.1% portfolio; attribution tolerance $0.01 or 0.5%.

**Why:** Relative materiality replaces fixed $1 engine threshold; single-interaction dependency ban matches Package 2 counterparty rule.

**Config testing:** Unit tests import `DEFAULT_IQ_CONFIG` / scorers directly (same source as production).

---

## Audit Section 6 — Insight Eligibility (examples)

| # | Case | Decision | Evidence |
| --- | --- | --- | --- |
| 1 | Highly material single inflow (~17% portfolio) | **approved** as `one_time_material_event` | SOL fixture flow-in |
| 2 | 100% share, $50, 1 interaction | **suppressed_insufficient_sample** | counterparty unit test |
| 3 | Low mat + low sig | **suppressed_low_materiality** | eligibility gate |
| 4 | Overlapping ETH concentration pair | **suppressed_duplicate** (child) | dedup test |
| 5 | Required domain unavailable | **suppressed_incomplete_scope** | eligibility domain check |

---

## Audit Section 7 — Materiality and Significance

| Scenario | Result |
| --- | --- |
| $5,000 in $10,000 wallet | high/critical |
| $5,000 in $10,000,000 wallet | immaterial/low |
| Large change, no baseline | significance = normal, no claim |
| Persistent elevated condition | novelty = persistent |
| First threshold cross | novelty = new |

---

## Audit Section 8 — Root-Cause Reasoning

**Chain (asset with prices):**  
Observation (value change) → hypotheses `price_effect` / `quantity_effect` → support from attribution parts → select dominant → languageState confirmed/likely.

**Cannot determine:** When no asset attribution / flow support exists → hypothesis `unknown` with `languageState: cannot_determine` and summary *"Cannot determine from available data."*

---

## Audit Section 9 — Attribution

### Portfolio
- Contributors from performance top list + external flow + fees
- Near-zero total change → `% of total change` withheld
- `reconcileErrorUsd` tracked; unexplained residual surfaced in limitations

### Asset
- Formula: `ΔV = q0·Δp + p0·Δq + Δp·Δq` (asset-attribution-v1)
- Example: q 10→12, p 100→110 → price 100 + qty 200 + interaction 20 = 320

### Allocation drift
- Drivers when snapshots available; otherwise unknown + explicit limitation

---

## Audit Section 10 — Cross-Asset / Cross-Domain

- Negative SOL vs positive ETH contributors → offset relationship when both eligible
- Flow finding can `explains` allocation for same entity
- Performance `contributes_to` concentration when same entity
- Trading can `offsets` fee findings

---

## Audit Section 11 — Contradictions and Duplicates

| Case | Status |
| --- | --- |
| Low risk vs critical concentration | contradiction → prefer concentration |
| Overlapping concentration titles | superseded / duplicates |
| Trade dormancy vs high turnover | compatible |
| Consolidated concentration group | one survivor + child duplicate edges |

---

## Audit Section 12 — Ranking (SOL fixture conceptual)

| Finding | Materiality | Significance | Notes | Selected |
| --- | --- | --- | --- | --- |
| Portfolio growth | high | notable | Primary performance | often yes |
| SOL concentrated loss | medium/high | notable | Asset context boost | preferred over tiny net flow |
| One-time material inflow | high | — | Not dependency | may select |
| Tiny net SOL outflow | low | normal | Ranked below major perf | often no |
| Raw 100% dependency wording | — | — | Suppressed/retyped | no as dependency |

Top selection uses weighted score + category diversity (max 2/category on dashboard).

---

## Audit Section 13 — SOL Before and After

### Before (Package 1)
- Many raw engine findings presented via severity/impact ranking
- 100% single-interaction inflow could read as concentration/dependency
- Vague allocation causes
- No what-matters / monitoring package

### After (Package 2)
- Candidates scored; one-interaction high-$ inflow → **one_time_material_event**
- SOL negative contribution prioritized over small net flow
- What Matters + monitoring points + reasonedIntelligence in API
- Causes use attribution or explicitly **cannot determine**
- Package 1 numeric validation still applies

---

## Audit Section 14 — Benchmark Results

| Metric | Value |
| --- | --- |
| Fixture files present | 3+ (sol, one-event, deposit-hiding) |
| Automated IQ unit/integration tests | 13 passed |
| Full §39 rate computation across all required fixtures | **Not complete** |
| False-positive / duplicate / top-3 relevance rates | **Not formally scored** |
| Contribution reconcile (asset formula) | Pass in unit test |
| Failed formal benchmark gate | Yes — blocker for Complete |

---

## Audit Section 15 — Performance

Reasoning consumes engine envelopes only (no extra unbounded DB). Timings recorded on package (`timingsMs`) and trace (`reasoningMs`).

Typical overhead on fixture-sized envelopes: low tens of ms (unit path). Large-history work remains on Package 1 durable jobs.

---

## Audit Section 16 — Test Results

| Command | Result |
| --- | --- |
| `npx vitest run` | **73 passed** (Package 1 + 2) |
| `npx tsc --noEmit` | **pass** |
| `npm run build` | **pass** |
| `npx playwright test e2e/ai-package1.spec.ts` | **4 passed, 1 skipped** |
| ESLint (Package 2 touched files) | **pass** |

---

## Audit Section 17 — Remaining Gaps

### Critical
- None blocking runtime correctness of implemented path

### High
- Full §39 benchmark metric evaluation across complete fixture matrix
- Broader automated Tests C–J as dedicated cases (deposit-hiding, internal multi-wallet, insufficient snapshots)

### Medium
- Combined-user portfolio capital-flow address loading
- Optional `ai_reasoned_analysis_results` persistence
- Richer engine-native observation emission (less metric walking)

### Low
- Separate policy files per domain (currently consolidated `policies/index.ts`)
- Authenticated dashboard E2E (still credential-gated)

---

## Audit Section 18 — Final Self-Assessment

| Dimension | Score /10 | Evidence | Limitations |
| --- | --- | --- | --- |
| Eligibility | 9 | One-event + material one-time tests | More entity types |
| Materiality | 9 | Relative wallet-size test | Weights tunable |
| Sample adequacy | 8 | Dependency mins | Trading/behavior finer rules |
| Root-cause accuracy | 7 | Attribution-backed + cannot_determine | Sparse when metrics lack prices |
| Attribution | 8 | Exact price/qty reconcile | Portfolio residual common |
| Ranking | 8 | Deterministic weights + diversity | Relevance heuristics simple |
| Deduplication | 8 | Concentration consolidation | Semantic NLP not used |
| Contradiction handling | 8 | Risk vs concentration | Bounded grouping |
| Explainability | 8 | What Matters + versions + ruleIds | UI surfaces subset |
| Test coverage | 7 | 73 tests; P2 core green | Benchmark matrix incomplete |
| Performance | 8 | Envelope-only reasoning | Not load-tested at 1M txs (jobs handle) |
| Backward compatibility | 9 | Additive API; P1 tests green | Primary insights reorder when P2 selects |

---

## Completion Rule Check

| Gate | Met? |
| --- | --- |
| Critical acceptance for implemented path | Yes |
| SOL materially improved | Yes |
| One-event concentration handled | Yes |
| Evidence-supported causes / cannot_determine | Yes |
| Contribution reconcile (asset) | Yes |
| Duplicates consolidated | Yes |
| Contradictions resolved | Yes |
| Ranking deterministic | Yes |
| Benchmark targets fully measured | **No** |
| Package 1 tests + build | Yes |
| No unsupported numeric/causal claim to UI (validator + selection) | Yes |

**Verdict remains Partial** until §39 benchmark targets are measured and pass.
