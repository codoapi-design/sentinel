/**
 * HTTP-level Package 3 memory route tests (auth mocked, in-memory store).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetMemoryStoreForTests, upsertExplicitPreference, createConversation } from '@/lib/ai/memory';

const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createCookieServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
  createServerClient: () => ({}),
}));

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WALLET = '11111111-1111-4111-8111-111111111111';

describe('Package 3 memory HTTP routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryStoreForTests();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  });

  it('rejects unauthenticated preference reads', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import('@/app/api/ai/preferences/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('upserts and lists explicit preferences', async () => {
    const { GET, PUT } = await import('@/app/api/ai/preferences/route');
    const putRes = await PUT(
      new Request('http://localhost/api/ai/preferences', {
        method: 'PUT',
        body: JSON.stringify({ key: 'response_style', value: 'concise' }),
      }) as never,
    );
    expect(putRes.status).toBe(200);
    const list = await GET();
    const body = await list.json();
    expect(body.data.some((p: { key: string }) => p.key === 'response_style')).toBe(true);
  });

  it('creates and loads conversations for the owner', async () => {
    const { POST, GET } = await import('@/app/api/ai/conversations/route');
    const created = await POST(
      new Request('http://localhost/api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, title: 'Test' }),
      }) as never,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const list = await GET();
    const listBody = await list.json();
    expect(listBody.data.some((c: { id: string }) => c.id === createdBody.data.id)).toBe(true);
  });

  it('exports and deletes wallet AI history', async () => {
    await createConversation({ userId: USER, walletId: WALLET, title: 'Wipe me' });
    await upsertExplicitPreference({
      userId: USER,
      key: 'language',
      value: 'en',
    });

    const { GET: exportGet } = await import('@/app/api/ai/history/export/route');
    const exported = await exportGet(
      new Request(`http://localhost/api/ai/history/export?walletId=${WALLET}`) as never,
    );
    expect(exported.status).toBe(200);
    const exportBody = await exported.json();
    expect(exportBody.data.conversations.length).toBeGreaterThan(0);

    const { POST: deletePost } = await import('@/app/api/ai/history/delete/route');
    const deleted = await deletePost(
      new Request('http://localhost/api/ai/history/delete', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET }),
      }) as never,
    );
    expect(deleted.status).toBe(200);
  });

  it('lists empty analyses for a wallet without 500', async () => {
    const { GET } = await import('@/app/api/ai/analyses/route');
    const res = await GET(
      new Request(`http://localhost/api/ai/analyses?walletId=${WALLET}`) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
