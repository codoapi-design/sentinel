'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Code,
  Check,
  Loader2,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { ApiKeyPermission, ApiKey, ApiUsageStats } from '@/lib/api-keys/types';
import { toast } from 'sonner';

// ============================================================
// Constants
// ============================================================

const PERMISSIONS: { value: ApiKeyPermission; label: string; description: string }[] = [
  { value: 'transactions:read', label: 'Read Transactions', description: 'View all transactions and details' },
  { value: 'wallets:read', label: 'Read Wallets', description: 'View wallet balances and addresses' },
  { value: 'portfolio:read', label: 'Read Portfolio', description: 'View portfolio data and changes' },
  { value: 'reports:read', label: 'Read Reports', description: 'View financial and tax reports' },
  { value: 'webhooks:manage', label: 'Manage Webhooks', description: 'Create, edit, and delete webhooks' },
];

const API_ENDPOINTS = [
  { method: 'GET', path: '/v1/transactions', description: 'Fetch transactions' },
  { method: 'GET', path: '/v1/portfolio', description: 'Fetch portfolio data' },
  { method: 'GET', path: '/v1/wallets', description: 'Fetch wallets list' },
  { method: 'GET', path: '/v1/reports/tax', description: 'Fetch tax report' },
  { method: 'POST', path: '/v1/webhooks', description: 'Create webhook' },
  { method: 'GET', path: '/v1/webhooks', description: 'Fetch webhooks list' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
  POST: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  PUT: 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20',
  DELETE: 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20',
};

// ============================================================
// Helper Functions
// ============================================================

function maskKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.substring(0, 12)}...${key.substring(key.length - 4)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never used';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================
// Sub-Components
// ============================================================

function UsageBarChart({ data }: { data: { date: string; requests: number }[] }) {
  if (!data || data.length === 0) return null;

  const maxRequests = Math.max(...data.map((d) => d.requests), 1);

  return (
    <div className="flex items-end gap-1 h-16" dir="ltr">
      {data.map((day, i) => {
        const height = Math.max(4, (day.requests / maxRequests) * 100);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-t transition-all duration-300 hover:opacity-80"
              style={{
                height: `${height}%`,
                backgroundColor: i === data.length - 1 ? '#0052ff' : '#0052ff40',
                minHeight: '3px',
              }}
              title={`${day.date}: ${day.requests} requests`}
            />
          </div>
        );
      })}
    </div>
  );
}

