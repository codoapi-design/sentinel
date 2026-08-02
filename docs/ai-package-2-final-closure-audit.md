# Radareum Package 2 Final Closure Audit

**Date:** 2026-08-02  
**Prior status:** Partial (`docs/ai-package-2-implementation-audit.md`)  
**Persistence decision:** Option B — deferred (`docs/ai-package-2-persistence-decision.md`)

---

## Section 1 — Final Verdict

**Complete**

All mandatory Package 2 quality gates pass on the automated v1 benchmark (48/48 fixtures). Tests C–J pass. Hostile LLM narrative constraints are enforced. Confidence propagation is tested. Package 1 regressions remain green. Production build passes. Playwright fixture E2E passes (4 passed / 1 skipped for missing auth). Combined `user_portfolio` analysis was **not** invented; wallet-level labeling is explicit.

---

## Section 2 — Benchmark Dataset

| Item | Value |
| --- | --- |
| Location | `tests/fixtures/ai-intelligence-quality/v1/` (+ programmatic `src/lib/ai/intelligence-quality/benchmark/matrix.ts`) |
| Version | `v1` |
| Fixture count | **48** (≥ 35–50 target) |
| Categories | portfolio, flow, asset, counterparty, trading, risk, mixed |

**Fixture IDs:**  
`port-dominant-asset`, `port-balanced`, `port-positive-one-negative`, `port-negative-one-positive`, `port-deposit-hiding-return`, `port-internal-transfer-wallet`, `port-near-zero-offsets`, `port-growth-new-capital`, `port-growth-market-return`, `port-partial-pricing`, `asset-price-driven`, `asset-qty-driven`, `asset-mixed-price-qty`, `asset-drift-other-growth`, `asset-drift-outflow`, `asset-neg-in-positive-port`, `asset-dormant`, `asset-unpriced`, `asset-newly-dominant`, `asset-persistent-concentration`, `cp-one-immaterial`, `cp-one-material`, `cp-repeated`, `cp-exchange`, `cp-new-unknown`, `cp-internal-wallet`, `cp-small-immaterial`, `cp-diverse`, `cp-decayed`, `tr-high-fees`, `tr-increased-count-volume`, `tr-lower-count-higher-volume`, `tr-insufficient`, `tr-rotation`, `tr-high-turnover-weak-perf`, `tr-low-turnover-holder`, `risk-critical-asset`, `risk-network`, `risk-partial-pricing`, `risk-low-with-local`, `risk-contradictory`, `risk-persistent`, `risk-resolved`, `risk-increasing`, `risk-decreasing`, `snap-insufficient-drift`, `intent-overrides-page`, `sol-historical-closure`

**Coverage gaps (non-blocking):**
- No live multi-wallet combined-portfolio scenarios (product does not support combined AI analysis).
- Novelty across sessions still in-request only (persistence deferred).
- Engine envelopes in fixtures are controlled; live Alchemy variance is outside this matrix.

---

## Section 3 — Formal Quality Metrics

Automated via `runBenchmark()` → `tests/fixtures/ai-intelligence-quality/v1/last-run-report.json`.

| Metric | Target | Result | Pass |
| ------ | -----: | -----: | ---: |
| False-positive primary-insight rate | < 5% | **0%** | ✅ |
| Duplicate primary-insight rate | < 3% | **0%** | ✅ |
| Unresolved contradiction rate | = 0% | **0%** | ✅ |
| Unsupported causal-claim rate | = 0% | **0%** | ✅ |
| Forbidden claim rate | = 0% | **0%** | ✅ |
| Top-3 relevance accuracy | ≥ 90% | **100%** | ✅ |
| Attribution reconciliation pass rate | = 100% | **100%** | ✅ |
| Data-limitation compliance rate | = 100% | **100%** | ✅ |
| One-event dependency false-positive rate | = 0% | **0%** | ✅ |
| Package 1 numeric-validation regressions | = 0 | **0** | ✅ |

