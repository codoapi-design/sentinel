import { describe, expect, it } from 'vitest';

import {
  intersectPeriodWithEntitlement,
  resolveAiHistoryEntitlement,
} from '@/lib/ai/trust/entitlements';

describe('Subscription history entitlements', () => {
  it('allows period inside free plan window', () => {
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const ent = resolveAiHistoryEntitlement({ plan: 'free', now });
    const hit = intersectPeriodWithEntitlement(
      {
        from: '2026-07-20T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      },
      ent,
    );
    expect(hit.denied).toBe(false);
    expect(hit.clipped).toBe(false);
  });

  it('clips partially allowed period for starter', () => {
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const ent = resolveAiHistoryEntitlement({ plan: 'starter', now });
    const hit = intersectPeriodWithEntitlement(
      {
        from: '2024-01-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      },
      ent,
    );
    expect(hit.denied).toBe(false);
    expect(hit.clipped).toBe(true);
    expect(Date.parse(hit.from)).toBeGreaterThanOrEqual(Date.parse(ent.allowedFrom!));
  });

  it('denies period with no overlap', () => {
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const ent = resolveAiHistoryEntitlement({ plan: 'free', now });
    const hit = intersectPeriodWithEntitlement(
      {
        from: '2020-01-01T00:00:00.000Z',
        to: '2020-02-01T00:00:00.000Z',
      },
      ent,
    );
    expect(hit.denied).toBe(true);
  });

  it('pro/business get full-history premium entitlement', () => {
    const pro = resolveAiHistoryEntitlement({ plan: 'pro' });
    const biz = resolveAiHistoryEntitlement({ plan: 'enterprise' });
    expect(pro.fullHistoryPermitted).toBe(true);
    expect(pro.asyncFullHistoryAvailable).toBe(true);
    expect(biz.fullHistoryPermitted).toBe(true);
    expect(biz.asyncFullHistoryAvailable).toBe(true);
    expect(resolveAiHistoryEntitlement({ plan: 'free' }).asyncFullHistoryAvailable).toBe(false);
  });

  it('client cannot bypass by requesting unbounded window on free', () => {
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const ent = resolveAiHistoryEntitlement({ plan: 'free', now });
    const hit = intersectPeriodWithEntitlement(
      { from: '1970-01-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
      ent,
    );
    expect(hit.clipped).toBe(true);
    expect(hit.from).toBe(ent.allowedFrom);
  });
});
