# Radareum AI Package 3 — Release tag

**Tag:** `radareum-ai-package3-complete`  
**Status:** Package 3 Complete  
**Do not begin Package 4** from this tag without an explicit product decision.

## Preserved at this tag

| Artifact | Path |
| --- | --- |
| Package 3 migration | `supabase/migrations/20260802001000_add_ai_memory_package3.sql` |
| 24-case live RLS script | `scripts/package3-rls-live.mjs` |
| Security closure audit | `docs/ai-package-3-security-closure-audit.md` |
| Package 2 final closure / benchmark context | `docs/ai-package-2-final-closure-audit.md`, `tests/ai/package2-benchmark.test.ts`, `tests/fixtures/ai-intelligence-quality/` |
| Package 3 fixtures | `tests/fixtures/ai-memory/v1/` |
| Package 3 lifecycle / memory tests | `tests/ai/package3-*.test.ts` |

## CI gates

Workflow: `.github/workflows/ai-packages.yml`

* Package 1 tests (`npm run test:ai:package1`)  
* Package 2 benchmark suite (`npm run test:ai:package2`)  
* Package 3 tests (`npm run test:ai:package3`)  
* TypeScript (`npm run typecheck`)  
* Production build (`npm run build`)  

Live RLS remains an operator/manual gate (`npm run test:rls:package3`) because it requires project credentials.

## Freeze notice

Do not silently change:

* Lifecycle semantics  
* Memory model versions  
* RLS policies in the Package 3 migration  
* Historical numeric validation rules  