Additional automated rates: precision **1.0**, recall **1.0**, top-1 relevance **83.3%**, mean ranking agreement **0.94**, fixtures passed **48/48**.

---

## Section 4 — Failed Fixtures

**None** in the final run (`failedFixtures: 0`).

---

## Section 5 — Rule Changes

Made because of benchmark failures (before → after):

| Change | Cause | Files |
| --- | --- | --- |
| Materiality floor at ≥3% / ≥2% portfolio impact | Modest losses/growth scored 0.24 and failed eligibility | `materiality.ts` |
| Normal-behavior suppress only below eligibility materiality floor | Eligible modest findings re-suppressed as “normal” | `eligibility.ts` |
| Concentration parent priority (dependency/dominant > extreme/increase) | Wrong survivor on equal materiality | `deduplication.ts` |
| Keep duplicate children marked `suppressed_duplicate` | Duplicate groups not observable | `deduplication.ts` |
| Narrow dependency pattern (exclude asset concentration) | `high_asset_dependency` mis-treated as CP rule | `eligibility.ts` |
| Suppress `no_counterparties` when interactions ≥ 2 | Diverse CP fixture false primary | `eligibility.ts` |
| Trading/behavior insufficient sample gate | Sparse trades incorrectly selected | `eligibility.ts` |
| `allocation_drift` requires holdings only (snapshots optional) | Snap-insufficient fixture blocked entirely | `candidates.ts` |
| Skip residual `net_capital_movement` when one-time material selected | SOL FP primary | `selection.ts` |
| User-intent ranking boost for portfolio questions | Page context overrode chat intent | `ranking.ts` (prior + verified) |
| Narrative constraint enforcement post-LLM parse | Hostile ID / promotion / limitation removal | `narrative-constraints.ts`, `llm/index.ts` |
| Capital metric observations (`externalInflowUsd`, etc.) | Avoidable blind spots in observation layer | `observations.ts` |

---

## Section 6 — Tests C–J

| Test | Expected | Actual |
| --- | --- | --- |
| **C** Deposit hiding return | Value up; capital ≠ investment performance; What Matters distinguishes | Pass — `deposit_driven_growth` selected; forbidden “strong investment performance” absent |
| **D** Multi-wallet | If no combined portfolio: do not invent; label wallet-level | Pass — limitation `individual wallet (not combined user portfolio)`; `analysisLevel=individual_wallet` |
| **E** Price-driven | Price effect dominates; qty ≈ 0; causal supported/partial | Pass — `priceEffectUsd > 0`, `quantityEffectUsd ≈ 0`, reconcile OK |
| **F** Quantity-driven | Qty dominates; price ≈ 0 | Pass — quantity effect > 0, price ≈ 0 |
| **G** Contradictions | True contradiction resolved; preferred side set | Pass — unresolved = 0; preferredFindingId set |
| **H** Duplicate concentration | One parent; children suppressed | Pass — `dominant_asset` selected; `concentration_increase` `suppressed_duplicate` |
| **I** Insufficient snapshots | No unsupported drift cause; limitation present | Pass — snapshot limitation; no confirmed causal wording |
| **J** Near-zero portfolio | No misleading %; absolute offsets; reconcile | Pass — contribution % null; SOL/ETH offsets; reconcile ≤ 1 |

Source: `tests/ai/package2-scenarios-cj.test.ts`.

---

## Section 7 — Ranking Evaluation