function ApiKeyCard({
  apiKey,
  onRevoke,
  onToggle,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
  onToggle: () => void;
}) {
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const displayKey = showKey ? apiKey.key : maskKey(apiKey.key);

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Key className="h-3.5 w-3.5 text-[#0052ff]" />
              <p className="text-sm font-medium text-[#f7f8f8]">{apiKey.name}</p>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 ${
                  apiKey.isActive
                    ? 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'
                    : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20'
                }`}
              >
                {apiKey.isActive ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <code className="text-[11px] text-[#8a8f98] font-mono bg-[#191a1b] px-2 py-0.5 rounded" dir="ltr">
                {displayKey}
              </code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-[#8a8f98] hover:text-[#d0d6e0] transition-colors"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(apiKey.key);
                  toast.success('Key copied');
                }}
                className="text-[#8a8f98] hover:text-[#d0d6e0] transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {apiKey.permissions.map((perm) => {
                const permInfo = PERMISSIONS.find((p) => p.value === perm);
                return (
                  <Badge
                    key={perm}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20"
                  >
                    {permInfo?.label ?? perm}
                  </Badge>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-[#8a8f98]">
              <span>Last used: {formatTimeAgo(apiKey.lastUsedAt)}</span>
              <span>Requests: {formatNumber(apiKey.requestCount)}</span>
              {apiKey.expiresAt && <span>Expires: {formatDate(apiKey.expiresAt)}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              checked={apiKey.isActive}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-[#0ecb81] data-[state=unchecked]:bg-[#8a8f98]/30"
            />
            {!showConfirmRevoke ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-[#8a8f98] hover:text-[#f6465d] hover:bg-[#f6465d]/10"
                onClick={() => setShowConfirmRevoke(true)}
                title="Revoke key"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="h-7 text-[10px] bg-[#f6465d] hover:bg-[#f6465d]/80 text-white px-2"
                  onClick={onRevoke}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] text-[#8a8f98] hover:text-[#d0d6e0] px-2"
                  onClick={() => setShowConfirmRevoke(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Main Component
// ============================================================

export function ApiAccess() {
  const store = useApiKeyStore();
  const { apiKeys, usageStats, lastCreatedKey } = store;

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<ApiKeyPermission[]>([]);
  const [expirationDate, setExpirationDate] = useState('');

  // Key created modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [createdKeyValue, setCreatedKeyValue] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Documentation
  const [docOpen, setDocOpen] = useState(false);

  // Load usage stats
  useEffect(() => {
    store.loadUsageStats();
  }, [store]);

  const togglePermission = (perm: ApiKeyPermission) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the key');
      return;
    }
    if (selectedPermissions.length === 0) {
      toast.error('Please select at least one permission');
      return;
    }

    try {
      const apiKey = store.createKey(newKeyName.trim(), selectedPermissions);
      setCreatedKeyValue(apiKey.key);
      setShowCreateForm(false);
      setShowKeyModal(true);
      setNewKeyName('');
      setSelectedPermissions([]);
      setExpirationDate('');
      toast.success('API key created successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create key');
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(createdKeyValue);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast.success('Key copied');
  };

  const handleCloseKeyModal = () => {
    setShowKeyModal(false);
    store.clearLastCreatedKey();
  };

  const handleRevoke = (id: string) => {
    store.revokeKey(id);
    toast.success('Key revoked');
  };

  const handleToggle = (id: string) => {
    store.toggleKey(id);
    const key = store.apiKeys.find((k) => k.id === id);
    toast.success(key?.isActive ? 'Key disabled' : 'Key enabled');
  };

  const stats: ApiUsageStats | null = usageStats;

  return (
    <div className="space-y-6" >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
            <Key className="h-5 w-5 text-[#0052ff]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#f7f8f8]">API Access</h2>
            <p className="text-xs text-[#8a8f98]">Manage API keys for programmatic access to your account</p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white rounded-full px-4"
        >
          <Plus className="h-4 w-4 ml-2" />
          Create Key
        </Button>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-lg" >
          <DialogHeader>
            <DialogTitle className="text-[#f7f8f8]">Create New API Key</DialogTitle>
            <DialogDescription className="text-[#8a8f98] text-xs">
              Specify the key name and required permissions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Name Input */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Key Name</Label>
              <Input
                placeholder="e.g.: Accounting App"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm"
              />
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Permissions</Label>
              <div className="space-y-1.5 bg-[#191a1b] p-3 rounded-lg border border-white/5">
                {PERMISSIONS.map((perm) => (
                  <label
                    key={perm.value}
                    className="flex items-start gap-2.5 cursor-pointer hover:bg-[#1f2021] p-2 rounded transition-colors"
                  >
                    <Checkbox
                      checked={selectedPermissions.includes(perm.value)}
                      onCheckedChange={() => togglePermission(perm.value)}
                      className="data-[state=checked]:bg-[#0052ff] data-[state=checked]:border-[#0052ff] mt-0.5"
                    />
                    <div>
                      <p className="text-xs text-[#d0d6e0] font-medium">{perm.label}</p>
                      <p className="text-[10px] text-[#8a8f98]">{perm.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Expiration Date (Optional) */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Expiration Date (optional)</Label>
              <Input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] text-sm"
                dir="ltr"
              />
            </div>

            {/* Create Button */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleCreate}
                className="flex-1 bg-[#0052ff] hover:bg-[#0052ff]/80 text-white"
                disabled={!newKeyName.trim() || selectedPermissions.length === 0}
              >
                Create Key
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Key Created Success Modal */}
      <Dialog open={showKeyModal} onOpenChange={handleCloseKeyModal}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-md" >
          <DialogHeader>
            <DialogTitle className="text-[#f7f8f8] flex items-center gap-2">
              <Check className="h-5 w-5 text-[#0ecb81]" />
              Key Created Successfully
            </DialogTitle>
            <DialogDescription className="text-[#8a8f98] text-xs">
              Save this key now! It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-[#191a1b] p-3 rounded-lg border border-[#f7931a]/20">
              <p className="text-[10px] text-[#f7931a] mb-2 flex items-center gap-1">
                <Key className="h-3 w-3" />
                API Key — Save it now!
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-[#0ecb81] font-mono break-all" dir="ltr">
                  {createdKeyValue}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-[#8a8f98] hover:text-[#0ecb81] hover:bg-[#0ecb81]/10 shrink-0"
                  onClick={handleCopyKey}
                >
                  {copiedKey ? <Check className="h-4 w-4 text-[#0ecb81]" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-[#f6465d]/5 border border-[#f6465d]/10 rounded-lg">
              <Key className="h-4 w-4 text-[#f6465d] mt-0.5 shrink-0" />
              <p className="text-[10px] text-[#f6465d] leading-relaxed">
                Save this key now! It will not be shown again. If you lose the key, you will need to create a new key.
              </p>
            </div>
            <Button
              onClick={handleCloseKeyModal}
              className="w-full bg-[#0052ff] hover:bg-[#0052ff]/80 text-white"
            >
              Got it, close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Keys List */}
      {apiKeys.length > 0 ? (
        <div className="space-y-3">
          {apiKeys.map((apiKey) => (
            <ApiKeyCard
              key={apiKey.id}
              apiKey={apiKey}
              onRevoke={() => handleRevoke(apiKey.id)}
              onToggle={() => handleToggle(apiKey.id)}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="py-16 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mb-4">
              <Key className="h-8 w-8 text-[#0052ff] opacity-50" />
            </div>
            <h3 className="text-base font-medium text-[#f7f8f8] mb-2">No API keys</h3>
            <p className="text-sm text-[#8a8f98] text-center max-w-sm mb-4">
              Create an API key for programmatic access to your data via REST API
            </p>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white rounded-full px-6"
            >
              <Plus className="h-4 w-4 ml-2" />
              Create Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Usage Statistics */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#0052ff]" />
            Usage Statistics
          </CardTitle>
          <CardDescription className="text-[#8a8f98] text-xs">
            API usage summary
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#191a1b] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#8a8f98] mb-1">Total Requests</p>
                  <p className="text-lg font-semibold text-[#f7f8f8]">{formatNumber(stats.totalRequests)}</p>
                </div>
                <div className="bg-[#191a1b] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#8a8f98] mb-1">Avg Response</p>
                  <p className="text-lg font-semibold text-[#0ecb81]">{stats.averageLatency}ms</p>
                </div>
                <div className="bg-[#191a1b] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#8a8f98] mb-1">Error Rate</p>
                  <p className={`text-lg font-semibold ${stats.errorRate > 0.05 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>
                    {(stats.errorRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Daily Usage Chart */}
              {stats.dailyUsage.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#8a8f98] mb-2">Daily Usage (last 7 days)</p>
                  <UsageBarChart data={stats.dailyUsage} />
                  <div className="flex items-center justify-between mt-1 text-[8px] text-[#8a8f98]" dir="ltr">
                    <span>{stats.dailyUsage[0]?.date.slice(5)}</span>
                    <span>{stats.dailyUsage[stats.dailyUsage.length - 1]?.date.slice(5)}</span>
                  </div>
                </div>
              )}

              {/* Top Endpoints */}
              {stats.topEndpoints.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#8a8f98] mb-2">Top Endpoints</p>
                  <div className="space-y-1.5">
                    {stats.topEndpoints.map((endpoint, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#191a1b] p-2 rounded text-[10px]">
                        <code className="text-[#d0d6e0] font-mono" dir="ltr">{endpoint.path}</code>
                        <span className="text-[#8a8f98]">{formatNumber(endpoint.count)} requests</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Zap className="h-8 w-8 text-[#8a8f98] mx-auto mb-2 opacity-50" />
              <p className="text-sm text-[#8a8f98]">No usage data yet</p>
              <p className="text-[10px] text-[#8a8f98]">Statistics will appear after creating and using an API key</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Documentation (Collapsible) */}
      <Collapsible open={docOpen} onOpenChange={setDocOpen}>
        <Card className="bg-[#0f1011] border-white/5">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-[#191a1b]/20 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-[#0052ff]" />
                  <CardTitle className="text-[#f7f8f8] text-base">API Documentation</CardTitle>
                </div>
                <ChevronDown className={`h-4 w-4 text-[#8a8f98] transition-transform ${docOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {/* Base URL */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-1">Base URL</p>
                <code className="text-xs text-[#0ecb81] font-mono bg-[#191a1b] px-3 py-1.5 rounded" dir="ltr">
                  https://api.cryptobooks.io/v1
                </code>
              </div>

              {/* Authentication */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-1">Authentication</p>
                <div className="bg-[#191a1b] p-3 rounded-lg">
                  <code className="text-xs text-[#d0d6e0] font-mono block" dir="ltr">
                    x-api-key: ck_live_your_api_key_here
                  </code>
                </div>
                <p className="text-[10px] text-[#8a8f98] mt-1">Add the API key in the request header</p>
              </div>

              <Separator className="bg-white/5" />

              {/* Endpoints List */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-2">Endpoints</p>
                <div className="space-y-1.5">
                  {API_ENDPOINTS.map((endpoint, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#191a1b] p-2 rounded">
                      <Badge variant="outline" className={`text-[10px] px-1.5 font-mono ${METHOD_COLORS[endpoint.method]}`}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-[11px] text-[#d0d6e0] font-mono flex-1" dir="ltr">{endpoint.path}</code>
                      <span className="text-[10px] text-[#8a8f98]">{endpoint.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Example Request */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-1">Example Request</p>
                <pre className="text-[10px] text-[#d0d6e0] bg-[#08090a] p-3 rounded-lg overflow-x-auto" dir="ltr">
{`curl -X GET https://api.cryptobooks.io/v1/transactions \\
  -H "x-api-key: ck_live_..." \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>

              {/* Example Response */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-1">Example Response</p>
                <pre className="text-[10px] text-[#d0d6e0] bg-[#08090a] p-3 rounded-lg overflow-x-auto" dir="ltr">
{`{
  "data": [
    {
      "id": "tx-001",
      "type": "income",
      "token": "ETH",
      "quantity": 1.5,
      "value": 5185.17,
      "date": "2024-01-15"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "per_page": 20
  }
}`}
                </pre>
              </div>

              <Separator className="bg-white/5" />

              {/* Rate Limits */}
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-[#f7931a] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#d0d6e0] font-medium">Rate Limits</p>
                  <p className="text-[10px] text-[#8a8f98]">
                    60 requests per minute per API key. The header <code className="text-[#d0d6e0]" dir="ltr">X-RateLimit-Remaining</code>  is returned with each request.
                  </p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
