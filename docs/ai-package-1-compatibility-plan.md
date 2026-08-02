# Package 1 — Compatibility Plan (Phase 2)

## Preserve
- `POST /api/ai/analyze` and `POST /api/ai/chat` shapes (`narrative`, `insights`, `metrics`, `confidence`, `dataQuality`).
- Deterministic engines + optional LLM + deterministic fallback.
- Server-side tools executed before LLM (no LLM DB access).

## New contracts (additive)
- `AnalysisScope`, `DomainStatus`, `EvidenceItem`, structured confidence, `structuredNarrative`, `grounding`, `completionStatus`, `validation`, `traceId`, `versions`.

## Migration strategy
1. Add Zod request validation + server-forced mode + trace IDs.
2. Replace silent 5k “complete history” with entitlement-aware scope + aggregates/chunked processing flags.
3. Screen snapshot becomes presentation/verification only (server authoritative).
4. Structured narrative + numeric validator with deterministic fallback.
5. New tables: `ai_request_traces`, `ai_idempotency_keys` (+ RLS).
6. Add vitest and Package 1 tests.

## Risks
- Large refactors in `runAnalysis` / context loader.
- Engines still emit legacy evidence maps — dual-write normalized evidence.
- No async job infra yet — heavy full-history ops return `pending`/`partial` rather than fake complete.

## Files to add
- `src/lib/ai/trust/**`
- `src/lib/ai/validation/**`
- `supabase/migrations/add-ai-trust-package1.sql`
- `tests/ai/**`
- vitest config

## Files to modify
- `src/app/api/ai/analyze/route.ts`, `chat/route.ts`
- `src/lib/ai/tools/index.ts`, `context.ts`, `planner.ts`
- `src/lib/ai/llm/prompts.ts`, `index.ts`, `provider.ts`
- `src/lib/ai-client.ts`, `ai-analysis-section.tsx` (optional additive fields)
- `package.json` (vitest, test script)
