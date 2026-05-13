'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Key, Activity, AlertTriangle, CheckCircle, XCircle,
  ChevronLeft, ChevronRight, Clock, Zap, RefreshCw,
  TrendingUp, BarChart3, Database, Globe, Eye, EyeOff,
  Radio, Wifi, WifiOff, Shield, Layers, Wallet,
  ChevronDown, ExternalLink,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface ProviderInfo {
  id: string;
  name: string;
  role: string;
  chains: string;
  color: string;
  icon: string;
  baseUrl: string;
  apiKey: {
    configured: boolean;
    masked: string | null;
    envKey: string;
  };
  health: {
    isAvailable: boolean;
    latencyMs: number | null;
    errorCount: number;
    lastChecked: string | null;
    lastError: string | null;
    rateLimitRemaining: number | null;
  };
  quota: {
    freeQuota: number;
    paidQuota: number;
    totalRequests: number;
    remainingQuota: number;
    usagePercent: number;
    costPerCall: number;
  };
  costs: {
    totalCostUsd: number;
    totalRecords: number;
    period: string;
    periodCostUsd: number;
    periodRequests: number;
  };
}

interface ApiKeyEntry {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

interface ProviderSummary {
  totalProviders: number;
  configuredProviders: number;
  availableProviders: number;
  degradedProviders: number;
  unconfiguredProviders: number;
  totalCostUsd: number;
  totalRequests: number;
}

interface ApiStats {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  requests24h: number;
  errorRate: number;
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function AdminApiMonitoringPage() {
  // Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderSummary | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { isReachable: boolean; latencyMs: number; errorDetail: string | null }>>({});

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [apiTotal, setApiTotal] = useState(0);
  const [apiPage, setApiPage] = useState(1);
  const [apiTotalPages, setApiTotalPages] = useState(1);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiStats, setApiStats] = useState<ApiStats | null>(null);
  const [topEndpoints, setTopEndpoints] = useState<Array<{ endpoint: string; count: number }>>([]);
  const [usageChart, setUsageChart] = useState<Array<Record<string, number | string>>>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<'providers' | 'api-keys'>('providers');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // ── Fetch Providers ──
  const fetchProviders = useCallback(async () => {
    setProviderLoading(true);
    try {
      const res = await fetch('/api/admin/providers?include_costs=true');
      if (res.ok) {
        const result = await res.json();
        setProviders(result.data?.providers || []);
        setProviderSummary(result.data?.summary || null);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setProviderLoading(false);
    }
  }, []);

  // ── Fetch API Keys ──
  const fetchApiKeys = useCallback(async () => {
    setApiLoading(true);
    try {
      const params = new URLSearchParams({ page: apiPage.toString(), limit: '20' });
      const res = await fetch(`/api/admin/api-monitoring?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.apiKeys || []);
        setApiTotal(data.total || 0);
        setApiTotalPages(data.totalPages || 1);
        setApiStats(data.stats || null);
        setTopEndpoints(data.topEndpoints || []);
        setUsageChart(data.usageChart || []);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setApiLoading(false);
    }
  }, [apiPage]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);
  useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

  // ── Test Provider ──
  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const res = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_provider', provider: providerId }),
      });
      if (res.ok) {
        const result = await res.json();
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            isReachable: result.data?.isReachable ?? false,
            latencyMs: result.data?.latencyMs ?? 0,
            errorDetail: result.data?.errorDetail ?? null,
          },
        }));
        // Refresh provider data
        await fetchProviders();
      }
    } catch (error) {
      console.error('Provider test failed:', error);
    } finally {
      setTestingProvider(prev => prev === providerId ? null : prev);
    }
  };

  // ── Reset Provider Health ──
  const handleResetHealth = async (providerId: string) => {
    try {
      await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_health', provider: providerId }),
      });
      await fetchProviders();
    } catch (error) {
      console.error('Health reset failed:', error);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatCurrency = (num: number) => `$${num.toFixed(2)}`;

  const getProviderIcon = (iconName: string) => {
    switch (iconName) {
      case 'database': return Database;
      case 'wallet': return Wallet;
      case 'zap': return Zap;
      case 'layers': return Layers;
      default: return Globe;
    }
  };

  const getQuotaColor = (percent: number) => {
    if (percent < 50) return '#0ecb81';
    if (percent < 80) return '#f7931a';
    return '#f6465d';
  };

  // ── Cost breakdown for pie chart ──
  const costPieData = providers
    .filter(p => p.costs.totalCostUsd > 0)
    .map(p => ({ name: p.id, value: p.costs.totalCostUsd, color: p.color }));

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 bg-[#0c0d0e] border border-white/5 rounded-xl p-1.5 w-fit">
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'providers'
              ? 'bg-[#0052ff] text-white'
              : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          Blockchain Providers
        </button>
        <button
          onClick={() => setActiveTab('api-keys')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'api-keys'
              ? 'bg-[#0052ff] text-white'
              : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
          }`}
        >
          <Key className="h-3.5 w-3.5" />
          User API Keys
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
          PROVIDERS TAB
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'providers' && (
        <>
          {/* Provider Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#0052ff]/10"><Globe className="h-3.5 w-3.5 text-[#0052ff]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Total</span>
              </div>
              <p className="text-xl font-bold text-[#f7f8f8]">{providerSummary?.totalProviders || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#0ecb81]/10"><Wifi className="h-3.5 w-3.5 text-[#0ecb81]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Online</span>
              </div>
              <p className="text-xl font-bold text-[#0ecb81]">{providerSummary?.availableProviders || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#f6465d]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#f6465d]/10"><WifiOff className="h-3.5 w-3.5 text-[#f6465d]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Degraded</span>
              </div>
              <p className="text-xl font-bold text-[#f6465d]">{providerSummary?.degradedProviders || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#627eea]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#627eea]/10"><Shield className="h-3.5 w-3.5 text-[#627eea]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Configured</span>
              </div>
              <p className="text-xl font-bold text-[#627eea]">{providerSummary?.configuredProviders || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#f7931a]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#f7931a]/10"><Activity className="h-3.5 w-3.5 text-[#f7931a]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Total Calls</span>
              </div>
              <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(providerSummary?.totalRequests || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-white/5"><TrendingUp className="h-3.5 w-3.5 text-[#8a8f98]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Total Cost</span>
              </div>
              <p className="text-xl font-bold text-[#f7f8f8]">{formatCurrency(providerSummary?.totalCostUsd || 0)}</p>
            </div>
          </div>

          {/* Provider Cards */}
          <div className="space-y-4">
            {providerLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-16 text-[#8a8f98]">No providers found</div>
            ) : (
              providers.map((provider) => {
                const isExpanded = expandedProvider === provider.id;
                const Icon = getProviderIcon(provider.icon);
                const testResult = testResults[provider.id];

                return (
                  <div key={provider.id} className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden transition-all">
                    {/* Provider Header */}
                    <div
                      className="p-5 cursor-pointer hover:bg-white/[0.01] transition-colors"
                      onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Left: Icon + Info */}
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-xl shrink-0" style={{ backgroundColor: `${provider.color}15` }}>
                            <Icon className="h-6 w-6" style={{ color: provider.color }} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold text-[#f7f8f8]">{provider.name}</h3>
                              {/* Status Badge */}
                              {!provider.apiKey.configured ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8a8f98]/10 text-[#8a8f98]">Not Configured</span>
                              ) : provider.health.isAvailable ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0ecb81]/10 text-[#0ecb81]">Online</span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f6465d]/10 text-[#f6465d]">Offline</span>
                              )}
                              {testResult && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  testResult.isReachable ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                                }`}>
                                  Tested: {testResult.latencyMs}ms
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#8a8f98] mb-1">{provider.role}</p>
                            <p className="text-[10px] text-[#8a8f98]/60">{provider.chains}</p>
                          </div>
                        </div>

                        {/* Right: Quick Stats */}
                        <div className="flex items-center gap-6">
                          {/* Latency */}
                          <div className="text-center">
                            <p className="text-[10px] text-[#8a8f98] mb-1">Latency</p>
                            <p className={`text-sm font-bold ${
                              !provider.health.latencyMs ? 'text-[#8a8f98]' :
                              provider.health.latencyMs < 200 ? 'text-[#0ecb81]' :
                              provider.health.latencyMs < 500 ? 'text-[#f7931a]' : 'text-[#f6465d]'
                            }`}>
                              {provider.health.latencyMs ? `${provider.health.latencyMs}ms` : '—'}
                            </p>
                          </div>

                          {/* Quota Usage */}
                          <div className="text-center min-w-[80px]">
                            <p className="text-[10px] text-[#8a8f98] mb-1">Quota Used</p>
                            <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${provider.quota.usagePercent}%`,
                                  backgroundColor: getQuotaColor(provider.quota.usagePercent),
                                }}
                              />
                            </div>
                            <p className="text-[10px] mt-1" style={{ color: getQuotaColor(provider.quota.usagePercent) }}>
                              {provider.quota.usagePercent}%
                            </p>
                          </div>

                          {/* Cost */}
                          <div className="text-center">
                            <p className="text-[10px] text-[#8a8f98] mb-1">Cost</p>
                            <p className="text-sm font-bold text-[#f7f8f8]">{formatCurrency(provider.costs.periodCostUsd)}</p>
                            <p className="text-[9px] text-[#8a8f98]">/{provider.costs.period}</p>
                          </div>

                          {/* Expand Arrow */}
                          <ChevronDown className={`h-4 w-4 text-[#8a8f98] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-white/5 p-5 space-y-5">
                        {/* API Key Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[#8a8f98] mb-3 flex items-center gap-2">
                            <Key className="h-3.5 w-3.5" /> API Key Configuration
                          </h4>
                          <div className="bg-white/[0.02] rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-[#8a8f98]">Environment Variable</p>
                                <p className="text-sm text-[#f7f8f8] font-mono mt-0.5" dir="ltr">{provider.apiKey.envKey}</p>
                              </div>
                              <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${
                                provider.apiKey.configured
                                  ? 'bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/20'
                                  : 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/20'
                              }`}>
                                {provider.apiKey.configured ? 'Configured' : 'Missing'}
                              </span>
                            </div>
                            {provider.apiKey.configured && provider.apiKey.masked && (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-[#8a8f98]">API Key Value</p>
                                  <p className="text-sm text-[#d0d6e0] font-mono mt-0.5" dir="ltr">
                                    {showApiKey[provider.id] ? '••••••••••••' : provider.apiKey.masked}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }));
                                  }}
                                  className="p-2 rounded-lg hover:bg-white/5 text-[#8a8f98] transition-colors"
                                >
                                  {showApiKey[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-[#8a8f98]">Base URL</p>
                                <p className="text-sm text-[#627eea] font-mono mt-0.5" dir="ltr">{provider.baseUrl}</p>
                              </div>
                              <a
                                href={provider.baseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg hover:bg-white/5 text-[#8a8f98] transition-colors"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Health Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[#8a8f98] mb-3 flex items-center gap-2">
                            <Activity className="h-3.5 w-3.5" /> Health Status
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Status</p>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${provider.health.isAvailable ? 'bg-[#0ecb81] animate-pulse' : 'bg-[#f6465d]'}`} />
                                <p className={`text-xs font-medium ${provider.health.isAvailable ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                  {provider.health.isAvailable ? 'Available' : 'Unavailable'}
                                </p>
                              </div>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Latency</p>
                              <p className={`text-xs font-medium ${!provider.health.latencyMs ? 'text-[#8a8f98]' : provider.health.latencyMs < 200 ? 'text-[#0ecb81]' : 'text-[#f7931a]'}`}>
                                {provider.health.latencyMs ? `${provider.health.latencyMs}ms` : 'Not tested'}
                              </p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Error Count</p>
                              <p className={`text-xs font-medium ${provider.health.errorCount > 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>
                                {provider.health.errorCount}
                              </p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Last Checked</p>
                              <p className="text-xs text-[#d0d6e0]">
                                {provider.health.lastChecked ? new Date(provider.health.lastChecked).toLocaleString('en') : 'Never'}
                              </p>
                            </div>
                          </div>
                          {provider.health.lastError && (
                            <div className="mt-3 p-3 bg-[#f6465d]/5 border border-[#f6465d]/10 rounded-lg">
                              <p className="text-[10px] text-[#f6465d] font-medium mb-1">Last Error</p>
                              <p className="text-xs text-[#f6465d]/80 font-mono" dir="ltr">{provider.health.lastError}</p>
                            </div>
                          )}
                        </div>

                        {/* Quota & Usage Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[#8a8f98] mb-3 flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5" /> Quota & Usage
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Free Quota</p>
                              <p className="text-sm font-bold text-[#f7f8f8]">{formatNumber(provider.quota.freeQuota)}</p>
                              <p className="text-[9px] text-[#8a8f98]">requests/mo</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Paid Quota</p>
                              <p className="text-sm font-bold text-[#f7931a]">{formatNumber(provider.quota.paidQuota)}</p>
                              <p className="text-[9px] text-[#8a8f98]">requests/mo</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Used</p>
                              <p className="text-sm font-bold" style={{ color: getQuotaColor(provider.quota.usagePercent) }}>
                                {formatNumber(provider.quota.totalRequests)}
                              </p>
                              <p className="text-[9px] text-[#8a8f98]">total calls</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Remaining</p>
                              <p className="text-sm font-bold text-[#0ecb81]">{formatNumber(provider.quota.remainingQuota)}</p>
                              <p className="text-[9px] text-[#8a8f98]">requests left</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Cost/Call</p>
                              <p className="text-sm font-bold text-[#f7f8f8]">{formatCurrency(provider.quota.costPerCall)}</p>
                              <p className="text-[9px] text-[#8a8f98]">USD</p>
                            </div>
                          </div>

                          {/* Usage Bar */}
                          <div className="mt-3 bg-white/[0.02] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] text-[#8a8f98]">Quota Usage</span>
                              <span className="text-[10px] font-medium" style={{ color: getQuotaColor(provider.quota.usagePercent) }}>
                                {provider.quota.usagePercent}% used
                              </span>
                            </div>
                            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, provider.quota.usagePercent)}%`,
                                  backgroundColor: getQuotaColor(provider.quota.usagePercent),
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[9px] text-[#8a8f98]">0</span>
                              <span className="text-[9px] text-[#8a8f98]">{formatNumber(provider.quota.freeQuota)} (Free limit)</span>
                            </div>
                          </div>
                        </div>

                        {/* Cost Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[#8a8f98] mb-3 flex items-center gap-2">
                            <TrendingUp className="h-3.5 w-3.5" /> Cost Breakdown
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Period Cost</p>
                              <p className="text-sm font-bold text-[#f7f8f8]">{formatCurrency(provider.costs.periodCostUsd)}</p>
                              <p className="text-[9px] text-[#8a8f98]">{provider.costs.period}</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Period Requests</p>
                              <p className="text-sm font-bold text-[#f7f8f8]">{formatNumber(provider.costs.periodRequests)}</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">All-Time Cost</p>
                              <p className="text-sm font-bold text-[#f7931a]">{formatCurrency(provider.costs.totalCostUsd)}</p>
                            </div>
                            <div className="bg-white/[0.02] rounded-lg p-3">
                              <p className="text-[10px] text-[#8a8f98] mb-1">Records Fetched</p>
                              <p className="text-sm font-bold text-[#f7f8f8]">{formatNumber(provider.costs.totalRecords)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTestProvider(provider.id); }}
                            disabled={testingProvider === provider.id || !provider.apiKey.configured}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {testingProvider === provider.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                            Test Connection
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleResetHealth(provider.id); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8a8f98] hover:text-[#f7f8f8] text-xs font-medium transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset Health
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Cost Distribution */}
          {costPieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-[#f7931a]" />
                  <h3 className="text-sm font-semibold text-[#f7f8f8]">Cost Distribution</h3>
                </div>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                        {costPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2">
                  {costPieData.map(p => (
                    <div key={p.name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                      <span className="text-[10px] text-[#8a8f98] capitalize">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Architecture Overview */}
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-4 w-4 text-[#627eea]" />
                  <h3 className="text-sm font-semibold text-[#f7f8f8]">Hybrid Architecture</h3>
                </div>
                <div className="space-y-3">
                  <div className="text-[10px] text-[#8a8f98] text-center mb-2">Data Flow</div>
                  <div className="flex flex-col gap-2">
                    <div className="bg-[#0052ff]/5 border border-[#0052ff]/10 rounded-lg p-3 text-center">
                      <p className="text-xs text-[#0052ff] font-medium">Frontend / API Routes</p>
                    </div>
                    <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-[#8a8f98]" /></div>
                    <div className="bg-[#627eea]/5 border border-[#627eea]/10 rounded-lg p-3 text-center">
                      <p className="text-xs text-[#627eea] font-medium">Provider Manager (Smart Routing)</p>
                    </div>
                    <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-[#8a8f98]" /></div>
                    <div className="grid grid-cols-4 gap-2">
                      {providers.map(p => (
                        <div key={p.id} className="rounded-lg p-2 text-center" style={{ backgroundColor: `${p.color}10`, border: `1px solid ${p.color}20` }}>
                          <p className="text-[9px] font-medium capitalize" style={{ color: p.color }}>{p.id}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-[#8a8f98]" /></div>
                    <div className="bg-[#0ecb81]/5 border border-[#0ecb81]/10 rounded-lg p-3 text-center">
                      <p className="text-xs text-[#0ecb81] font-medium">Supabase Cache Layer</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          API KEYS TAB
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'api-keys' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#0052ff]/10"><Key className="h-3.5 w-3.5 text-[#0052ff]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Total Keys</span>
              </div>
              <p className="text-xl font-bold text-[#f7f8f8]">{apiStats?.totalKeys || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#0ecb81]/10"><CheckCircle className="h-3.5 w-3.5 text-[#0ecb81]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Active Keys</span>
              </div>
              <p className="text-xl font-bold text-[#0ecb81]">{apiStats?.activeKeys || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#f6465d]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#f6465d]/10"><XCircle className="h-3.5 w-3.5 text-[#f6465d]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Expired Keys</span>
              </div>
              <p className="text-xl font-bold text-[#f6465d]">{apiStats?.expiredKeys || 0}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-[#627eea]/10"><Activity className="h-3.5 w-3.5 text-[#627eea]" /></div>
                <span className="text-[10px] text-[#8a8f98]">Requests 24h</span>
              </div>
              <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(apiStats?.requests24h || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${(apiStats?.errorRate || 0) > 5 ? 'bg-[#f6465d]/10' : 'bg-[#0ecb81]/10'}`}>
                  <AlertTriangle className={`h-3.5 w-3.5 ${(apiStats?.errorRate || 0) > 5 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`} />
                </div>
                <span className="text-[10px] text-[#8a8f98]">Error Rate</span>
              </div>
              <p className={`text-xl font-bold ${(apiStats?.errorRate || 0) > 5 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{apiStats?.errorRate || 0}%</p>
            </div>
          </div>

          {/* Usage Chart + Top Endpoints */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-[#627eea]" />
                <h3 className="text-sm font-semibold text-[#f7f8f8]">API Requests (Last 24 Hours)</h3>
              </div>
              <div className="h-[250px]">
                {usageChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usageChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                      <XAxis dataKey="hour" stroke="#8a8f98" fontSize={10} tickLine={false} />
                      <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#8a8f98' }} />
                      <Area type="monotone" dataKey="total" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} name="Total Requests" />
                      <Area type="monotone" dataKey="errors" stroke="#f6465d" fill="#f6465d20" strokeWidth={2} name="Errors" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[#8a8f98]">No usage data yet</div>
                )}
              </div>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-[#f7931a]" />
                <h3 className="text-sm font-semibold text-[#f7f8f8]">Top Endpoints</h3>
              </div>
              <div className="space-y-2.5">
                {topEndpoints.length === 0 ? (
                  <p className="text-center text-xs text-[#8a8f98] py-4">No data available</p>
                ) : (
                  topEndpoints.map((ep) => {
                    const maxCount = topEndpoints[0]?.count || 1;
                    return (
                      <div key={ep.endpoint} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#d0d6e0] font-mono truncate" dir="ltr">{ep.endpoint}</span>
                          <span className="text-[10px] text-[#8a8f98] shrink-0">{ep.count}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1">
                          <div className="bg-[#0052ff] h-1 rounded-full transition-all" style={{ width: `${(ep.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* API Keys Table */}
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">User API Keys</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Key</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Requests</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Last Used</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {apiLoading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-[#8a8f98]"><div className="flex justify-center"><div className="w-6 h-6 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" /></div></td></tr>
                  ) : apiKeys.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-[#8a8f98]">No API keys found</td></tr>
                  ) : (
                    apiKeys.map((key) => {
                      const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
                      return (
                        <tr key={key.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">{key.name}</td>
                          <td className="px-4 py-2.5 text-xs text-[#8a8f98] font-mono">{key.key_prefix}••••</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              !key.is_active ? 'bg-[#8a8f98]/10 text-[#8a8f98]' :
                              isExpired ? 'bg-[#f6465d]/10 text-[#f6465d]' :
                              'bg-[#0ecb81]/10 text-[#0ecb81]'
                            }`}>
                              {!key.is_active ? 'Disabled' : isExpired ? 'Expired' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#d0d6e0]">{formatNumber(key.request_count)}</td>
                          <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{key.last_used_at ? new Date(key.last_used_at).toLocaleString('en') : 'Never used'}</td>
                          <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{key.expires_at ? new Date(key.expires_at).toLocaleDateString('en') : 'Never expires'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {apiTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-xs text-[#8a8f98]">Page {apiPage} of {apiTotalPages}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setApiPage(Math.max(1, apiPage - 1))} disabled={apiPage === 1} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                  <button onClick={() => setApiPage(Math.min(apiTotalPages, apiPage + 1))} disabled={apiPage === apiTotalPages} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          {/* Rate Limiting Info */}
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-[#f7931a]" />
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Rate Limiting</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">Starter</p>
                <p className="text-sm text-[#f7f8f8]">100 requests/hour</p>
              </div>
              <div className="bg-[#0ecb81]/5 rounded-lg p-3">
                <p className="text-xs text-[#0ecb81] mb-1">Pro</p>
                <p className="text-sm text-[#f7f8f8]">500 requests/hour</p>
              </div>
              <div className="bg-[#f7931a]/5 rounded-lg p-3">
                <p className="text-xs text-[#f7931a] mb-1">Enterprise</p>
                <p className="text-sm text-[#f7f8f8]">Unlimited</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
