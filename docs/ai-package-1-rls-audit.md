# Package 1 — RLS Audit Notes

Inspected SQL in-repo (not a live Supabase project run). Apply
`supabase/migrations/add-ai-trust-package1.sql` to production.

## Table matrix (from schema / migrations)

| Table | RLS Enabled | Select Policy | Insert Policy | Update Policy | Delete Policy | Notes |
| ----- | ----------: | ------------- | ------------- | ------------- | ------------- | ----- |
| wallets | Yes | own user_id | own | own | own | `supabase/schema.sql` |
| transactions | Yes | via wallet ownership | via wallet | via wallet | via wallet | `supabase/schema.sql` |
| asset_positions | Yes | via wallet ownership | (service) | (service) | (service) | `missing-tables-migration.sql` |
| portfolio_snapshots | Yes | via wallet ownership | (service) | — | — | `add-portfolio-snapshots.sql` |
| clients | Yes | own user_id | own | own | own | `schema.sql` |
| investment_lots | Yes | own | own | own | own | `add-investment-return-lots.sql` |
| investment_return_daily | Yes | own | (service) | — | — | `add-investment-return-daily.sql` |
| wallet_financial_summary | Yes | own user_id | (service) | (service) | — | `add-wallet-read-models.sql` |
| wallet_dimension_stats | Yes | own user_id | (service) | (service) | — | `add-wallet-read-models.sql` |
| ai_usage | Yes | own (+ admin) | **removed for clients in Package 1 migration** | **removed for clients** | — | Server service-role writes only after migration |
| ai_request_traces | Yes (new) | own | none (service) | none | none | Package 1 |
| ai_idempotency_keys | Yes (new) | own | none (service) | none | none | Package 1 |
| telegram_* | N/A in repo | — | — | — | — | No Telegram AI tables found for Package 1 |

## Application-level gates that remain required

- `loadWalletContext` filters `wallets` by `user_id` before any financial read.
- AI routes use cookie auth + `assertAiQuota` before `runAnalysis`.
- Screen snapshots cannot change `walletId` ownership; they only enrich context after the ownership gate.

## Test status

- SQL migration validated by review (not executed against a live project in CI).
- Unit/integration tests cover ownership rejection path at `WalletContextError` layer when wallet is not found for user.
- Live RLS policy execution tests require a Supabase test project with service + anon keys (not configured in this repo CI).