| Fixture | Expected top-3 (types) | Actual top-3 |
| --- | --- | --- |
| port-dominant-asset | extreme_concentration, continuous_growth | extreme_concentration, continuous_growth |
| port-balanced | continuous_growth | portfolio_structure, continuous_growth |
| port-positive-one-negative | continuous_growth, concentrated_loss | continuous_growth, concentrated_loss |
| asset-price-driven | performance_leader | performance_leader |
| asset-newly-dominant | dominant_asset | dominant_asset |
| tr-high-fees | high_turnover_behavior, result_attribution | high_turnover_behavior, result_attribution |
| snap-insufficient-drift | allocation_drift | allocation_drift |
| port-near-zero-offsets | concentrated_loss, concentrated_growth | concentrated_loss, concentrated_growth |
| intent-overrides-page | continuous_growth (portfolio Q on SOL page) | continuous_growth, concentrated_loss |
| sol-historical-closure | continuous_growth, concentrated_loss | continuous_growth, one_time_material_event, concentrated_loss |

User-intent override verified: page=`asset`/SOL + question “Why did my entire portfolio grow?” → primary `continuous_growth` (portfolio), not SOL-forced primary.

---

## Section 8 — Root-Cause Evaluation

| State | Examples |
| --- | --- |
| Supported / likely | Material one-time inflow (`likely: external_inflow`); price/qty attribution when data complete |
| Partially supported | Flow outflow hypotheses on flow-category findings |
| Rejected / superseded | Low-risk claim vs critical concentration (`risk-contradictory`, `risk-low-with-local`) |
| cannot_determine | SOL performance / allocation without causal evidence; snapshot-insufficient drift |

Unsupported `confirmed` / `strongly_supported` with `insufficient_data` rate = **0%** on the matrix.

---

## Section 9 — Confidence Propagation

Chain implemented in `confidence-propagation.ts` and applied in `run.ts`:

```
observationConfidence
→ attributionConfidence (when asset attr present)
→ causalConfidence = min(causal, attribution)
→ interpretationConfidence = min(observation, attribution, causal, sample)
→ What Matters confidence = min(selected interpretation confidences)
```

Example (SOL historical closure, concentrated_loss path): observation high/medium → causal `cannot_determine` (~low) → interpretation capped to causal ceiling → What Matters cannot exceed weakest selected insight. Asserted in `tests/ai/package2-confidence-perf.test.ts`.

---

## Section 10 — SOL Final Output

Fixture: `sol-historical-closure` (wallet ≈ $9,257; SOL −$368; portfolio +$4,559; one-time inflow $1,628).

| Layer | Result |
| --- | --- |
| Observations | Engine metrics + finding evidence + capital keys (`externalInflowUsd`, `valueChangeUsd`, …) |
| Candidates | `continuous_growth`, `concentrated_loss`, `one_time_material_event` (from inflow), `net_capital_movement` |
| Suppressed | `concentrated_inflow_source` rewritten → one-time; net residual not selected when one-time present |
| Approved / selected | `continuous_growth`, `one_time_material_event`, `concentrated_loss` |
| Ranking | Performance growth first; one-time event; SOL loss |
| Attribution | ETH +4928, SOL −368, external inflow/outflow; reconcileErrorUsd = 0 |
| Root cause | Primary: cannot_determine; one-time: likely external inflow |
| What Matters | Portfolio up; SOL detracted while ETH offset; no recurring CP concentration |
| Monitoring | Perf driver + repeat transfer watch |
| Narrative constraints | LLM allowed IDs: `sol-p`, `sol-in`, `sol-l` only |
| Numeric validation | Package 1 gate still final |
| Versions | `reasoning-engine-v1`, eligibility/materiality/significance/ranking/attribution/behavior v1 |
| Timings (fixture) | total ≈ 10ms (no LLM in reasoning path) |

---

## Section 11 — Multi-Wallet Decision

**Combined user-portfolio AI analysis does not exist** in Radareum today (`loadWalletContext` is single-wallet).

- Do **not** invent `analysisLevel=user_portfolio`.
- Every reasoned package includes:  
  `Analysis level: individual wallet (not combined user portfolio).`
- Capital-flow attribution supports the type for future combined level, but records a limitation if requested without sibling addresses.
- Test D covers wallet-level labeling; internal transfer fixture forbids “combined portfolio outflow” claims.

