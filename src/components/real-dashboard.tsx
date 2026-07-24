'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { PortfolioOverview } from './portfolio-overview';
import { PortfolioChart } from './portfolio-chart';
import { AssetsTable } from './assets-table';
import { TransactionsTable } from './transactions-table';
import { TelegramSettings } from './telegram-settings';
import { EmailSettings } from './email-settings';
import { PricingPage } from './pricing';
import { WebhooksSettings } from './webhooks-settings';
import { TaxAnalysis } from './tax-analysis';
import { ApiAccess } from './api-access';
import { SupportCenter } from './support-center';
import { AIChat } from './ai-chat';
import { AIAnalysisSection, type AnalysisResponse } from './ai-analysis-section';
import { SectionPage } from './section-page';
import { InvestmentReturnPage } from './investment-return-page';
import { InvestmentReturnAssetPage } from './investment-return-asset-page';
import type { InvestmentReturnAssetParams } from '@/hooks/use-investment-return-asset';
import { TradingVolumePage } from './trading-volume-page';
import { AssetDetailPage } from './asset-detail-page';
import { ClientsSection } from './clients-section';
import { ClientDetailPage } from './client-detail-page';
import { NetworksSection } from './networks-section';
import { NetworkDetailPage } from './network-detail-page';
import { TypesSection } from './types-section';
import { TypeDetailPage } from './type-detail-page';
import { WalletBar } from './wallet-bar';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2, RefreshCw, BarChart3, Shield, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useWalletStore } from '@/stores/wallet-store';
import { useAIStore } from '@/stores/ai-store';
import { useWalletAutoSync } from '@/hooks/use-wallet-auto-sync';
import { useAuth } from '@/lib/auth-context';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import { filterVisibleTransactions } from '@/lib/finance/visibility';

/**
 * RealDashboard - Dashboard for authenticated users.
 *
 * KEY DIFFERENCES from demo:
 * - No mock data. If no wallets, shows empty state with "Add Wallet" CTA.
 * - All data comes from real wallet connections via blockchain APIs.
 * - User info comes from Supabase Auth session.
 * - No demo banner.
 */
