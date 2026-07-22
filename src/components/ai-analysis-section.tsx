'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart3, X, Loader2, TrendingUp, TrendingDown, Minus,
  Lightbulb, AlertTriangle, Sparkles, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { type Transaction } from '@/lib/mock-data';

// ============================================================
// Types
// ============================================================

export interface AnalysisResponse {
  summary: {
    totalValue: number;
    avgValue: number;
    maxValue: number;
    minValue: number;
    count: number;
    trendDirection: 'up' | 'down' | 'stable';
    trendPercentage: number;
  };
  charts: {
    byDate: { chartType: string; data: Array<{ date: string; value: number }>; title: string };
    byToken: { chartType: string; data: Array<{ token: string; value: number; fill: string }>; title: string };
    byNetwork: { chartType: string; data: Array<{ network: string; value: number; fill: string }>; title: string };
    byCounterparty: { chartType: string; data: Array<{ label: string; value: number; fill: string }>; title: string };
  };
  insights: string[];
  warnings: string[];
  suggestions: string[];
  taxObservations?: string[];
  reportMarkdown: string;
}

// ============================================================
// Chart Colors
// ============================================================

const CHART_COLORS = ['#0052ff', '#0ecb81', '#f6465d', '#f7931a', '#627eea', '#8a8f98', '#00d4aa', '#2775ca'];

// ============================================================
// Custom Tooltip
// ============================================================

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 shadow-xl" dir="ltr">
      {label && <p className="text-[10px] text-[#8a8f98] mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs font-medium text-[#f7f8f8]">
          <span style={{ color: entry.color }}>●</span>{' '}
          ${Number(entry.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      ))}
    </div>
  );
}

function PieCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-medium">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ============================================================
// Helper: Calculate summary stats
// ============================================================

function calculateSummaryStats(transactions: Transaction[]): Record<string, number> {
  const values = transactions.map(tx => tx.value || 0);
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  const avgValue = values.length > 0 ? totalValue / values.length : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const minValue = values.length > 0 ? Math.min(...values) : 0;

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    avgValue: Math.round(avgValue * 100) / 100,
    maxValue: Math.round(maxValue * 100) / 100,
    minValue: Math.round(minValue * 100) / 100,
    count: transactions.length,
  };
}

// ============================================================
// Helper: Calculate grouped data
// ============================================================

