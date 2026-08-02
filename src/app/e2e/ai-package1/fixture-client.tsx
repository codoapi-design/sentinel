'use client';

/**
 * Controlled fixture client for Package 1 E2E.
 * Playwright intercepts /api/ai/* — this page only hosts production UI components.
 */

import { useEffect } from 'react';
import { AIAnalysisSection } from '@/components/ai-analysis-section';
import { AIChat } from '@/components/ai-chat';
import { useWalletStore } from '@/stores/wallet-store';

const FIXTURE_WALLET_ID = '11111111-1111-4111-8111-111111111111';

export function Package1E2eFixture() {
  useEffect(() => {
    useWalletStore.setState({
      activeWalletId: FIXTURE_WALLET_ID,
      wallets: [
        {
          id: FIXTURE_WALLET_ID,
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          solanaAddress: null,
          tronAddress: null,
          bitcoinAddress: null,
          displayAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          label: 'E2E Fixture Wallet',
          lastSyncedAt: null,
          isSyncing: false,
          transactionCount: 0,
        },
      ],
    });
  }, []);

  return (
    <div className="space-y-10 max-w-3xl">
      <section data-testid="e2e-analyze-section">
        <h2 className="text-sm font-medium mb-3">Analyze (asset detail fixture)</h2>
        <AIAnalysisSection
          walletId={FIXTURE_WALLET_ID}
          sectionType="asset"
          sectionTitle="SOL"
          asset="SOL"
          page="asset-detail"
          assets={[
            {
              symbol: 'SOL',
              name: 'Solana',
              balance: 10,
              valueUsd: 4200,
              allocationPct: 42,
            },
          ]}
          portfolioValueUsd={10_000}
        />
      </section>

      <section data-testid="e2e-chat-section">
        <h2 className="text-sm font-medium mb-3">Chat fixture</h2>
        <AIChat
          pageContext={{
            sectionType: 'portfolio',
            page: 'dashboard',
          }}
        />
      </section>
    </div>
  );
}
