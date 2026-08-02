'use client';

import { useCallback, useEffect, useState } from 'react';

type State = {
  conversations?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  analyses?: Array<Record<string, unknown>>;
  lifecycle?: Array<Record<string, unknown>>;
  timeline?: Array<Record<string, unknown>>;
  preferences?: Array<Record<string, unknown>>;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/e2e/ai-package3/${path}`, init);
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
  return response.json();
}

export function Package3E2eFixture() {
  const [state, setState] = useState<State>({});
  const [temporarySaved, setTemporarySaved] = useState(false);

  const load = useCallback(async () => {
    const result = await request('state');
    setState(result.data ?? {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-6 text-sm text-[#f7f8f8]">
      <div className="flex flex-wrap gap-2">
        <button
          data-testid="package3-seed"
          className="rounded bg-[#0052ff] px-3 py-1"
          onClick={() => void seedAndLoad()}
        >
          Seed
        </button>
        <button
          data-testid="package3-chat-turn"
          className="rounded border border-white/20 px-3 py-1"
          onClick={async () => {
            await request('chat-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'E2E persisted turn' }),
            });
            await load();
          }}
        >
          Persist chat turn
        </button>
        <button
          data-testid="package3-delete-conversation"
          className="rounded border border-white/20 px-3 py-1"
          onClick={async () => {
            await request('conversation', { method: 'DELETE' });
            await load();
          }}
        >
          Delete conversation
        </button>
        <button
          data-testid="package3-temporary-style"
          className="rounded border border-white/20 px-3 py-1"
          onClick={async () => {
            const result = await request('temporary-style', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'brief answer only this time' }),
            });
            setTemporarySaved(Boolean(result.data?.persisted));
            await load();
          }}
        >
          Request concise just this time
        </button>
      </div>
      <p data-testid="package3-temporary-result">Temporary style saved: {String(temporarySaved)}</p>
      <section data-testid="package3-conversations">
        <h2>Conversations</h2>
        {state.conversations?.map(c => (
          <p key={String(c.id)}>
            {String(c.title)} ({String(c.status)})
          </p>
        ))}
      </section>
      <section data-testid="package3-messages">
        <h2>Messages</h2>
        {state.messages?.map(m => (
          <p key={String(m.id)}>{String(m.content)}</p>
        ))}
      </section>
      <section data-testid="package3-analyses">
        <h2>Analyses A to B to C</h2>
        {state.analyses?.map(a => (
          <p key={String(a.id)}>
            {String((a.whatMatters as Record<string, unknown> | undefined)?.headline)}
          </p>
        ))}
      </section>
      <section data-testid="package3-lifecycle">
        <h2>Lifecycle</h2>
        {state.lifecycle?.map(l => (
          <p key={String(l.lifecycleKey)}>
            SOL high_asset_dependency: {String(l.state)} ({String(l.occurrenceCount)})
          </p>
        ))}
      </section>
      <section data-testid="package3-timeline">
        <h2>Timeline</h2>
        {state.timeline?.map(t => (
          <p key={String(t.id)}>{String(t.title)}</p>
        ))}
      </section>
      <section data-testid="package3-preferences">
        <h2>Preferences</h2>
        {state.preferences?.map(p => (
          <p key={String(p.key)}>
            {String(p.key)}: {JSON.stringify(p.value)}
          </p>
        ))}
      </section>
    </div>
  );

  async function seedAndLoad() {
    await request('seed', { method: 'POST' });
    await load();
  }
}
