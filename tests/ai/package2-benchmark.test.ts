import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BENCHMARK_MATRIX_VERSION,
  getBenchmarkMatrixV1,
  runBenchmark,
} from '@/lib/ai/intelligence-quality/benchmark';

describe('Package 2 formal benchmark matrix', () => {
  const fixtures = getBenchmarkMatrixV1();

  it(`contains at least 35 fixtures (has ${fixtures.length})`, () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(35);
    const ids = new Set(fixtures.map(f => f.id));
    expect(ids.size).toBe(fixtures.length);
  });

  it('writes fixture index manifest', () => {
    const dir = join(process.cwd(), 'tests/fixtures/ai-intelligence-quality/v1');
    mkdirSync(dir, { recursive: true });
    const index = {
      version: BENCHMARK_MATRIX_VERSION,
      count: fixtures.length,
      categories: [...new Set(fixtures.map(f => f.category))],
      ids: fixtures.map(f => f.id),
    };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2));
    expect(index.count).toBeGreaterThanOrEqual(35);
  });

  it('meets all quality gates', () => {
    const report = runBenchmark();
    const failed = report.results.filter(r => !r.passed);
    if (failed.length) {
      // eslint-disable-next-line no-console
      console.log(
        'Failed fixtures:\n',
        failed.map(f => `${f.fixtureId}: ${f.failures.join('; ')}`).join('\n'),
      );
    }
    // eslint-disable-next-line no-console
    console.log('Benchmark metrics:', JSON.stringify(report.metrics, null, 2));
    // eslint-disable-next-line no-console
    console.log('Gates:', JSON.stringify(report.gates, null, 2));

    const outDir = join(process.cwd(), 'tests/fixtures/ai-intelligence-quality/v1');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'last-run-report.json'), JSON.stringify(report, null, 2));

    expect(report.allGatesPassed, `gates failed: ${JSON.stringify(report.gates)}`).toBe(true);
    expect(
      failed.length,
      failed.map(f => `${f.fixtureId}:${f.failures.join('|')}`).join(' || '),
    ).toBe(0);
  });
});
