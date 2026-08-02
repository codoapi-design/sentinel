import { describe, expect, it } from 'vitest';

import {
  analyzeAssets,
  analyzeFlow,
  analyzeNetworks,
  analyzePerformance,
  analyzePortfolio,
  analyzeRisk,
  analyzeTrading,
  analyzeCounterparties,
  type IntelligenceInput,
} from '@/lib/ai/intelligence';
import { attachNativeViaEnvelope } from './helpers/attach-evidence';

const NOW = Date.parse('2026-08-01T00:00:00.000Z');

function fixtureInput(): IntelligenceInput {
  return {
    now: NOW,
    periodDays: 30,
    portfolioValueUsd: 9260,
    assets: [
      { symbol: 'SOL', valueUsd: 368.42, quantity: 2, priceUsd: 184.21, network: 'solana' },
      { symbol: 'ETH', valueUsd: 8891.58, quantity: 2.5, priceUsd: 3556.63, network: 'ethereum' },
    ],
    clients: [],
    snapshots: [
      { date: '2026-07-01', value: 9000 },
      { date: '2026-08-01', value: 9260 },
    ],
    transactions: [
      {
        id: 'tx1',
        date: '2026-07-15',
        timestamp: NOW - 10 * 86400000,
        type: 'income',
        typeLabel: 'Income',
        activity: 'transfer_in',
        token: 'SOL',
        quantity: 1,
        price: 180,
        value: 180,
        network: 'solana',
        networkLabel: 'Solana',
        txHash: '0xabc',
        counterparty: '0xcounter',
        counterpartyLabel: 'Sender',
        valueUsd: 180,
      },
      {
        id: 'tx2',
        date: '2026-07-20',
        timestamp: NOW - 5 * 86400000,
        type: 'expense',
        typeLabel: 'Expense',
        activity: 'swap',
        token: 'ETH',
        quantity: 0.1,
        price: 3500,
        value: 350,
        network: 'ethereum',
        networkLabel: 'Ethereum',
        txHash: '0xdef',
        counterparty: '0xdex',
        counterpartyLabel: 'DEX',
        valueUsd: 350,
      },
    ],
  };
}

describe('Native evidence coverage by engine', () => {
  const input = fixtureInput();

  const cases = [
    ['portfolio', () => analyzePortfolio(input)],
    ['asset', () => analyzeAssets(input)],
    ['performance', () => analyzePerformance(input)],
    ['flow', () => analyzeFlow(input)],
    ['trading', () => analyzeTrading(input)],
    ['network', () => analyzeNetworks(input)],
    ['counterparty', () => analyzeCounterparties(input)],
    ['risk', () => analyzeRisk(input)],
  ] as const;

  for (const [engine, run] of cases) {
    it(`${engine} emits at least one finding with native sourceRefs`, () => {
      const result = run();
      const findings = attachNativeViaEnvelope(engine, result.insights);
      expect(findings.length).toBeGreaterThan(0);
      const withRefs = findings.filter(f => (f.sourceRefs?.length ?? 0) > 0);
      expect(withRefs.length).toBeGreaterThan(0);
      expect(withRefs[0].engineVersion).toBeTruthy();
      expect(withRefs[0].sourceRefs!.some(r => r.type === 'calculation' || r.type === 'aggregate' || r.type === 'asset_position')).toBe(true);
    });
  }
});
