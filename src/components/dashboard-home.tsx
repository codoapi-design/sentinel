'use client';

import { useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Coins,
  Globe,
  Users,
  TrendingUp,
  ChartNoAxesCombined,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { PortfolioChart } from '@/components/portfolio-chart';
import { AssetsTab } from '@/components/assets-table';
import { NetworksTab } from '@/components/networks-section';
import { ClientsTab } from '@/components/clients-section';
import { TransactionsTab } from '@/components/transactions-table';
import { InvestmentReturnPage } from '@/components/investment-return-page';
import { TradingVolumePage } from '@/components/trading-volume-page';
import type { InvestmentReturnAssetParams } from '@/hooks/use-investment-return-asset';
import type { Client, Transaction } from '@/lib/mock-data';
import { useWalletStore } from '@/stores/wallet-store';
import { prefetchInvestmentReturnDetail } from '@/hooks/use-investment-return-detail';
import { prefetchTradingVolumeDetail } from '@/hooks/use-trading-volume-detail';

export type DashboardPanelId =
  | 'overview'
  | 'assets'
  | 'networks'
  | 'clients'
  | 'investment-return'
  | 'trading-volume'
  | 'transactions';

const DASHBOARD_PANELS: {
  id: DashboardPanelId;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'assets', label: 'Assets', shortLabel: 'Assets', icon: Coins },
  { id: 'networks', label: 'Networks', shortLabel: 'Network', icon: Globe },
  { id: 'clients', label: 'Clients', shortLabel: 'Clients', icon: Users },
  {
    id: 'investment-return',
    label: 'Investment Return',
    shortLabel: 'Return',
    icon: TrendingUp,
  },
  {
    id: 'trading-volume',
    label: 'Trading Volume',
    shortLabel: 'Volume',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'transactions',
    label: 'Transactions',
    shortLabel: 'Txns',
    icon: ArrowLeftRight,
  },
];

interface DashboardHomeProps {
  panel: DashboardPanelId;
  onPanelChange: (panel: DashboardPanelId) => void;
  clients: Client[];
  transactions: Transaction[];
  onSectionClick?: (section: string) => void;
  onAssetClick?: (assetId: string) => void;
  onNetworkClick?: (networkId: string) => void;
  onClientClick?: (identifier: string) => void;
  onDefineClient?: (address: string) => void;
  onClientsChange?: (clients: Client[]) => void;
  defineAddress?: string | null;
  onDefineConsumed?: () => void;
  onInvestmentReturnAssetClick?: (asset: InvestmentReturnAssetParams) => void;
}

function DashboardPanelTabs({
  panel,
  onPanelChange,
}: {
  panel: DashboardPanelId;
  onPanelChange: (panel: DashboardPanelId) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [panel]);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#08090a] to-transparent z-10 sm:hidden"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#08090a] to-transparent z-10 sm:hidden"
        aria-hidden
      />
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Dashboard sections"
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/5 bg-[#0f1011]/80 p-1 backdrop-blur-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {DASHBOARD_PANELS.map(item => {
          const Icon = item.icon;
          const isActive = panel === item.id;
          return (
            <button
              key={item.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onPanelChange(item.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200',
                isActive
                  ? 'bg-[#0052ff]/15 text-[#f7f8f8] shadow-[inset_0_0_0_1px_rgba(0,82,255,0.35)]'
                  : 'text-[#8a8f98] hover:bg-white/[0.04] hover:text-[#d0d6e0]',
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  isActive ? 'text-[#0052ff]' : 'text-[#8a8f98]',
                )}
              />
              <span className="hidden md:inline whitespace-nowrap">{item.label}</span>
              <span className="md:hidden whitespace-nowrap">{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardHome({
  panel,
  onPanelChange,
  clients,
  transactions,
  onSectionClick,
  onAssetClick,
  onNetworkClick,
  onClientClick,
  onDefineClient,
  onClientsChange,
  defineAddress,
  onDefineConsumed,
  onInvestmentReturnAssetClick,
}: DashboardHomeProps) {
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const prefetchedFor = useRef<string | null>(null);

  // Warm IR / TV caches while the user is still on Overview / other panels.
  useEffect(() => {
    if (!activeWalletId) return;
    const key = `${activeWalletId}:${lastSyncAt}`;
    if (prefetchedFor.current === key) return;
    prefetchedFor.current = key;
    prefetchInvestmentReturnDetail(activeWalletId);
    prefetchTradingVolumeDetail(activeWalletId);
  }, [activeWalletId, lastSyncAt]);

  return (
    <div className="space-y-6">
      <PortfolioOverview
        showSummaryCards={panel === 'overview'}
        onSectionClick={onSectionClick}
        tabs={<DashboardPanelTabs panel={panel} onPanelChange={onPanelChange} />}
      />

      <div role="tabpanel" className="min-h-[280px]">
        {panel === 'overview' && <PortfolioChart />}

        {panel === 'assets' && (
          <div className="space-y-6">
            <AssetsTab onAssetClick={onAssetClick} />
          </div>
        )}

        {panel === 'networks' && (
          <div className="space-y-6">
            <NetworksTab
              transactions={transactions}
              onNetworkClick={onNetworkClick || (() => {})}
            />
          </div>
        )}

        {panel === 'clients' && (
          <div className="space-y-6">
            <ClientsTab
              clients={clients}
              transactions={transactions}
              onClientClick={onClientClick || (() => {})}
              onDefineClient={onDefineClient}
              onClientsChange={onClientsChange}
              defineAddress={defineAddress}
              onDefineConsumed={onDefineConsumed}
            />
          </div>
        )}

        {panel === 'investment-return' && (
          <InvestmentReturnPage onAssetClick={onInvestmentReturnAssetClick} />
        )}

        {panel === 'trading-volume' && (
          <TradingVolumePage clients={clients} />
        )}

        {panel === 'transactions' && (
          <div className="space-y-6">
            <TransactionsTab clients={clients} transactions={transactions} />
          </div>
        )}
      </div>
    </div>
  );
}
