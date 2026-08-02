/**
 * Live RLS verification for Package 3 — 24 required cases.
 * Usage (from repo root):
 *   node scripts/package3-rls-live.mjs
 * Loads .env.local when present. Does not touch production user data —
 * creates disposable pkg3-user-* fixtures only.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;
  // Prefer .env.local for Supabase keys so a stale shell env cannot poison JWT checks.
  const FORCE_KEYS = new Set([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let v = m[2].trim().replace(/^\uFEFF/, '');
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    v = v.trim();
    if (FORCE_KEYS.has(key) || !process.env[key]) {
      process.env[key] = v;
    }
  }
}

loadDotEnvLocal();

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANON || !SERVICE) {
  console.error('Missing SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

async function wipeUser(userId) {
  await admin.from('ai_intelligence_timeline_events').delete().eq('user_id', userId);
  await admin.from('ai_monitoring_point_states').delete().eq('user_id', userId);
  await admin.from('ai_insight_lifecycles').delete().eq('user_id', userId);
  await admin.from('ai_reasoned_analysis_results').delete().eq('user_id', userId);
  await admin.from('ai_user_preferences').delete().eq('user_id', userId);
  await admin.from('ai_conversations').delete().eq('user_id', userId);
  await admin.from('wallets').delete().eq('user_id', userId);
}

async function main() {
  const password = 'Package3Rls!test';
  const userA = await ensureUser('pkg3-user-a@example.com', password);
  const userB = await ensureUser('pkg3-user-b@example.com', password);

  await wipeUser(userA);
  await wipeUser(userB);

  const { data: walletA, error: waErr } = await admin
    .from('wallets')
    .insert({
      user_id: userA,
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      label: 'P3 Wallet A',
    })
    .select('id')
    .single();
  if (waErr) throw waErr;

  const { data: walletB, error: wbErr } = await admin
    .from('wallets')
    .insert({
      user_id: userB,
      address: '0xdddddddddddddddddddddddddddddddddddddddd',
      label: 'P3 Wallet B',
    })
    .select('id')
    .single();
  if (wbErr) throw wbErr;

  const { data: convA, error: caErr } = await admin
    .from('ai_conversations')
    .insert({ user_id: userA, wallet_id: walletA.id, title: 'A chat', channel: 'web' })
    .select('id')
    .single();
  if (caErr) throw caErr;

  const { data: convB, error: cbErr } = await admin
    .from('ai_conversations')
    .insert({ user_id: userB, wallet_id: walletB.id, title: 'B chat', channel: 'web' })
    .select('id')
    .single();
  if (cbErr) throw cbErr;

  const { data: msgA, error: maErr } = await admin
    .from('ai_conversation_messages')
    .insert({
      conversation_id: convA.id,
      user_id: userA,
      role: 'user',
      content: 'seed A',
    })
    .select('id')
    .single();
  if (maErr) throw maErr;

  const { data: msgB, error: mbErr } = await admin
    .from('ai_conversation_messages')
    .insert({
      conversation_id: convB.id,
      user_id: userB,
      role: 'user',
      content: 'seed B',
    })
    .select('id')
    .single();
  if (mbErr) throw mbErr;

  const { data: summaryA } = await admin
    .from('ai_conversation_summaries')
    .insert({
      conversation_id: convA.id,
      summary_version: 'conversation-summary-v1',
      covered_until_message_id: msgA.id,
      covered_message_count: 1,
      summary: { userGoals: ['seed'], priorConclusions: [] },
    })
    .select('id')
    .single();

  await admin.from('ai_user_preferences').insert([
    {
      user_id: userA,
      key: 'language',
      value: 'en',
      source: 'explicit_user_setting',
      active: true,
    },
    {
      user_id: userB,
      key: 'language',
      value: 'ar',
      source: 'explicit_user_setting',
      active: true,
    },
  ]);

  const analysisId = randomUUID();
  const { data: analysisA, error: aaErr } = await admin
    .from('ai_reasoned_analysis_results')
    .insert({
      id: analysisId,
      user_id: userA,
      wallet_id: walletA.id,
      analysis_type: 'dashboard',
      completion_status: 'completed',
      what_matters: { headline: 'A only' },
      trace_id: 'pkg3-rls-trace',
      fingerprint: `pkg3-fp-${Date.now()}`,
    })
    .select('id')
    .single();
  if (aaErr) throw aaErr;

  const { data: snapA, error: snapErr } = await admin
    .from('ai_insight_snapshots')
    .insert({
      analysis_id: analysisA.id,
      lifecycle_key: 'wallet:a:sol:concentration',
      finding_id: 'sol-1',
      finding_type: 'high_asset_dependency',
      category: 'portfolio',
      selected: true,
    })
    .select('id')
    .single();
  if (snapErr) throw snapErr;

  const { data: lifeA, error: lifeErr } = await admin
    .from('ai_insight_lifecycles')
    .insert({
      user_id: userA,
      wallet_id: walletA.id,
      lifecycle_key: 'wallet:a:sol:concentration',
      finding_type: 'high_asset_dependency',
      category: 'portfolio',
      state: 'new',
      first_detected_at: new Date().toISOString(),
      last_detected_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (lifeErr) throw lifeErr;

  const { data: monA, error: monErr } = await admin
    .from('ai_monitoring_point_states')
    .insert({
      user_id: userA,
      wallet_id: walletA.id,
      monitoring_key: 'wallet:a:metric:allocation',
      metric: 'allocation_pct',
      state: 'active',
      explanation: 'Watch SOL allocation',
      analysis_id: analysisA.id,
    })
    .select('id')
    .single();
  if (monErr) throw monErr;

  const a = await clientAs('pkg3-user-a@example.com', password);
  const b = await clientAs('pkg3-user-b@example.com', password);
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1
  {
    const { data, error } = await a.from('ai_conversations').select('id').eq('id', convA.id);
    record('1. A reads A conversation', !error && data?.length === 1, error?.message);
  }
  // 2
  {
    const { data, error } = await a.from('ai_conversations').select('id').eq('id', convB.id);
    record('2. A cannot read B conversation', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 3
  {
    const { data, error } = await a
      .from('ai_conversation_messages')
      .select('id')
      .eq('id', msgA.id);
    record('3. A reads A messages', !error && data?.length === 1, error?.message);
  }
  // 4
  {
    const { data, error } = await a
      .from('ai_conversation_messages')
      .select('id')
      .eq('id', msgB.id);
    record('4. A cannot read B messages', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 5
  {
    const { error } = await a.from('ai_conversation_messages').insert({
      conversation_id: convA.id,
      user_id: userA,
      role: 'user',
      content: 'follow-up from A',
    });
    record('5. A may insert user-role message in A conversation', !error, error?.message);
  }
  // 6
  {
    const { error } = await a.from('ai_conversation_messages').insert({
      conversation_id: convA.id,
      user_id: userA,
      role: 'assistant',
      content: 'forged assistant',
    });
    record('6. A cannot insert assistant-role message', Boolean(error), error?.message ?? 'allowed');
  }
  // 7
  {
    const { error } = await a.from('ai_conversation_messages').insert({
      conversation_id: convA.id,
      user_id: userA,
      role: 'system_event',
      content: 'forged system',
    });
    record('7. A cannot forge system-event message', Boolean(error), error?.message ?? 'allowed');
  }
  // 8
  {
    const { data, error } = await a
      .from('ai_user_preferences')
      .select('key,value')
      .eq('user_id', userA)
      .eq('active', true);
    record(
      '8. A reads A preferences',
      !error && (data ?? []).some(p => p.key === 'language'),
      error?.message,
    );
  }
  // 9
  {
    const { data, error } = await a
      .from('ai_user_preferences')
      .select('key')
      .eq('user_id', userB);
    record('9. A cannot read B preferences', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 10 — inferred source must be rejected by CHECK / policy
  {
    const { error } = await a.from('ai_user_preferences').insert({
      user_id: userA,
      key: 'response_style',
      value: 'concise',
      source: 'inferred',
      active: true,
    });
    record(
      '10. A cannot forge preference source as inferred',
      Boolean(error),
      error?.message ?? 'allowed',
    );
  }
  // 11
  {
    const { data, error } = await a
      .from('ai_reasoned_analysis_results')
      .select('id')
      .eq('id', analysisA.id);
    record('11. A reads A analyses', !error && data?.length === 1, error?.message);
  }
  // 12
  {
    const { data: analysisB } = await admin
      .from('ai_reasoned_analysis_results')
      .insert({
        user_id: userB,
        wallet_id: walletB.id,
        analysis_type: 'dashboard',
        completion_status: 'completed',
        what_matters: { headline: 'B only' },
        trace_id: 'pkg3-b',
        fingerprint: `pkg3-fp-b-${Date.now()}`,
      })
      .select('id')
      .single();
    const { data, error } = await a
      .from('ai_reasoned_analysis_results')
      .select('id')
      .eq('id', analysisB.id);
    record('12. A cannot read B analyses', !error && (data?.length ?? 0) === 0, error?.message);
  }
  // 13
  {
    const { error } = await a.from('ai_reasoned_analysis_results').insert({
      user_id: userA,
      wallet_id: walletA.id,
      analysis_type: 'dashboard',
      completion_status: 'completed',
      what_matters: {},
      trace_id: 'client-forge',
    });
    record('13. A cannot insert reasoned analysis directly', Boolean(error), error?.message ?? 'allowed');
  }
  // 14
  {
    const { data, error } = await admin
      .from('ai_reasoned_analysis_results')
      .insert({
        user_id: userA,
        wallet_id: walletA.id,
        analysis_type: 'dashboard',
        completion_status: 'completed',
        what_matters: { headline: 'service insert' },
        trace_id: 'service-insert',
        fingerprint: `pkg3-svc-${Date.now()}`,
      })
      .select('id')
      .single();
    record('14. Service path inserts an analysis', !error && Boolean(data?.id), error?.message);
  }
  // 15
  {
    const { data, error } = await a
      .from('ai_insight_lifecycles')
      .select('id')
      .eq('id', lifeA.id);
    record('15. A reads A lifecycle records', !error && data?.length === 1, error?.message);
  }
  // 16
  {
    const { error } = await a
      .from('ai_insight_lifecycles')
      .update({ state: 'resolved' })
      .eq('id', lifeA.id);
    const { data } = await admin.from('ai_insight_lifecycles').select('state').eq('id', lifeA.id).single();
    record(
      '16. A cannot update lifecycle state directly',
      Boolean(error) || data?.state === 'new',
      error?.message ?? `state=${data?.state}`,
    );
  }
  // 17
  {
    const { error } = await a.from('ai_intelligence_timeline_events').insert({
      user_id: userA,
      wallet_id: walletA.id,
      event_type: 'insight_new',
      analysis_id: analysisA.id,
      title: 'forged',
      summary: 'forged',
      priority: 1,
    });
    record('17. A cannot create timeline events', Boolean(error), error?.message ?? 'allowed');
  }
  // 18
  {
    const { error: lifeUp } = await admin
      .from('ai_insight_lifecycles')
      .update({ state: 'worsening', updated_at: new Date().toISOString() })
      .eq('id', lifeA.id);
    const { error: tlErr } = await admin.from('ai_intelligence_timeline_events').insert({
      user_id: userA,
      wallet_id: walletA.id,
      event_type: 'insight_worsened',
      lifecycle_key: 'wallet:a:sol:concentration',
      analysis_id: analysisA.id,
      title: 'SOL worsening',
      summary: 'Service timeline',
      priority: 0.7,
    });
    record(
      '18. Service path updates lifecycle and creates timeline',
      !lifeUp && !tlErr,
      lifeUp?.message || tlErr?.message,
    );
  }
  // 19
  {
    const { data, error } = await anon.from('ai_conversations').select('id').eq('id', convA.id);
    record('19. Anonymous access is denied', !error && (data?.length ?? 0) === 0, error?.message);
  }

  // Keep ids for cascade checks before wallet delete
  const walletAId = walletA.id;
  const analysisKeepId = analysisA.id;
  const snapKeepId = snapA.id;
  const monKeepId = monA.id;
  const lifeKeepId = lifeA.id;
  const summaryKeepId = summaryA?.id;

  // 20 — wallet cascade (disposable fixture wallet only)
  {
    await admin.from('wallets').delete().eq('id', walletAId);
    const [{ data: analyses }, { data: lives }, { data: mons }, { data: tls }, { data: convs }] =
      await Promise.all([
        admin.from('ai_reasoned_analysis_results').select('id').eq('id', analysisKeepId),
        admin.from('ai_insight_lifecycles').select('id').eq('id', lifeKeepId),
        admin.from('ai_monitoring_point_states').select('id').eq('id', monKeepId),
        admin
          .from('ai_intelligence_timeline_events')
          .select('id')
          .eq('wallet_id', walletAId),
        admin.from('ai_conversations').select('id').eq('id', convA.id),
      ]);
    record(
      '20. Wallet deletion cascades required wallet memory',
      (analyses?.length ?? 0) === 0 &&
        (lives?.length ?? 0) === 0 &&
        (mons?.length ?? 0) === 0 &&
        (tls?.length ?? 0) === 0 &&
        (convs?.length ?? 0) === 0,
      `analyses=${analyses?.length} lives=${lives?.length} mons=${mons?.length} tls=${tls?.length} convs=${convs?.length}`,
    );
  }

  // Recreate wallet A + conversation for remaining cascade tests
  const { data: walletA2, error: wa2Err } = await admin
    .from('wallets')
    .insert({
      user_id: userA,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      label: 'P3 Wallet A2',
    })
    .select('id')
    .single();
  if (wa2Err) throw wa2Err;

  const { data: convA2 } = await admin
    .from('ai_conversations')
    .insert({ user_id: userA, wallet_id: walletA2.id, title: 'Cascade chat', channel: 'web' })
    .select('id')
    .single();
  const { data: msgA2 } = await admin
    .from('ai_conversation_messages')
    .insert({
      conversation_id: convA2.id,
      user_id: userA,
      role: 'user',
      content: 'to cascade',
    })
    .select('id')
    .single();
  const { data: sumA2 } = await admin
    .from('ai_conversation_summaries')
    .insert({
      conversation_id: convA2.id,
      summary_version: 'conversation-summary-v1',
      covered_until_message_id: msgA2.id,
      covered_message_count: 1,
      summary: { userGoals: ['x'] },
    })
    .select('id')
    .single();

  // 21
  {
    await admin.from('ai_conversations').delete().eq('id', convA2.id);
    const [{ data: msgs }, { data: sums }, { data: conv }] = await Promise.all([
      admin.from('ai_conversation_messages').select('id').eq('id', msgA2.id),
      admin.from('ai_conversation_summaries').select('id').eq('id', sumA2.id),
      admin.from('ai_conversations').select('id').eq('id', convA2.id),
    ]);
    record(
      '21. Conversation deletion cascades messages and summaries',
      (msgs?.length ?? 0) === 0 && (sums?.length ?? 0) === 0 && (conv?.length ?? 0) === 0,
      `msgs=${msgs?.length} sums=${sums?.length} conv=${conv?.length}`,
    );
  }

  const { data: analysisC } = await admin
    .from('ai_reasoned_analysis_results')
    .insert({
      user_id: userA,
      wallet_id: walletA2.id,
      analysis_type: 'dashboard',
      completion_status: 'completed',
      what_matters: { headline: 'cascade snaps' },
      trace_id: 'cascade-snap',
      fingerprint: `pkg3-snap-${Date.now()}`,
    })
    .select('id')
    .single();
  const { data: snapC } = await admin
    .from('ai_insight_snapshots')
    .insert({
      analysis_id: analysisC.id,
      lifecycle_key: 'k',
      finding_id: 'f1',
      finding_type: 't',
      category: 'portfolio',
    })
    .select('id')
    .single();

  // 22
  {
    await admin.from('ai_reasoned_analysis_results').delete().eq('id', analysisC.id);
    const { data } = await admin.from('ai_insight_snapshots').select('id').eq('id', snapC.id);
    record('22. Analysis deletion cascades insight snapshots', (data?.length ?? 0) === 0);
  }

  // 23 — deleted conversation/analysis not fetchable by A
  {
    const { data: d1 } = await a.from('ai_conversations').select('id').eq('id', convA.id);
    const { data: d2 } = await a.from('ai_reasoned_analysis_results').select('id').eq('id', analysisKeepId);
    record(
      '23. Deleted records cannot be fetched by direct ID',
      (d1?.length ?? 0) === 0 && (d2?.length ?? 0) === 0,
    );
  }

  // 24 — export isolation via service read filtered by user (API contract mirrored)
  {
    await admin.from('ai_user_preferences').upsert({
      user_id: userA,
      key: 'analysis_depth',
      value: 'balanced',
      source: 'explicit_user_setting',
      active: true,
    });
    const { data: prefsA } = await a.from('ai_user_preferences').select('key,user_id').eq('active', true);
    const { data: prefsAsB } = await a
      .from('ai_user_preferences')
      .select('key')
      .eq('user_id', userB);
    const onlyOwned = (prefsA ?? []).every(p => p.user_id === userA);
    record(
      '24. Export/list returns only A-owned data',
      onlyOwned && (prefsAsB?.length ?? 0) === 0,
      `prefsA=${prefsA?.length} leakedB=${prefsAsB?.length}`,
    );
  }

  // cleanup disposable fixtures (not production data)
  await wipeUser(userA);
  await wipeUser(userB);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
