# Package 2 Persistence Decision — `ai_reasoned_analysis_results`

**Decision:** Option B — **Defer persistence**  
**Date:** 2026-08-02  
**Status:** Formal (not a Package 2 completion blocker)

## Why not needed for Package 2 correctness

Package 2 quality targets are evaluated against deterministic reasoning over engine envelopes in-request. Benchmark replay uses versioned fixtures under `tests/fixtures/ai-intelligence-quality/v1/`, not a durable results table. Novelty/persistence scores derive from interaction counts and domain baselines in the current analysis window (`novelty.ts`), not from stored prior reasoned rows.

## How novelty / evaluation work without the table

| Concern | Current mechanism |
| --- | --- |
| Novelty lifecycle | Deterministic from sample/interaction/history signals in the envelope |
| Evaluation replay | Fixture matrix + `runBenchmark()` |
| Reports | Live `reasonedIntelligence` on analyze/chat responses |
| Monitoring points | Derived per request from approved insights |

## Functionality unavailable until Option A

- Historical “what we said last week” comparison across sessions
- Cross-request novelty decay from prior approved insight IDs
- Offline audit trail of full reasoned packages for support/compliance
- Background monitoring jobs keyed to prior reasoned results

## Trigger to implement Option A later

Add `ai_reasoned_analysis_results` when any of the following becomes a product requirement:

1. Cross-session novelty / “resolved risk” that depends on prior reasoned IDs  
2. Scheduled monitoring alerts that compare to a prior reasoned package  
3. Compliance export of immutable analysis snapshots  
4. Benchmark golden-master storage beyond git fixtures  

When implemented: RLS by `user_id`/`wallet_id`, indexes on `(wallet_id, created_at)`, retention policy, and `schema_version` / `reasoning_engine` columns matching `MODEL_VERSIONS`.
