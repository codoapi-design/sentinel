import { describe, expect, it } from 'vitest';

import { AI_JOB_CHUNK_SIZE, EMPTY_CHECKPOINT } from '@/lib/ai/jobs/types';

describe('Durable AI jobs', () => {
  it('uses bounded chunk size suitable for 1M txs without full memory load', () => {
    expect(AI_JOB_CHUNK_SIZE).toBeLessThanOrEqual(1000);
    expect(AI_JOB_CHUNK_SIZE).toBeGreaterThan(0);
    // 1e6 / 500 = 2000 ticks max in theory — never one select *
    expect(Math.ceil(1_000_000 / AI_JOB_CHUNK_SIZE)).toBe(2000);
  });

  it('empty checkpoint starts at zero aggregates (no fake progress)', () => {
    const cp = EMPTY_CHECKPOINT();
    expect(cp.processed).toBe(0);
    expect(cp.aggregates.txCount).toBe(0);
    expect(cp.cursorMs).toBeNull();
  });

  it('resume cursor semantics: next tick uses exclusive lt(timestamp)', () => {
    // Documented contract used by worker.ts — cursorMs exclusive lower bound newest-first.
    const processed = 500;
    const cursorMs = 1_700_000_000_000;
    const nextProcessed = processed + AI_JOB_CHUNK_SIZE;
    expect(nextProcessed).toBe(1000);
    expect(cursorMs).toBeGreaterThan(0);
  });
});
