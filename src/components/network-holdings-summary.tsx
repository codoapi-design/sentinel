'use client';

import { useMemo } from 'react';
import { usePortfolio, type PortfolioToken } from '@/hooks/use-portfolio';
import { CHAIN_IDS, CHAIN_NAMES } from '@/lib/blockchain/types';
import { filterVisibleAssets } from '@/lib/finance/visibility';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  formatCompactUsd,
  holdingColorAt,
  type NetworkHoldingSlice,
} from './network-holdings-distribution';
import { NetworkHoldingsDonut } from './network-holdings-donut';

const MAX_ASSET_CHIPS = 4;

interface NetworkHoldingsSummaryProps {
  networkId: string;
  networkLabel: string;
}

function tokenMatchesNetwork(token: PortfolioToken, networkId: string): boolean {
  const id = networkId.toLowerCase().trim();
  const chain = (token.chain || '').toLowerCase().trim();

  if (chain && chain === id) return true;

  const expectedChainId = CHAIN_IDS[id];
  if (expectedChainId != null && token.chainId === expectedChainId) return true;

  if (token.chainId != null) {
    const nameFromId = CHAIN_NAMES[token.chainId]?.toLowerCase();
    if (nameFromId && nameFromId === id) return true;
  }

  return false;
}

function formatUsdFull(value: number): string {
  return (
    '$' +
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function aggregateBySymbol(tokens: PortfolioToken[]): NetworkHoldingSlice[] {
  const map = new Map<string, NetworkHoldingSlice>();

  for (const t of tokens) {
    const symbol = (t.symbol || 'Unknown').trim() || 'Unknown';
    const prev = map.get(symbol);
    if (prev) {
      prev.balance += t.balance || 0;
      prev.valueUsd += t.valueUsd || 0;
    } else {
      map.set(symbol, {
        symbol,
        balance: t.balance || 0,
        valueUsd: t.valueUsd || 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.valueUsd - a.valueUsd);
}

/**
 * Slim holdings strip for Network Details — live positions on this chain only.
 */
export function NetworkHoldingsSummary({
  networkId,
  networkLabel,
}: NetworkHoldingsSummaryProps) {
  const { portfolio } = usePortfolio();
  const showSpamAndDust = useUiPreferencesStore(s => s.showSpamAndDust);

  const holdings = useMemo(() => {
    const raw = (portfolio?.tokens || []).filter(t =>
      tokenMatchesNetwork(t, networkId),
    );
    const visible = filterVisibleAssets(raw, showSpamAndDust);
    return aggregateBySymbol(visible);
  }, [portfolio?.tokens, networkId, showSpamAndDust]);

  const totalUsd = useMemo(
    () => holdings.reduce((s, h) => s + (h.valueUsd || 0), 0),
    [holdings],
  );

  /** Ranked positive holdings — color index matches donut slice ranks */
  const rankedForLine = useMemo(
    () => holdings.filter(h => (h.valueUsd || 0) > 0),
    [holdings],
  );

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#8a8f98] mb-1">
            Holdings on {networkLabel}
          </p>
          <p className="text-2xl sm:text-3xl font-semibold text-[#f7f8f8] font-mono-num tracking-tight leading-none">
            {formatUsdFull(totalUsd)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#8a8f98] mt-2 leading-snug truncate">
            {rankedForLine.length === 0 ? (
              'No assets on this network'
            ) : (
              <>
                {rankedForLine.slice(0, MAX_ASSET_CHIPS).map((h, i) => (
                  <span key={h.symbol}>
                    {i > 0 && <span className="text-[#8a8f98]"> · </span>}
                    <span
                      className="font-medium"
                      style={{ color: holdingColorAt(i) }}
                    >
                      {h.symbol}
                    </span>{' '}
                    <span className="text-[#d0d6e0] font-mono-num">
                      {formatCompactUsd(h.valueUsd)}
                    </span>
                  </span>
                ))}
                {rankedForLine.length > MAX_ASSET_CHIPS && (
                  <span className="text-[#8a8f98]">
                    {' '}
                    · +{rankedForLine.length - MAX_ASSET_CHIPS} more
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        <NetworkHoldingsDonut holdings={holdings} size={136} />
      </div>
    </div>
  );
}