export function RealDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [investmentReturnAsset, setInvestmentReturnAsset] =
    useState<InvestmentReturnAssetParams | null>(null);
  const [activeAsset, setActiveAsset] = useState<string | null>(null);
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [defineAddressTrigger, setDefineAddressTrigger] = useState<string | null>(null);

  // AI Analysis state
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  const router = useRouter();
  const { user, signOut } = useAuth();

  // Wallet store
  const {
    wallets,
    activeWalletId,
    isSyncing,
    isLoadingWallets,
    syncWallet,
    loadWalletsFromDB,
    loadTransactionsFromDB,
    getActiveWallet,
    getActiveTransactions,
    getActiveClients,
    currentPlan,
  } = useWalletStore();

  // Auto-sync hook
  const { triggerSync } = useWalletAutoSync();

  // AI store
  const { setCurrentPage, setCurrentPlan: setAIPlan } = useAIStore();

  // Load wallets from DB, then hydrate transactions from DB.
  // Only run a provider sync if this wallet has never been synced.
  useEffect(() => {
    loadWalletsFromDB();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(activeTab);
  }, [activeTab, setCurrentPage]);

  useEffect(() => {
    setAIPlan(currentPlan);
  }, [currentPlan, setAIPlan]);

  // Get active wallet data
  const activeWallet = getActiveWallet();
  const transactions = getActiveTransactions();
  const clients = getActiveClients();
  const isAnySyncing = Object.values(isSyncing).some(Boolean);
  const hasWallets = wallets.length > 0;
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);

  // IMPORTANT: Real dashboard NEVER uses mock data.
  // If no wallets, show empty state. If wallet exists but no transactions, show loading or empty.
  // Spam / $0 dust hidden by default (toggle shared with Assets & Transactions headers).
  const displayTransactions = useMemo(
    () => filterVisibleTransactions(transactions, showSpamAndDust),
    [transactions, showSpamAndDust],
  );
  const displayClients = clients;

  // DB-first hydrate: read stored txs immediately; sync providers only when never synced.
  useEffect(() => {
    if (!activeWalletId || isLoadingWallets) return;

    let cancelled = false;
    (async () => {
      await loadTransactionsFromDB(activeWalletId);
      if (cancelled) return;

      const wallet = useWalletStore.getState().wallets.find(w => w.id === activeWalletId);
      if (wallet && !wallet.lastSyncedAt) {
        // First-time ingest into the database
        await syncWallet(activeWalletId, 'full');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWalletId, isLoadingWallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    toast.success('Logged out successfully');
    await signOut();
    router.push('/');
  };

  const handleSectionClick = (section: string) => {
    setActiveSection(section);
    setInvestmentReturnAsset(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleAssetClick = (assetId: string) => {
    setActiveAsset(assetId);
    setActiveSection(null);
    setInvestmentReturnAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleClientClick = (identifier: string) => {
    setActiveClient(identifier);
    setActiveSection(null);
    setInvestmentReturnAsset(null);
    setActiveAsset(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleNetworkClick = (networkId: string) => {
    setActiveNetwork(networkId);
    setActiveSection(null);
    setInvestmentReturnAsset(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveType(null);
  };

  const handleTypeClick = (typeId: string) => {
    setActiveType(typeId);
    setActiveSection(null);
    setInvestmentReturnAsset(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
  };

  const handleInvestmentReturnAssetClick = (asset: InvestmentReturnAssetParams) => {
    setInvestmentReturnAsset(asset);
    setActiveSection('investment-return-asset');
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleBackFromSection = () => {
    setActiveSection(null);
    setInvestmentReturnAsset(null);
  };
  const handleBackFromInvestmentReturnAsset = () => {
    setInvestmentReturnAsset(null);
    setActiveSection('investment-return');
  };
  const handleBackFromAsset = () => setActiveAsset(null);
  const handleBackFromClient = () => setActiveClient(null);
  const handleBackFromNetwork = () => setActiveNetwork(null);
  const handleBackFromType = () => setActiveType(null);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSection(null);
    setInvestmentReturnAsset(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleDefineClient = (address: string) => {
    setDefineAddressTrigger(address);
  };

  const handleDefineConsumed = () => {
    setDefineAddressTrigger(null);
  };

  // Get user initials for avatar
  const userInitial = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || 'U';
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  // Trigger AI analysis
  const handleAnalyzeData = useCallback(async () => {
    if (!hasWallets || displayTransactions.length === 0) {
      toast.error('Add a wallet with transactions to use AI analysis');
      return;
    }

    setIsAnalysisLoading(true);
    setShowAnalysis(true);
    setAnalysisResult(null);

    try {
      const txs = displayTransactions;
      const values = txs.map(tx => tx.value || 0);
      const totalValue = values.reduce((sum, v) => sum + v, 0);
      const avgValue = values.length > 0 ? totalValue / values.length : 0;
      const summaryStats = {
        totalValue: Math.round(totalValue * 100) / 100,
        avgValue: Math.round(avgValue * 100) / 100,
        maxValue: values.length > 0 ? Math.round(Math.max(...values) * 100) / 100 : 0,
        minValue: values.length > 0 ? Math.round(Math.min(...values) * 100) / 100 : 0,
        count: txs.length,
      };

      const byDateMap: Record<string, number> = {};
      txs.forEach(tx => {
        const date = (tx.date || '').slice(0, 10);
        byDateMap[date] = (byDateMap[date] || 0) + (tx.value || 0);
      });
      const byDate = Object.entries(byDateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));

      const byTokenMap: Record<string, number> = {};
      txs.forEach(tx => {
        const token = tx.token || 'UNKNOWN';
        byTokenMap[token] = (byTokenMap[token] || 0) + (tx.value || 0);
      });
      const byToken = Object.entries(byTokenMap)
        .sort(([, a], [, b]) => b - a)
        .map(([token, value]) => ({ token, value: Math.round(value * 100) / 100 }));

      const byNetworkMap: Record<string, number> = {};
      txs.forEach(tx => {
        const network = tx.networkLabel || tx.network || 'Unknown';
        byNetworkMap[network] = (byNetworkMap[network] || 0) + (tx.value || 0);
      });
      const byNetwork = Object.entries(byNetworkMap)
        .sort(([, a], [, b]) => b - a)
        .map(([network, value]) => ({ network, value: Math.round(value * 100) / 100 }));

      const byCounterpartyMap: Record<string, number> = {};
      txs.forEach(tx => {
        const label = tx.counterpartyLabel || tx.counterparty || 'Unknown';
        byCounterpartyMap[label] = (byCounterpartyMap[label] || 0) + (tx.value || 0);
      });
      const byCounterparty = Object.entries(byCounterpartyMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));

      const context = {
        userId: user?.id || 'unknown',
        plan: currentPlan,
        page: activeTab,
        sectionType: activeSection || 'revenue',
      };

      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          transactions: txs.slice(0, 50),
          summaryStats,
          groupedData: { byDate, byToken, byNetwork, byCounterparty },
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setAnalysisResult(result.data as AnalysisResponse);
      } else {
        throw new Error(result.error || 'Data analysis failed');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalysisResult(null);
    } finally {
      setIsAnalysisLoading(false);
    }
  }, [displayTransactions, currentPlan, activeTab, activeSection, hasWallets, user?.id]);

  const handleCloseAnalysis = useCallback(() => {
    setShowAnalysis(false);
    setAnalysisResult(null);
    setIsAnalysisLoading(false);
  }, []);

  const getHeaderTitle = () => {
    if (activeType) {
      const typeLabels: Record<string, string> = {
        income: 'Income', expense: 'Expense', trade: 'Trade',
        defi: 'DeFi', staking: 'Staking Reward', gas: 'Gas Fees',
      };
      return `${typeLabels[activeType] || activeType} Details`;
    }
    if (activeNetwork) {
      const networks = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc'];
      const net = networks.find(n => n === activeNetwork);
      return `${net || activeNetwork} Details`;
    }
    if (activeClient) return 'Client Details';
    if (activeAsset) return `${activeAsset.toUpperCase()} Details`;
    if (activeSection) {
      switch (activeSection) {
        case 'revenue': return 'Inflow';
        case 'expenses': return 'Outflow';
        case 'flow': return 'Net Flow';
        case 'gas': return 'Gas Fees';
        case 'investment-return': return 'Investment Return';
        case 'investment-return-asset':
          return investmentReturnAsset
            ? `${investmentReturnAsset.symbol} Return`
            : 'Asset Return';
        case 'trading-volume': return 'Trading Volume';
        default: return '';
      }
    }
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'transactions': return 'Transactions';
      case 'assets': return 'Assets';
      case 'clients': return 'Clients';
      case 'networks': return 'Networks';
      case 'types': return 'Types';
      case 'settings': return 'Settings';
      case 'webhooks': return 'Webhooks';
      case 'tax': return 'Tax Analysis';
      case 'api': return 'API Access';
      case 'support': return 'Support';
      case 'subscription': return 'Subscription';
      default: return '';
    }
  };

  const renderContent = () => {
    // Empty state: no wallets connected
    if (!hasWallets) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 bg-[#0052ff]/10 rounded-2xl flex items-center justify-center mb-6">
            <Wallet className="w-10 h-10 text-[#0052ff]" />
          </div>
          <h2 className="text-2xl font-bold text-[#f7f8f8] mb-2">Add your first wallet</h2>
          <p className="text-[#8a8f98] text-center max-w-md mb-8">
            Connect your crypto wallet to automatically fetch and classify your on-chain transactions
            across multiple networks.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mb-8 w-full">
            {[
              { icon: '🔗', title: 'Connect', desc: 'Add your wallet address' },
              { icon: '📊', title: 'Track', desc: 'Auto-classify transactions' },
              { icon: '🧠', title: 'Analyze', desc: 'AI-powered insights' },
            ].map((step, i) => (
              <div key={i} className="bg-[#0f1011] border border-white/5 rounded-xl p-4 text-center">
                <div className="text-2xl mb-2">{step.icon}</div>
                <h3 className="text-sm font-medium text-[#f7f8f8] mb-1">{step.title}</h3>
                <p className="text-[10px] text-[#8a8f98]">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#8a8f98]">
            Supports Ethereum, Base, Arbitrum, Optimism, Polygon, and BSC
          </p>
        </div>
      );
    }

    // Has wallets but no transactions yet (still syncing)
    if (hasWallets && displayTransactions.length === 0) {
      if (isAnySyncing) {
        return (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 bg-[#0f1011] border border-white/5 rounded-xl px-8 py-6">
              <Loader2 className="h-8 w-8 text-[#0052ff] animate-spin" />
              <span className="text-sm text-[#d0d6e0]">Fetching transactions from blockchain...</span>
              <span className="text-xs text-[#8a8f98]">This may take a moment for the first sync</span>
            </div>
          </div>
        );
      }

      // Wallet connected but no transactions found
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 bg-[#28282c] rounded-2xl flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-[#8a8f98]" />
          </div>
          <h3 className="text-lg font-medium text-[#f7f8f8] mb-2">No transactions found</h3>
          <p className="text-[#8a8f98] text-center text-sm max-w-md mb-4">
            Your wallet is connected but no transactions were found on the scanned networks.
            Try adding another wallet or refreshing.
          </p>
          <Button
            variant="outline"
            className="rounded-full border-white/10 text-[#d0d6e0] hover:bg-[#191a1b]"
            onClick={() => void triggerSync()}
            disabled={isAnySyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isAnySyncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      );
    }

    // Has wallets and transactions - show full dashboard content
    if (activeType) {
      return <TypeDetailPage typeId={activeType} onBack={handleBackFromType} />;
    }

    if (activeNetwork) {
      return <NetworkDetailPage networkId={activeNetwork} onBack={handleBackFromNetwork} />;
    }

    if (activeClient) {
      const clientObj = displayClients.find(c => c.id === activeClient || c.address.toLowerCase() === activeClient.toLowerCase());
      if (clientObj) {
        return (
          <ClientDetailPage
            client={clientObj}
            onBack={handleBackFromClient}
            onDefineClient={handleDefineClient}
          />
        );
      }
    }

    if (activeAsset) {
      return (
        <AssetDetailPage
          assetId={activeAsset}
          onBack={handleBackFromAsset}
          clients={displayClients}
        />
      );
    }

    if (activeSection === 'investment-return-asset' && investmentReturnAsset) {
      return (
        <InvestmentReturnAssetPage
          asset={investmentReturnAsset}
          onBack={handleBackFromInvestmentReturnAsset}
        />
      );
    }

    if (activeSection === 'investment-return') {
      return (
        <InvestmentReturnPage
          onBack={handleBackFromSection}
          onAssetClick={handleInvestmentReturnAssetClick}
        />
      );
    }

    if (activeSection === 'trading-volume') {
      return <TradingVolumePage onBack={handleBackFromSection} />;
    }

    if (activeSection) {
      return (
        <SectionPage
          sectionType={activeSection as 'revenue' | 'expenses' | 'flow' | 'gas'}
          onBack={handleBackFromSection}
          clients={displayClients}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <PortfolioOverview onSectionClick={handleSectionClick} />
            <PortfolioChart />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <AssetsTable onAssetClick={handleAssetClick} />
            </div>
            <ClientsSection
              clients={displayClients}
              transactions={displayTransactions}
              onClientClick={handleClientClick}
            />
            <NetworksSection
              transactions={displayTransactions}
              onNetworkClick={handleNetworkClick}
            />
            <TypesSection
              transactions={displayTransactions}
              onTypeClick={handleTypeClick}
            />
            <TransactionsTable clients={displayClients} transactions={displayTransactions} />
          </div>
        );
      case 'transactions':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Transactions</h2>
              <p className="text-sm text-[#8a8f98]">View and filter all your transactions</p>
            </div>
            <TransactionsTable clients={displayClients} transactions={displayTransactions} />
          </div>
        );
      case 'assets':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Assets</h2>
              <p className="text-sm text-[#8a8f98]">Details of all your digital assets</p>
            </div>
            <PortfolioOverview onSectionClick={handleSectionClick} />
            <AssetsTable onAssetClick={handleAssetClick} />
            <ClientsSection
              clients={displayClients}
              transactions={displayTransactions}
              onClientClick={handleClientClick}
            />
          </div>
        );
      case 'clients':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Clients</h2>
              <p className="text-sm text-[#8a8f98]">All wallets you&apos;ve interacted with</p>
            </div>
            <ClientsSection
              clients={displayClients}
              transactions={displayTransactions}
              onClientClick={handleClientClick}
              onDefineClient={handleDefineClient}
              onClientsChange={(newClients) => {
                if (activeWalletId) {
                  useWalletStore.getState().setClients(activeWalletId, newClients);
                }
              }}
              showToolbar={true}
              defineAddress={defineAddressTrigger}
              onDefineConsumed={handleDefineConsumed}
            />
          </div>
        );
      case 'networks':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Networks</h2>
              <p className="text-sm text-[#8a8f98]">All networks you&apos;ve transacted on</p>
            </div>
            <NetworksSection
              transactions={displayTransactions}
              onNetworkClick={handleNetworkClick}
            />
          </div>
        );
      case 'types':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Transaction Types</h2>
              <p className="text-sm text-[#8a8f98]">All transaction types and details</p>
            </div>
            <TypesSection
              transactions={displayTransactions}
              onTypeClick={handleTypeClick}
            />
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Settings</h2>
              <p className="text-sm text-[#8a8f98]">Alert and notification settings</p>
            </div>
            <TelegramSettings />
            <EmailSettings />
          </div>
        );
      case 'webhooks':
        return (
          <div className="space-y-6">
            <WebhooksSettings />
          </div>
        );
      case 'tax':
        return (
          <div className="space-y-6">
            <TaxAnalysis />
          </div>
        );
      case 'api':
        return (
          <div className="space-y-6">
            <ApiAccess />
          </div>
        );
      case 'support':
        return (
          <div className="space-y-6">
            <SupportCenter />
          </div>
        );
      case 'subscription':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Subscription</h2>
              <p className="text-sm text-[#8a8f98]">Manage your plan and payment methods</p>
            </div>
            <PricingPage />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#08090a] text-[#f7f8f8]" dir="ltr">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} isDemo={false} userName={userName} userInitial={userInitial} />

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-[#08090a]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3 pl-12 lg:pl-0">
            <h1 className="text-sm font-medium text-[#d0d6e0]">
              {getHeaderTitle()}
            </h1>
            {activeWallet && isAnySyncing && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#0052ff]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
            {hasWallets && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5"
                onClick={() => void triggerSync()}
                disabled={isAnySyncing}
                title="Sync from blockchain"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isAnySyncing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WalletBar />
            <Button
              variant="ghost"
              size="sm"
              className="text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b] text-xs"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Exit
            </Button>
          </div>
        </header>

        {/* Content area */}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* AI Chat */}
      {hasWallets && <AIChat />}

      {/* Analyze Data floating button */}
      {hasWallets && displayTransactions.length > 0 && !showAnalysis && (
        <button
          onClick={handleAnalyzeData}
          className="fixed bottom-6 left-6 z-50 group"
          title="Analyze data with AI"
        >
          <div className="w-14 h-14 bg-[#191a1b] hover:bg-[#28282c] border border-white/10 rounded-full shadow-lg flex items-center justify-center text-[#0052ff] transition-all duration-300 hover:scale-105 hover:border-[#0052ff]/30">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 bg-[#191a1b] border border-white/10 rounded-lg text-xs text-[#d0d6e0] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Analyze with AI
          </div>
        </button>
      )}

      {/* AI Analysis Overlay */}
      {showAnalysis && (
        <AIAnalysisSection
          analysis={analysisResult}
          isLoading={isAnalysisLoading}
          onClose={handleCloseAnalysis}
          isOverlay={true}
          sectionTitle={activeSection
            ? activeSection === 'revenue'
              ? 'Inflow'
              : activeSection === 'expenses'
                ? 'Outflow'
                : activeSection === 'flow'
                  ? 'Net Flow'
                  : activeSection === 'investment-return' ||
                      activeSection === 'investment-return-asset'
                    ? 'Investment Return'
                    : activeSection === 'trading-volume'
                      ? 'Trading Volume'
                      : 'Gas Fees'
            : undefined
          }
          sectionType={
            activeSection === 'investment-return' ||
            activeSection === 'investment-return-asset' ||
            activeSection === 'trading-volume'
              ? undefined
              : (activeSection || undefined)
          }
        />
      )}
    </div>
  );
}
