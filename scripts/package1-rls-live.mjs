/**
 * Live RLS verification against local Supabase.
 * Usage: node scripts/package1-rls-live.mjs
 * Requires: supabase start + schema applied.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANON || !SERVICE) {
  console.error('Missing SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function ensureUser(email, password) {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed?.users?.find(u => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function clientAs(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

async function main() {
  const password = 'Package1Rls!test';
  const userA = await ensureUser('pkg1-user-a@example.com', password);
  const userB = await ensureUser('pkg1-user-b@example.com', password);

  // Clean prior fixtures
  await admin.from('wallets').delete().in('user_id', [userA, userB]);

  const { data: walletA, error: waErr } = await admin
    .from('wallets')
    .insert({ user_id: userA, address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', label: 'Wallet A' })
    .select('id')
    .single();
  if (waErr) throw waErr;

  const { data: walletB, error: wbErr } = await admin
    .from('wallets')
    .insert({ user_id: userB, address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', label: 'Wallet B' })
    .select('id')
    .single();
  if (wbErr) throw wbErr;

  const a = await clientAs('pkg1-user-a@example.com', password);
  const b = await clientAs('pkg1-user-b@example.com', password);

  // 1 A reads Wallet A
  {
    const { data, error } = await a.from('wallets').select('id').eq('id', walletA.id);
    record('1. A reads Wallet A — allowed', !error && data?.length === 1, error?.message);
  }
  // 2 A reads Wallet B
  {
    const { data, error } = await a.from('wallets').select('id').eq('id', walletB.id);
    record('2. A reads Wallet B — denied', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 3 B reads Wallet B
  {
    const { data, error } = await b.from('wallets').select('id').eq('id', walletB.id);
    record('3. B reads Wallet B — allowed', !error && data?.length === 1, error?.message);
  }
  // 4 Anonymous
  {
    const { data, error } = await anon.from('wallets').select('id').eq('id', walletA.id);
    record('4. Anonymous reads wallet — denied', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 5 Aggregate RPC Wallet A
  {
    const { error } = await a.rpc('ai_transaction_aggregates', { p_wallet_id: walletA.id });
    record('5. A aggregate RPC Wallet A — allowed', !error, error?.message);
  }
  // 6 Aggregate RPC Wallet B
  {
    const { data, error } = await a.rpc('ai_transaction_aggregates', { p_wallet_id: walletB.id });
    // Ownership guard returns zero rows (not a zeroed aggregate row).
    const denied = Boolean(error) || data == null || (Array.isArray(data) && data.length === 0);
    record('6. A aggregate RPC Wallet B — denied', denied, error?.message || `rows=${Array.isArray(data) ? data.length : 'n/a'}`);
  }
  // 7 Client insert AI trace
  {
    const { error } = await a.from('ai_request_traces').insert({
      trace_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: userA,
      entry_point: 'analyze',
      mode: 'dashboard',
      response_status: 200,
    });
    record('7. Client insert AI trace — denied', Boolean(error), error?.message);
  }
  // 8 Server insert AI trace
  {
    const { error } = await admin.from('ai_request_traces').insert({
      trace_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: userA,
      wallet_id: walletA.id,
      entry_point: 'analyze',
      mode: 'dashboard',
      response_status: 200,
    });
    record('8. Server insert AI trace — allowed', !error, error?.message);
  }
  // 9 Client forge AI usage
  {
    const { error } = await a.from('ai_usage').insert({
      user_id: userA,
      chat_count: 9999,
      analysis_count: 9999,
    });
    record('9. Client forge AI usage — denied', Boolean(error), error?.message);
  }
  // 10 Idempotency cross-user
  {
    const key = `idem-${crypto.randomUUID()}`;
    await admin.from('ai_idempotency_keys').insert({
      idempotency_key: key,
      user_id: userA,
      entry_point: 'analyze',
      request_hash: 'h1',
      status: 'completed',
    });
    const { data, error } = await b.from('ai_idempotency_keys').select('id').eq('idempotency_key', key);
    record('10. B cannot read A idempotency row', !error && (data?.length ?? 0) === 0, error?.message);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
