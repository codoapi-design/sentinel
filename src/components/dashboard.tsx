'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { AssetDetailPage } from './asset-detail-page';
import { ClientsSection } from './clients-section';
import { ClientDetailPage } from './client-detail-page';
import { NetworksSection } from './networks-section';
import { NetworkDetailPage } from './network-detail-page';
import { TypesSection } from './types-section';
import { TypeDetailPage } from './type-detail-page';
import { WalletBar } from './wallet-bar';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2, RefreshCw, BarChart3, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { networks, type Client } from '@/lib/mock-data';
import { useWalletStore } from '@/stores/wallet-store';
import { useAIStore } from '@/stores/ai-store';
import { useWalletAutoSync } from '@/hooks/use-wallet-auto-sync';

interface DashboardProps {
  onLogout: () => void;
  isDemo?: boolean;
}

export function Dashboard({ onLogout, isDemo }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<string | null>(null);
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [defineAddressTrigger, setDefineAddressTrigger] = useState<string | null>(null);

  // AI Analysis state
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  // Wallet store
  const {
    wallets,
    activeWalletId,
    isSyncing,
    isLoadingWallets,
    syncWallet,
    loadTransactionsFromDB,
    getActiveWallet,
    getActiveTransactions,
    getActiveClients,
    currentPlan,
  } = useWalletStore();

  // Auto-sync hook (checks every 60 seconds on Pro)
  const { triggerSync } = useWalletAutoSync();

  // AI store
  const { setCurrentPage, setCurrentPlan: setAIPlan } = useAIStore();

  // Sync AI store
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

  // No mock data anywhere: always use the real active-wallet data. In demo mode
  // (no wallet) these are simply empty, so every section shows its empty state.
  const displayTransactions = transactions;
  const displayClients = clients;

  // DB-first: hydrate from Supabase, sync providers only on first-ever sync
  useEffect(() => {
    if (isDemo || !activeWalletId || isLoadingWallets) return;

    let cancelled = false;
    (async () => {
      await loadTransactionsFromDB(activeWalletId);
      if (cancelled) return;

      const wallet = useWalletStore.getState().wallets.find(w => w.id === activeWalletId);
      if (wallet && !wallet.lastSyncedAt) {
        await syncWallet(activeWalletId, 'full');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDemo, activeWalletId, isLoadingWallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    toast.success('Logged out successfully');
    onLogout();
  };

  const handleSectionClick = (section: string) => {
    setActiveSection(section);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleAssetClick = (assetId: string) => {
    setActiveAsset(assetId);
    setActiveSection(null);
    setActiveClient(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleClientClick = (identifier: string) => {
    setActiveClient(identifier);
    setActiveSection(null);
    setActiveAsset(null);
    setActiveNetwork(null);
    setActiveType(null);
  };

  const handleNetworkClick = (networkId: string) => {
    setActiveNetwork(networkId);
    setActiveSection(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveType(null);
  };

  const handleTypeClick = (typeId: string) => {
    setActiveType(typeId);
    setActiveSection(null);
    setActiveAsset(null);
    setActiveClient(null);
    setActiveNetwork(null);
  };

  const handleBackFromSection = () => setActiveSection(null);
  const handleBackFromAsset = () => setActiveAsset(null);
  const handleBackFromClient = () => setActiveClient(null);
  const handleBackFromNetwork = () => setActiveNetwork(null);
  const handleBackFromType = () => setActiveType(null);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSection(null);
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

  // Trigger AI analysis
  const handleAnalyzeData = useCallback(async () => {
    setIsAnalysisLoading(true);
    setShowAnalysis(true);
    setAnalysisResult(null);

    try {
      const txs = displayTransactions;
      if (txs.length === 0) {
        throw new Error('No transactions to analyze');
      }

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
        userId: isDemo ? 'demo-user' : 'user-session',
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
  }, [displayTransactions, currentPlan, activeTab, activeSection, isDemo]);

  const handleCloseAnalysis = useCallback(() => {
    setShowAnalysis(false);
    setAnalysisResult(null);
    setIsAnalysisLoading(false);
  }, []);

  const getActiveClientObj = (): Client | null => {
    if (!activeClient) return null;
    const clientById = displayClients.find(c => c.id === activeClient);
    if (clientById) return clientById;
    const clientByAddress = displayClients.find(c => c.address.toLowerCase() === activeClient.toLowerCase());
    if (clientByAddress) return clientByAddress;
    if (activeClient.startsWith('0x')) {
      const tx = displayTransactions.find(t => t.counterparty.toLowerCase() === activeClient!.toLowerCase());
      const truncateAddr = `${activeClient.slice(0, 6)}...${activeClient.slice(-4)}`;
      return {
        id: `addr-${activeClient}`,
        name: tx?.counterpartyLabel || truncateAddr,
        address: activeClient,
        notes: '',
        color: '#8a8f98',
        createdAt: '',
      };
    }
    return null;
  };

  const getHeaderTitle = () => {
    if (activeType) {
      const typeLabels: Record<string, string> = {
        income: 'Income', expense: 'Expense', trade: 'Trade',
        defi: 'DeFi', staking: 'Staking Reward', gas: 'Gas Fees',
      };
      return `${typeLabels[activeType] || activeType} Details`;
    }
    if (activeNetwork) {
      const net = networks.find(n => n.value === activeNetwork);
      return `${net?.label || activeNetwork} Details`;
    }
    const clientObj = getActiveClientObj();
    if (clientObj) return `${clientObj.name} Details`;
    if (activeAsset) return `${activeAsset.toUpperCase()} Details`;
    if (activeSection) {
      switch (activeSection) {
        case 'revenue': return 'Revenue';
        case 'expenses': return 'Expenses';
        case 'flow': return 'Net Flow';
        case 'gas': return 'Gas Fees';
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
    if (activeType) {
      return (
        <TypeDetailPage
          typeId={activeType}
          onBack={handleBackFromType}
        />
      );
    }

    if (activeNetwork) {
      return (
        <NetworkDetailPage
          networkId={activeNetwork}
          onBack={handleBackFromNetwork}
        />
      );
    }

    const clientObj = getActiveClientObj();
    if (clientObj) {
      return (
        <ClientDetailPage
          client={clientObj}
          onBack={handleBackFromClient}
          onDefineClient={handleDefineClient}
        />
      );
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
              <p className="text-sm text-[#8a8f98]">All wallets you've interacted with — name them for easy recognition</p>
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
              <p className="text-sm text-[#8a8f98]">All networks you've transacted on and details per network</p>
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
              <p className="text-sm text-[#8a8f98]">All transaction types and details per type</p>
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
      {/* Demo Banner */}
      {isDemo && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-[#f7931a]/10 border-b border-[#f7931a]/20 px-4 py-1.5 text-center">
          <span className="text-xs text-[#f7931a] font-medium">
            🛡️ Demo Mode — <button onClick={onLogout} className="underline hover:text-[#f7931a]/80">Sign in</button> and connect a wallet to load your real on-chain data.
          </span>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} isDemo={isDemo} />

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className={`sticky top-0 z-30 h-14 bg-[#08090a]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 lg:px-6 ${isDemo ? 'mt-[32px]' : ''}`}>
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
            {hasWallets && !isDemo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5"
                onClick={triggerSync}
                disabled={isAnySyncing}
                title="Refresh data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isAnySyncing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isDemo && <WalletBar />}
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
        <div className={`p-4 lg:p-6 max-w-7xl mx-auto ${isDemo ? 'pt-8' : ''}`}>
          {/* Demo prompt: no fake data — invite the user to sign in */}
          {isDemo && (
            <div className="flex items-center justify-center py-8 mb-6">
              <div className="flex flex-col items-center gap-3 bg-[#0f1011] border border-white/5 rounded-xl px-8 py-6 max-w-md text-center">
                <div className="w-12 h-12 rounded-full bg-[#0052ff]/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-[#0052ff]" />
                </div>
                <h3 className="text-base font-medium text-[#f7f8f8]">Welcome to the Sentinel preview</h3>
                <p className="text-sm text-[#8a8f98]">
                  This is a live preview with no sample data. Sign in and add a wallet
                  address to automatically fetch and classify your real on-chain transactions.
                </p>
                <Button
                  className="mt-1 rounded-full bg-[#0052ff] hover:bg-[#0047e1] text-white"
                  onClick={onLogout}
                >
                  Sign in to get started
                </Button>
              </div>
            </div>
          )}

          {/* No wallets prompt (only in real mode) */}
          {!hasWallets && !isDemo && (
            <div className="flex items-center justify-center py-8 mb-6">
              <div className="flex flex-col items-center gap-3 bg-[#0f1011] border border-white/5 rounded-xl px-8 py-6 max-w-md text-center">
                <div className="w-12 h-12 rounded-full bg-[#0052ff]/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-[#0052ff]" />
                </div>
                <h3 className="text-base font-medium text-[#f7f8f8]">Add your first wallet</h3>
                <p className="text-sm text-[#8a8f98]">
                  Add your wallet address to automatically fetch and classify your on-chain transactions
                </p>
              </div>
            </div>
          )}

          {/* Loading overlay when syncing */}
          {isAnySyncing && hasWallets && transactions.length === 0 && !isDemo && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3 bg-[#0f1011] border border-white/5 rounded-lg px-6 py-3">
                <Loader2 className="h-5 w-5 text-[#0052ff] animate-spin" />
                <span className="text-sm text-[#d0d6e0]">Fetching transactions from blockchain...</span>
              </div>
            </div>
          )}

          {renderContent()}
        </div>
      </main>

      {/* AI Chat */}
      <AIChat />

      {/* Analyze Data floating button */}
      {!showAnalysis && (
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
              ? 'Revenue'
              : activeSection === 'expenses'
                ? 'Expenses'
                : activeSection === 'flow'
                  ? 'Net Flow'
                  : 'Gas Fees'
            : undefined
          }
          sectionType={activeSection || undefined}
        />
      )}
    </div>
  );
}