---

## Section 12 — Persistence Decision

**Formally deferred (Option B).**  
See `docs/ai-package-2-persistence-decision.md`.

Not a Package 2 correctness blocker: novelty and evaluation use in-request signals + git fixtures.

---

## Section 13 — Performance

| Envelope | Total overhead (fixture run) | Notes |
| --- | --- | --- |
| Small | ≤ 1 ms | No LLM per finding |
| Medium | ≤ 1–2 ms | Deterministic stages |
| Large (SOL) | ~10 ms | Observations dominate |

Repeatability: identical SOL inputs → identical `rankedInsightIds`, `selectedInsightIds`, What Matters headline (`package2-confidence-perf.test.ts`).

Guarantees checked: no LLM call in IQ path; contradiction compare bounded by entity groups; no new unbounded DB load in reasoning layer.

---

## Section 14 — Full Regression Results

| Command | Result |
| --- | --- |
| `npx vitest run` | **94 passed** / 0 failed (13 files) |
| `npx tsc --noEmit` | **Pass** |
| `npm run build` | **Pass** |
| `npx playwright test` | **4 passed**, **1 skipped** (auth), **0 failed** |
| Package 1 suites | Green (trust, evidence, HTTP, integration, RLS review) |
| Package 2 benchmark | 48/48 fixtures; all gates pass |
| Lint (P2-touched) | 0 errors / 4 unused-eslint-disable warnings |
| Repeatability + performance tests | Pass |
| Tests C–J | Pass |
| Narrative constraint tests | Pass |

---

## Section 15 — Remaining Gaps

| Severity | Gap |
| --- | --- |
| Critical | None for Package 2 completion criteria |
| High | Combined multi-wallet portfolio analysis still a product gap (documented, not invented) |
| Medium | Cross-session novelty / historical reasoned persistence deferred |
| Medium | Top-1 relevance 83% (top-3 is 100%; primary ordering still improvable on balanced portfolios) |
| Low | ESLint unused disable comments in benchmark/perf tests |
| Low | Authenticated Playwright dashboard smoke skipped without `E2E_EMAIL` |

---

## Section 16 — Final Score

| Area | Score | Evidence |
| --- | --- | --- |
| Benchmark matrix completeness | 10/10 | 48 fixtures, all required categories |
| Automated quality gates | 10/10 | All mandatory targets pass |
| Tests C–J | 10/10 | Dedicated suite green |
| Ranking + intent override | 9.5/10 | Top-3 100%; top-1 83% |
| Causal / contradiction safety | 10/10 | Unsupported causal 0%; unresolved 0% |
| Confidence propagation | 10/10 | Ordering tests + What Matters min |
| Narrative / LLM constraints | 10/10 | Hostile mocks + wire-in to `generateNarrative` |
| Multi-wallet honesty | 10/10 | Explicit non-support + wallet label |
| Package 1 preservation | 10/10 | Full vitest + build + playwright |
| Persistence clarity | 10/10 | Option B documented |

**Overall: 9.9 / 10 — Package 2 Complete.**

---

## Engine-native observation coverage (closure)

| Engine | Missing analytical fact | Data exists? | Added metric/observation | Tests |
| ------ | ----------------------- | -----------: | ------------------------ | ----- |
| flow / performance | External vs internal capital split | Often in metrics | `externalInflowUsd`, `externalOutflowUsd`, `internalTransferUsd`, `netExternalFlowUsd` observations | C, D, J, SOL |
| performance | Portfolio value change | Yes | `valueChangeUsd` observation | C, SOL |
| performance | Investment return USD | When engine emits | `investmentReturnUsd` observation | C |
| asset | Price/qty effects | Via attribution when lots present | Attribution path (not fabricated) | E, F |
| asset | Drift cause without snapshots | No | Honest `cannot_determine` + limitation | I |

---

*Do not begin Package 3 until product prioritizes it separately.*