function calculateGroupedData(transactions: Transaction[]) {
  // Group by date
  const byDateMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const date = tx.date || '';
    const key = date.length > 10 ? date.slice(0, 10) : date;
    byDateMap[key] = (byDateMap[key] || 0) + (tx.value || 0);
  });
  const byDate = Object.entries(byDateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));

  // Group by token
  const byTokenMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const token = tx.token || 'UNKNOWN';
    byTokenMap[token] = (byTokenMap[token] || 0) + (tx.value || 0);
  });
  const byToken = Object.entries(byTokenMap)
    .sort(([, a], [, b]) => b - a)
    .map(([token, value], i) => ({ token, value: Math.round(value * 100) / 100, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  // Group by network
  const byNetworkMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const network = tx.networkLabel || tx.network || 'Unknown';
    byNetworkMap[network] = (byNetworkMap[network] || 0) + (tx.value || 0);
  });
  const byNetwork = Object.entries(byNetworkMap)
    .sort(([, a], [, b]) => b - a)
    .map(([network, value], i) => ({ network, value: Math.round(value * 100) / 100, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  // Group by counterparty
  const byCounterpartyMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const label = tx.counterpartyLabel || tx.counterparty || 'Unknown';
    byCounterpartyMap[label] = (byCounterpartyMap[label] || 0) + (tx.value || 0);
  });
  const byCounterparty = Object.entries(byCounterpartyMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([label, value], i) => ({ label, value: Math.round(value * 100) / 100, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  return { byDate, byToken, byNetwork, byCounterparty };
}

// ============================================================
// Props
// ============================================================

interface AIAnalysisSectionProps {
  // For inline mode (SectionPage) — manages its own state
  transactions?: Transaction[];
  sectionTitle?: string;
  sectionColor?: string;
  sectionType?: string;

  // For overlay mode (Dashboard) — externally managed
  analysis?: AnalysisResponse | null;
  isLoading?: boolean;
  onClose?: () => void;
  isOverlay?: boolean;

  // Trigger analysis from outside (change this value to trigger)
  triggerKey?: number;
}

// ============================================================
// Main Component
// ============================================================

export function AIAnalysisSection({
  transactions,
  sectionTitle,
  sectionColor = '#0052ff',
  sectionType,
  analysis: externalAnalysis,
  isLoading: externalLoading,
  onClose,
  isOverlay = false,
  triggerKey = 0,
}: AIAnalysisSectionProps) {
  // Internal state for inline mode
  const [internalAnalysis, setInternalAnalysis] = useState<AnalysisResponse | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Use external or internal state
  const analysis = externalAnalysis ?? internalAnalysis;
  const isLoading = externalLoading ?? internalLoading;

  // Auto-trigger analysis when triggerKey changes
  useEffect(() => {
    if (triggerKey > 0 && !isOverlay && transactions && transactions.length > 0 && sectionType) {
      triggerAnalysis();
    }
  }, [triggerKey]);

  // Trigger analysis API call
  const triggerAnalysis = useCallback(async () => {
    if (!transactions || transactions.length === 0) return;
    if (!sectionType) return;

    setInternalLoading(true);
    setError(null);

    try {
      const summaryStats = calculateSummaryStats(transactions);
      const groupedData = calculateGroupedData(transactions);

      const context = {
        userId: 'user-session',
        plan: 'pro',
        page: sectionType,
        sectionType,
      };

      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          transactions: transactions.slice(0, 50),
          summaryStats,
          groupedData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setInternalAnalysis(result.data as AnalysisResponse);
      } else {
        throw new Error(result.error || 'Data analysis failed');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during analysis');
    } finally {
      setInternalLoading(false);
    }
  }, [transactions, sectionType]);

  // Trend icon helper
  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-[#0ecb81]" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-[#f6465d]" />;
      default: return <Minus className="h-4 w-4 text-[#8a8f98]" />;
    }
  };

  const getTrendLabel = (direction: string) => {
    switch (direction) {
      case 'up': return 'Upward';
      case 'down': return 'Downward';
      default: return 'Stable';
    }
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'text-[#0ecb81]';
      case 'down': return 'text-[#f6465d]';
      default: return 'text-[#8a8f98]';
    }
  };

  // Format chart data for byDate display
  const formattedByDate = useMemo(() => {
    if (!analysis?.charts?.byDate?.data) return [];
    return analysis.charts.byDate.data.map(d => ({
      ...d,
      date: d.date.length > 5 ? d.date.slice(5) : d.date,
    }));
  }, [analysis]);

  // ============================================================
  // Render: Loading State
  // ============================================================

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-4" dir="ltr">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-[#0052ff]" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 border-2 border-[#0052ff] border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[#f7f8f8] mb-1">Analyzing data</p>
        <p className="text-xs text-[#8a8f98]">Processing transactions and generating analysis...</p>
      </div>
      <div className="w-48 h-1.5 bg-[#191a1b] rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-l from-[#0052ff] to-[#627eea] rounded-full animate-pulse-bar" style={{ width: '60%' }} />
      </div>
    </div>
  );

  // ============================================================
  // Render: Summary Cards
  // ============================================================

  const renderSummary = () => {
    if (!analysis?.summary) return null;
    const s = analysis.summary;

    const summaryItems = [
      { label: 'Total Value', value: `$${s.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: sectionColor },
      { label: 'Average', value: `$${s.avgValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: '#627eea' },
      { label: 'Highest', value: `$${s.maxValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: '#0ecb81' },
      { label: 'Lowest', value: `$${s.minValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: '#f7931a' },
    ];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="ltr">
        {summaryItems.map((item, i) => (
          <div key={i} className="bg-[#0f1011] border border-white/5 rounded-xl p-4">
            <p className="text-[10px] text-[#8a8f98] mb-1">{item.label}</p>
            <p className="text-base font-bold font-mono-num" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
        <div className="bg-[#0f1011] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-[#8a8f98] mb-1">Transaction Count</p>
          <p className="text-base font-bold text-[#f7f8f8]">{s.count}</p>
        </div>
        <div className="bg-[#0f1011] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-[#8a8f98] mb-1">Trend</p>
          <div className="flex items-center gap-1.5">
            {getTrendIcon(s.trendDirection)}
            <span className={`text-sm font-bold ${getTrendColor(s.trendDirection)}`}>
              {getTrendLabel(s.trendDirection)}
            </span>
            <span className="text-xs text-[#8a8f98]">({s.trendPercentage.toFixed(1)}%)</span>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // Render: Charts
  // ============================================================

  const renderCharts = () => {
    if (!analysis?.charts) return null;
    const { byDate: byDateChart, byToken: byTokenChart, byNetwork: byNetworkChart, byCounterparty: byCounterpartyChart } = analysis.charts;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" dir="ltr">
        {/* By Date — AreaChart */}
        {formattedByDate.length > 0 && (
          <Card className="bg-[#0f1011] border-white/5 lg:col-span-2">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium text-[#f7f8f8] mb-3">{byDateChart.title || 'Behavior by Date'}</h4>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={formattedByDate} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0052ff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0052ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#8a8f98', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <YAxis tick={{ fill: '#8a8f98', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#0052ff" strokeWidth={2} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Token — PieChart */}
        {byTokenChart.data.length > 0 && (
          <Card className="bg-[#0f1011] border-white/5">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium text-[#f7f8f8] mb-3">{byTokenChart.title || 'Token Distribution'}</h4>
              <div className="h-56" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byTokenChart.data}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      dataKey="value"
                      nameKey="token"
                      label={PieCustomLabel}
                      labelLine={false}
                    >
                      {byTokenChart.data.map((entry, index) => (
                        <Cell key={`cell-token-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(value: string) => <span className="text-[10px] text-[#d0d6e0]">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Network — BarChart */}
        {byNetworkChart.data.length > 0 && (
          <Card className="bg-[#0f1011] border-white/5">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium text-[#f7f8f8] mb-3">{byNetworkChart.title || 'Network Distribution'}</h4>
              <div className="h-56" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byNetworkChart.data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="network" tick={{ fill: '#8a8f98', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <YAxis tick={{ fill: '#8a8f98', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {byNetworkChart.data.map((entry, index) => (
                        <Cell key={`cell-net-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Counterparty — Horizontal BarChart */}
        {byCounterpartyChart.data.length > 0 && (
          <Card className="bg-[#0f1011] border-white/5 lg:col-span-2">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium text-[#f7f8f8] mb-3">{byCounterpartyChart.title || 'Counterparty Distribution'}</h4>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCounterpartyChart.data} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" tick={{ fill: '#8a8f98', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: '#8a8f98', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      width={90}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {byCounterpartyChart.data.map((entry, index) => (
                        <Cell key={`cell-cp-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ============================================================
  // Render: Insights / Warnings / Suggestions
  // ============================================================

  const renderInsightsCards = () => {
    if (!analysis) return null;
    const { insights, warnings, suggestions, taxObservations } = analysis;

    if (insights.length === 0 && warnings.length === 0 && suggestions.length === 0 && (!taxObservations || taxObservations.length === 0)) {
      return null;
    }

    return (
      <div className="space-y-4" dir="ltr">
        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#0052ff]" />
              <h4 className="text-sm font-medium text-[#f7f8f8]">Analytical Insights</h4>
              <Badge className="text-[9px] h-4 px-1.5 bg-[#0052ff]/10 text-[#0052ff] border-0">{insights.length}</Badge>
            </div>
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <div key={i} className="flex gap-3 bg-[#0f1011] border border-white/5 rounded-lg p-3">
                  <div className="w-1 rounded-full bg-[#0052ff] flex-shrink-0" />
                  <p className="text-xs text-[#d0d6e0] leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#f7931a]" />
              <h4 className="text-sm font-medium text-[#f7f8f8]">Warnings</h4>
              <Badge className="text-[9px] h-4 px-1.5 bg-[#f7931a]/10 text-[#f7931a] border-0">{warnings.length}</Badge>
            </div>
            <div className="space-y-2">
              {warnings.map((warning, i) => (
                <div key={i} className="flex gap-3 bg-[#f7931a]/5 border border-[#f7931a]/10 rounded-lg p-3">
                  <div className="w-1 rounded-full bg-[#f7931a] flex-shrink-0" />
                  <p className="text-xs text-[#d0d6e0] leading-relaxed">{warning}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0ecb81]" />
              <h4 className="text-sm font-medium text-[#f7f8f8]">Suggestions</h4>
              <Badge className="text-[9px] h-4 px-1.5 bg-[#0ecb81]/10 text-[#0ecb81] border-0">{suggestions.length}</Badge>
            </div>
            <div className="space-y-2">
              {suggestions.map((suggestion, i) => (
                <div key={i} className="flex gap-3 bg-[#0ecb81]/5 border border-[#0ecb81]/10 rounded-lg p-3">
                  <div className="w-1 rounded-full bg-[#0ecb81] flex-shrink-0" />
                  <p className="text-xs text-[#d0d6e0] leading-relaxed">{suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tax Observations */}
        {taxObservations && taxObservations.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#627eea]" />
              <h4 className="text-sm font-medium text-[#f7f8f8]">Tax Observations</h4>
              <Badge className="text-[9px] h-4 px-1.5 bg-[#627eea]/10 text-[#627eea] border-0">{taxObservations.length}</Badge>
            </div>
            <div className="space-y-2">
              {taxObservations.map((obs, i) => (
                <div key={i} className="flex gap-3 bg-[#627eea]/5 border border-[#627eea]/10 rounded-lg p-3">
                  <div className="w-1 rounded-full bg-[#627eea] flex-shrink-0" />
                  <p className="text-xs text-[#d0d6e0] leading-relaxed">{obs}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // Render: Report
  // ============================================================

  const renderReport = () => {
    if (!analysis?.reportMarkdown) return null;

    return (
      <div dir="ltr">
        <button
          onClick={() => setShowReport(!showReport)}
          className="flex items-center gap-2 text-sm font-medium text-[#f7f8f8] hover:text-[#0052ff] transition-colors mb-3"
        >
          <FileText className="h-4 w-4 text-[#0052ff]" />
          Detailed Analysis Report
          {showReport ? <ChevronUp className="h-4 w-4 text-[#8a8f98]" /> : <ChevronDown className="h-4 w-4 text-[#8a8f98]" />}
        </button>
        {showReport && (
          <div className="bg-[#0f1011] border border-white/5 rounded-xl p-5 prose prose-invert prose-sm max-w-none [&>h2]:text-[#f7f8f8] [&>h3]:text-[#d0d6e0] [&>p]:text-[#8a8f98] [&>p]:leading-relaxed [&>ul]:text-[#8a8f98] [&>strong]:text-[#d0d6e0]">
            <ReactMarkdown>{analysis.reportMarkdown}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // Render: Trigger Button (inline mode)
  // ============================================================

  const renderTriggerButton = () => {
    if (isOverlay || !transactions) return null;

    return (
      <div className="flex items-center justify-center" dir="ltr">
        <Button
          onClick={triggerAnalysis}
          disabled={isLoading || transactions.length === 0}
          className="gap-2 bg-[#0052ff] hover:bg-[#0045dd] text-white rounded-xl px-6 h-11"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4" />
              AI Data Analysis
            </>
          )}
        </Button>
      </div>
    );
  };

  // ============================================================
  // Render: Error
  // ============================================================

  const renderError = () => {
    if (!error) return null;
    return (
      <div className="flex items-center gap-3 bg-[#f6465d]/5 border border-[#f6465d]/10 rounded-xl p-4" dir="ltr">
        <AlertTriangle className="h-5 w-5 text-[#f6465d] flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-[#f6465d]">Analysis failed</p>
          <p className="text-xs text-[#8a8f98] mt-0.5">{error}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={triggerAnalysis}
          className="mr-auto text-xs text-[#d0d6e0] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
        >
          Retry
        </Button>
      </div>
    );
  };

  // ============================================================
  // Render: Overlay Mode
  // ============================================================

  if (isOverlay) {
    if (!analysis && !isLoading) return null;

    return (
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="w-full max-w-5xl bg-[#0a0a0b] border border-white/10 rounded-2xl shadow-2xl" dir="ltr">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/5 bg-[#0a0a0b]/95 backdrop-blur-xl rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-[#0052ff]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#f7f8f8]">AI Analysis</h3>
                <p className="text-xs text-[#8a8f98]">
                  {sectionTitle ? `Analysis of ${sectionTitle}` : 'Analysis of data'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 lg:p-6 space-y-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
            {isLoading && renderLoading()}
            {error && renderError()}
            {analysis && !isLoading && (
              <>
                {renderSummary()}
                {renderCharts()}
                {renderInsightsCards()}
                {renderReport()}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render: Inline Mode (SectionPage)
  // ============================================================

  return (
    <div className="space-y-6">
      {renderTriggerButton()}

      {isLoading && renderLoading()}
      {error && renderError()}

      {analysis && !isLoading && (
        <div className="space-y-6">
          {/* Inline header */}
          <div className="flex items-center justify-between" dir="ltr">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-[#0052ff]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#f7f8f8]">AI Analysis</h3>
                <p className="text-xs text-[#8a8f98]">
                  {sectionTitle ? `Analysis of ${sectionTitle}` : 'Analysis of data'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
              onClick={() => setInternalAnalysis(null)}
            >
              <X className="h-4 w-4 ml-1" />
              Hide
            </Button>
          </div>

          {renderSummary()}
          {renderCharts()}
          {renderInsightsCards()}
          {renderReport()}
        </div>
      )}
    </div>
  );
}
