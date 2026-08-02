/**
 * Static RLS policy presence checks against migration SQL in-repo.
 * Does not execute against a live database.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('M — RLS migration review (static)', () => {
  it('Package 1 migration enables RLS on new AI tables', () => {
    const sql = read('supabase/migrations/add-ai-trust-package1.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_request_traces/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_idempotency_keys/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_request_traces ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_idempotency_keys ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/Users can view own ai request traces/);
    expect(sql).toMatch(/Users can view own ai idempotency keys/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Users can insert own ai usage"/);
    expect(sql).toMatch(/ai_transaction_aggregates/);
  });

  it('core financial tables have RLS in schema migrations', () => {
    const schema = read('supabase/schema.sql');
    expect(schema).toMatch(/ALTER TABLE wallets ENABLE ROW LEVEL SECURITY/);
    expect(schema).toMatch(/ALTER TABLE transactions ENABLE ROW LEVEL SECURITY/);
    expect(schema).toMatch(/Users can view own wallets/);
    expect(schema).toMatch(/Users can view own transactions/);
  });

  it('Package 3 migration enables RLS and service-only writes for analyses', () => {
    const sql = read('supabase/migrations/20260802001000_add_ai_memory_package3.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_conversations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_reasoned_analysis_results/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_insight_lifecycles/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_conversations ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_reasoned_analysis_results ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/Users can insert own user messages/);
    expect(sql).toMatch(/role = 'user'/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });
});
