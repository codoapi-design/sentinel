# Radareum Package 3 Security Closure Audit

**Date:** 2026-08-02  
**Project host:** `dawxvvlinfyjgbsyjtyj.supabase.co`  
**Package 4:** Not started  

---

## 1. Final verdict

**Complete**

Live RLS is **24/24**, migration objects exist on the target project, real persistence + cross-user isolation + deletion smoke passed, and Package 1/2 automated regressions plus production build remain green.

Root cause of earlier `bad_jwt`: stale mismatched Supabase keys left in the process environment were preferred over `.env.local`. `scripts/package3-rls-live.mjs` now forces Supabase keys from `.env.local`.

---

## 2. Supabase project consistency result

| Check | Result |
| --- | --- |
| Project URL host | `dawxvvlinfyjgbsyjtyj.supabase.co` |
| URL project ref | `dawxvvlinfyjgbsyjtyj` |
| Anon JWT `ref` | `dawxvvlinfyjgbsyjtyj` (matches) |
| Service JWT `ref` | `dawxvvlinfyjgbsyjtyj` (matches) |
| Anon role | `anon` |
| Service role | `service_role` |
| Same project | **Yes** |
| Placeholder / expired / malformed | **No** (legacy JWT format; not expired) |
| Keys printed | **No** (redacted) |

---

## 3. Migration verification

Against the live project (service-role select probes):

| Object | Present |
| --- | --- |
| `ai_conversations` | Yes |
| `ai_conversation_messages` | Yes |
| `ai_conversation_summaries` | Yes |
| `ai_user_preferences` | Yes |
| `ai_reasoned_analysis_results` | Yes |
| `ai_insight_snapshots` | Yes |
| `ai_insight_lifecycles` | Yes |
| `ai_monitoring_point_states` | Yes |
| `ai_intelligence_timeline_events` | Yes |

RLS / policies / cascades / forge blocks were proven by the live 24-case suite (not static inspection alone).

Note: `ai_transaction_aggregates` RPC was not found in this project schema cache (Package 1 helper); unrelated to Package 3 memory tables.

---

## 4. Full 24-case RLS table

| # | RLS case | Result | Database response |
| - | -------- | ------ | ----------------- |
| 1 | A reads A conversation | PASS | row returned |
| 2 | A cannot read B conversation | PASS | 0 rows |
| 3 | A reads A messages | PASS | row returned |
| 4 | A cannot read B messages | PASS | 0 rows |
| 5 | A may insert user-role message in A conversation | PASS | insert ok |
| 6 | A cannot insert assistant-role message | PASS | RLS violation on `ai_conversation_messages` |
| 7 | A cannot forge system-event message | PASS | RLS violation on `ai_conversation_messages` |
| 8 | A reads A preferences | PASS | own preference rows |
| 9 | A cannot read B preferences | PASS | 0 rows |
| 10 | A cannot forge preference source as inferred | PASS | RLS violation on `ai_user_preferences` |
| 11 | A reads A analyses | PASS | row returned |
| 12 | A cannot read B analyses | PASS | 0 rows |
| 13 | A cannot insert reasoned analysis directly | PASS | RLS violation on `ai_reasoned_analysis_results` |
| 14 | Service path inserts an analysis | PASS | insert ok |
| 15 | A reads A lifecycle records | PASS | row returned |
| 16 | A cannot update lifecycle state directly | PASS | state remained `new` |
| 17 | A cannot create timeline events | PASS | RLS violation on `ai_intelligence_timeline_events` |
| 18 | Service path updates lifecycle and creates timeline | PASS | update + insert ok |
| 19 | Anonymous access is denied | PASS | 0 rows |
| 20 | Wallet deletion cascades required wallet memory | PASS | analyses/lives/mons/tls/convs = 0 |
| 21 | Conversation deletion cascades messages and summaries | PASS | msgs/sums/conv = 0 |
| 22 | Analysis deletion cascades insight snapshots | PASS | snapshot gone |
| 23 | Deleted records cannot be fetched by direct ID | PASS | 0 rows for A |
| 24 | Export/list returns only A-owned data | PASS | prefsA=2, leakedB=0 |

**Score: 24 passed / 0 failed**

---

## 5. Real persistence smoke test

Disposable users `pkg3-smoke-a@…` / `pkg3-smoke-b@…` only.

| Step | Result |
| --- | --- |
| 1. Create conversation | PASS |
| 2. Insert user message | PASS |
| 3. Persist assistant via server/service path | PASS |
| 4. Persist reasoned analysis + snapshot | PASS |
| 5. Create lifecycle | PASS |
| 6. Create timeline event | PASS |
| 7. User A reload (conv/msgs/analysis/lifecycle/timeline) | PASS (`1/2/1/1/1`) |
| 8. User B cannot load | PASS (`0/0`) |

---

## 6. Deletion proof

| Step | Result |
| --- | --- |
| 9–10. Delete conversation → messages inaccessible to A | PASS |
| 11–12. Wallet delete → analyses, snapshots, lifecycle, monitoring, timeline gone | PASS (`0/0/0/0/0`) |

---

## 7. Regression results

| Command | Result |
| --- | --- |
| `npx vitest run tests/ai` | **139 passed** (21 files); Package 2 benchmark gates green |
| `npx tsc --noEmit` | **Pass** (exit 0) |
| `npm run build` | **Pass** |
| `npx playwright test e2e/ai-package3.spec.ts` | **3 passed** |
| `node scripts/package3-rls-live.mjs` | **24/24 passed** (reconfirmed after regression) |

---

## 8. Remaining failures

None for this security gate.

Operational note: when running scripts from a shell that previously exported wrong Supabase keys, rely on the updated `.env.local` force-load in `package3-rls-live.mjs` (or clear those env vars).

---

## 9. Final Package 3 status

**Package 3 = Complete**

Criteria met:

* Credentials belong to the same project  
* Migration objects exist  
* Live RLS 24/24  
* Real persistence succeeds  
* Cross-user isolation succeeds  
* Deletion succeeds  
* Package 1 and Package 2 remain green  
* Production build passes  

**Do not begin Package 4** until product explicitly schedules it.
