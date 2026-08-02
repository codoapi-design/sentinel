'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWalletStore } from '@/stores/wallet-store';

type Tab = 'conversations' | 'analyses' | 'lifecycle' | 'timeline' | 'preferences';
type Row = Record<string, unknown>;
const tabs: Tab[] = ['conversations', 'analyses', 'lifecycle', 'timeline', 'preferences'];

async function api(path: string, init?: RequestInit): Promise<Row[]> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed.');
  return body.data ?? [];
}
async function apiObject(path: string): Promise<Row | null> {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed.');
  return body.data ?? null;
}

export function AiMemoryPanel() {
  const walletId = useWalletStore(state => state.activeWalletId);
  const [tab, setTab] = useState<Tab>('conversations');
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [eventType, setEventType] = useState('');
  const [preferenceKey, setPreferenceKey] = useState('response_style');
  const [preferenceValue, setPreferenceValue] = useState('concise');

  const load = useCallback(async () => {
    setError('');
    setDetail(null);
    try {
      const wallet = walletId ? `?walletId=${encodeURIComponent(walletId)}` : '';
      const path =
        tab === 'conversations' ? '/api/ai/conversations' :
        tab === 'analyses' ? `/api/ai/analyses${wallet}` :
        tab === 'lifecycle' ? `/api/ai/insights/lifecycle${wallet}` :
        tab === 'timeline' ? `/api/ai/timeline${wallet}${eventType ? `&eventType=${encodeURIComponent(eventType)}` : ''}` :
        '/api/ai/preferences';
      setRows(await api(path));
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'Could not load AI memory.');
    }
  }, [eventType, tab, walletId]);

  useEffect(() => { void load(); }, [load]);

  const conversationAction = async (id: string, action: 'rename' | 'archive' | 'delete') => {
    const title = action === 'rename' ? window.prompt('Conversation title') : null;
    if (action === 'rename' && !title?.trim()) return;
    await api(`/api/ai/conversations/${id}`, {
      method: action === 'delete' ? 'DELETE' : 'PATCH',
      body: action === 'rename' ? JSON.stringify({ title }) : action === 'archive' ? JSON.stringify({ status: 'archived' }) : undefined,
    });
    void load();
  };

  const savePreference = async (event: React.FormEvent) => {
    event.preventDefault();
    let value: unknown = preferenceValue;
    try { value = JSON.parse(preferenceValue); } catch { /* string preference */ }
    await api('/api/ai/preferences', { method: 'PUT', body: JSON.stringify({ key: preferenceKey, value }) });
    void load();
  };

  return (
    <section className="rounded-xl border border-white/5 bg-[#0f1011] p-4" data-testid="ai-memory-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-[#f7f8f8]">AI memory</h2><p className="text-xs text-[#8a8f98]">Your conversations and historical intelligence.</p></div>
        <button onClick={() => void load()} className="rounded-md border border-white/10 px-2 py-1 text-xs text-[#d0d6e0] hover:bg-[#191a1b]">Refresh</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-white/5 pb-3">
        {tabs.map(item => <button key={item} data-testid={`ai-memory-tab-${item}`} onClick={() => setTab(item)} className={`rounded-md px-2.5 py-1.5 text-xs capitalize ${tab === item ? 'bg-[#0052ff] text-white' : 'text-[#8a8f98] hover:bg-[#191a1b]'}`}>{item}</button>)}
      </div>
      {error && <p className="mb-3 text-xs text-[#f6465d]">{error}</p>}
      {tab === 'conversations' && <div data-testid="ai-conversation-list" className="space-y-2">
        {rows.map(row => <div key={String(row.id)} className="flex items-center gap-2 rounded-lg bg-[#191a1b] p-2 text-xs"><button className="min-w-0 flex-1 truncate text-left text-[#d0d6e0]" onClick={() => setDetail(row)}>{String(row.title ?? 'Untitled')}</button><button onClick={() => void conversationAction(String(row.id), 'rename')}>Rename</button><button onClick={() => void conversationAction(String(row.id), 'archive')}>Archive</button><button className="text-[#f6465d]" onClick={() => void conversationAction(String(row.id), 'delete')}>Delete</button></div>)}
        {!rows.length && <Empty />}
      </div>}
      {tab === 'analyses' && <div data-testid="ai-analysis-list" className="space-y-2">
        {!walletId && <p className="text-xs text-[#8a8f98]">Select a wallet to view analyses.</p>}
        {rows.map(row => <div key={String(row.id)} className="rounded-lg bg-[#191a1b] p-2 text-xs"><p className="text-[#d0d6e0]">{String(row.headline ?? row.analysisType)}</p><div className="mt-2 flex gap-3"><button onClick={() => setDetail(row)}>Open</button><button onClick={async () => { setDetail(await apiObject(`/api/ai/analyses/${row.id}/compare`)); }}>Compare</button></div></div>)}
        {walletId && !rows.length && <Empty />}
      </div>}
      {tab === 'lifecycle' && <List testId="ai-lifecycle-list" rows={rows} />}
      {tab === 'timeline' && <div><input value={eventType} onChange={e => setEventType(e.target.value)} placeholder="Filter event type" className="mb-3 rounded-md border border-white/10 bg-[#191a1b] px-2 py-1 text-xs text-[#d0d6e0]" /><List testId="ai-timeline-list" rows={rows} /></div>}
      {tab === 'preferences' && <div>
        <form data-testid="ai-preferences-form" onSubmit={savePreference} className="mb-3 flex flex-wrap gap-2">
          <select value={preferenceKey} onChange={e => setPreferenceKey(e.target.value)} className="bg-[#191a1b] text-xs text-[#d0d6e0]"><option value="response_style">Response style</option><option value="language">Language</option><option value="fiat_currency">Fiat currency</option><option value="analysis_depth">Analysis depth</option><option value="focus_areas">Focus areas</option></select>
          <input value={preferenceValue} onChange={e => setPreferenceValue(e.target.value)} className="rounded-md border border-white/10 bg-[#191a1b] px-2 py-1 text-xs text-[#d0d6e0]" />
          <button className="rounded-md bg-[#0052ff] px-2 py-1 text-xs text-white">Save</button>
        </form>
        {rows.map(row => <div key={String(row.key)} className="mb-1 flex justify-between rounded bg-[#191a1b] p-2 text-xs text-[#d0d6e0]"><span>{String(row.key)}: {JSON.stringify(row.value)}</span><button className="text-[#f6465d]" onClick={async () => { await api(`/api/ai/preferences/${row.key}`, { method: 'DELETE' }); void load(); }}>Remove</button></div>)}
      </div>}
      {detail && <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/20 p-2 text-[10px] text-[#8a8f98]">{JSON.stringify(detail, null, 2)}</pre>}
    </section>
  );
}

function List({ testId, rows }: { testId: string; rows: Row[] }) { return <div data-testid={testId} className="space-y-2">{rows.map((row, i) => <div key={String(row.id ?? row.lifecycleKey ?? i)} className="rounded-lg bg-[#191a1b] p-2 text-xs text-[#d0d6e0]">{String(row.title ?? row.lifecycleKey ?? row.eventType ?? 'Record')} <span className="text-[#8a8f98]">{String(row.state ?? row.summary ?? '')}</span></div>)}{!rows.length && <Empty />}</div>; }
function Empty() { return <p className="text-xs text-[#8a8f98]">Nothing saved yet.</p>; }
