'use client';

import { useState, useCallback, useEffect } from 'react';
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
  Webhook,
  Plus,
  Trash2,
  Play,
  ChevronDown,
  ExternalLink,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { useWebhookStore } from '@/stores/webhook-store';
import type { WebhookEvent, WebhookDelivery, WebhookEndpoint } from '@/lib/webhooks/types';
import { toast } from 'sonner';

// ============================================================
// Constants
// ============================================================

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; group: string }[] = [
  { value: 'transaction.incoming', label: 'Incoming Transaction', group: 'Transactions' },
  { value: 'transaction.outgoing', label: 'Outgoing Transaction', group: 'Transactions' },
  { value: 'transaction.large', label: 'Large Transaction', group: 'Transactions' },
  { value: 'wallet.threshold_reached', label: 'Wallet Threshold Reached', group: 'Wallet' },
  { value: 'asset.price_rise', label: 'Asset Price Rise', group: 'Assets' },
  { value: 'asset.price_drop', label: 'Asset Price Drop', group: 'Assets' },
  { value: 'gas.fee_exceeded', label: 'Gas Fee Exceeded', group: 'Gas' },
  { value: 'report.weekly', label: 'Weekly Report', group: 'Reports' },
  { value: 'report.monthly', label: 'Monthly Report', group: 'Reports' },
];

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'transaction.incoming': 'Incoming Transaction',
  'transaction.outgoing': 'Outgoing Transaction',
  'transaction.large': 'Large Transaction',
  'wallet.threshold_reached': 'Wallet Threshold',
  'asset.price_rise': 'Asset Price Rise',
  'asset.price_drop': 'Asset Price Drop',
  'gas.fee_exceeded': 'Gas Fee Exceeded',
  'report.weekly': 'Weekly Report',
  'report.monthly': 'Monthly Report',
};

const EVENT_GROUPS = ['Transactions', 'Wallet', 'Assets', 'Gas', 'Reports'];

// ============================================================
// Helper Functions
// ============================================================

function truncateUrl(url: string, maxLen = 50): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================
// Sub-Components
// ============================================================

function DeliveryStatusBadge({ status }: { status: WebhookDelivery['status'] }) {
  const config = {
    success: { bg: 'bg-[#0ecb81]/10', text: 'text-[#0ecb81]', border: 'border-[#0ecb81]/20', label: 'Success' },
    failed: { bg: 'bg-[#f6465d]/10', text: 'text-[#f6465d]', border: 'border-[#f6465d]/20', label: 'Failed' },
    pending: { bg: 'bg-[#f7931a]/10', text: 'text-[#f7931a]', border: 'border-[#f7931a]/20', label: 'Pending' },
  };
  const c = config[status];
  return (
    <Badge variant="outline" className={`${c.bg} ${c.text} ${c.border} text-[10px] px-2`}>
      {status === 'success' && <Check className="h-2.5 w-2.5 ml-1" />}
      {status === 'failed' && <X className="h-2.5 w-2.5 ml-1" />}
      {c.label}
    </Badge>
  );
}

function DeliveryHistory({
  deliveries,
  selectedDelivery,
  onSelectDelivery,
}: {
  deliveries: WebhookDelivery[];
  selectedDelivery: string | null;
  onSelectDelivery: (id: string | null) => void;
}) {
  if (deliveries.length === 0) {
    return (
      <div className="text-center py-8">
        <Webhook className="h-8 w-8 text-[#8a8f98] mx-auto mb-2 opacity-50" />
        <p className="text-sm text-[#8a8f98]">No delivery records yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
      {deliveries.map((delivery) => (
        <div key={delivery.id}>
          <button
            onClick={() => onSelectDelivery(selectedDelivery === delivery.id ? null : delivery.id)}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-[#191a1b] hover:bg-[#1f2021] transition-colors text-right"
          >
            <div className="flex items-center gap-3">
              <DeliveryStatusBadge status={delivery.status} />
              <div>
                <p className="text-xs text-[#d0d6e0]">{EVENT_LABELS[delivery.event]}</p>
                <p className="text-[10px] text-[#8a8f98]">{formatDate(delivery.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#8a8f98]">
              {delivery.statusCode && (
                <span className={`font-mono ${delivery.statusCode < 300 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                  {delivery.statusCode}
                </span>
              )}
              <span>{delivery.duration}ms</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${selectedDelivery === delivery.id ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {selectedDelivery === delivery.id && (
            <div className="mt-1 p-3 rounded-lg bg-[#0f1011] border border-white/5 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-[#8a8f98]">Event:</span>
                  <span className="text-[#d0d6e0] mr-1">{EVENT_LABELS[delivery.event]}</span>
                </div>
                <div>
                  <span className="text-[#8a8f98]">Status:</span>
                  <span className="text-[#d0d6e0] mr-1">{delivery.statusCode || '—'}</span>
                </div>
                <div>
                  <span className="text-[#8a8f98]">Duration:</span>
                  <span className="text-[#d0d6e0] mr-1">{delivery.duration}ms</span>
                </div>
                <div>
                  <span className="text-[#8a8f98]">Attempts:</span>
                  <span className="text-[#d0d6e0] mr-1">{delivery.attempts}</span>
                </div>
              </div>
              {delivery.payload && (
                <div>
                  <p className="text-[10px] text-[#8a8f98] mb-1">Payload:</p>
                  <pre className="text-[10px] text-[#d0d6e0] bg-[#08090a] p-2 rounded overflow-x-auto max-h-32 custom-scrollbar" dir="ltr">
                    {JSON.stringify(delivery.payload, null, 2)}
                  </pre>
                </div>
              )}
              {delivery.response && (
                <div>
                  <p className="text-[10px] text-[#8a8f98] mb-1">Response:</p>
                  <pre className="text-[10px] text-[#d0d6e0] bg-[#08090a] p-2 rounded overflow-x-auto max-h-32 custom-scrollbar" dir="ltr">
                    {delivery.response}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WebhookCard({
  webhook,
  onDelete,
  onTest,
  onToggle,
  isTesting,
}: {
  webhook: WebhookEndpoint;
  onDelete: () => void;
  onTest: () => void;
  onToggle: () => void;
  isTesting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const store = useWebhookStore();
  const deliveries = store.deliveries[webhook.id] || [];

  const loadDeliveries = useCallback(() => {
    store.loadDeliveries(webhook.id);
  }, [webhook.id, store]);

  // Load deliveries when expanding
  useEffect(() => {
    if (expanded) loadDeliveries();
  }, [expanded, loadDeliveries]);

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardContent className="p-4">
        {/* Main webhook info */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Status indicator */}
            <div className="mt-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${webhook.isActive ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-[#f7f8f8]">{webhook.label}</p>
                <Badge variant="outline" className={`text-[10px] px-1.5 ${webhook.isActive ? 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20' : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20'}`}>
                  {webhook.isActive ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <p className="text-xs text-[#8a8f98] font-mono truncate" dir="ltr">{truncateUrl(webhook.url, 60)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {webhook.events.map((event) => (
                  <Badge key={event} variant="outline" className="text-[10px] px-1.5 py-0 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20">
                    {EVENT_LABELS[event]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-[#8a8f98] hover:text-[#0ecb81] hover:bg-[#0ecb81]/10"
              onClick={onTest}
              disabled={isTesting || !webhook.isActive}
              title="Test"
            >
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
            <Switch
              checked={webhook.isActive}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-[#0ecb81] data-[state=unchecked]:bg-[#8a8f98]/30"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-[#8a8f98] hover:text-[#f6465d] hover:bg-[#f6465d]/10"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 text-[10px] text-[#8a8f98]">
          <div className="flex items-center gap-1">
            <Check className="h-3 w-3 text-[#0ecb81]" />
            <span>{webhook.successCount} success</span>
          </div>
          <div className="flex items-center gap-1">
            <X className="h-3 w-3 text-[#f6465d]" />
            <span>{webhook.failureCount} failed</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Last delivery:</span>
            <span>{formatTimeAgo(webhook.lastDeliveryAt)}</span>
          </div>
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded) loadDeliveries();
            }}
            className="mr-auto flex items-center gap-1 text-[#0052ff] hover:text-[#0052ff]/80 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>{expanded ? 'Hide logs' : 'View logs'}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expanded delivery history */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs font-medium text-[#d0d6e0] mb-2">Delivery Logs</p>
            <DeliveryHistory
              deliveries={deliveries}
              selectedDelivery={selectedDelivery}
              onSelectDelivery={setSelectedDelivery}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Main Component
// ============================================================

export function WebhooksSettings() {
  const store = useWebhookStore();
  const { webhooks, isLoading } = store;

  // Add webhook form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toggleEvent = (event: WebhookEvent) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = () => {
    // Validate URL
    if (!newUrl.startsWith('https://')) {
      toast.error('URL must start with https://');
      return;
    }

    try {
      new URL(newUrl);
    } catch {
      toast.error('Invalid URL');
      return;
    }

    if (!newLabel.trim()) {
      toast.error('Please enter a label for the webhook');
      return;
    }

    if (selectedEvents.length === 0) {
      toast.error('Please select at least one event');
      return;
    }

    try {
      store.addWebhook(newUrl, newLabel.trim(), selectedEvents);
      toast.success('Webhook created successfully');
      setNewUrl('');
      setNewLabel('');
      setSelectedEvents([]);
      setShowAddForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create webhook');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await store.testWebhook(id);
      if (result) {
        if (result.status === 'success') {
          toast.success('Webhook test successful', {
            description: `Response ${result.statusCode} in ${result.duration}ms`,
          });
        } else {
          toast.error('Webhook test failed', {
            description: `Status: ${result.statusCode || 'No response'}`,
          });
        }
      }
    } catch {
      toast.error('An error occurred while testing the webhook');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = (id: string) => {
    store.deleteWebhook(id);
    setDeleteId(null);
    toast.success('Webhook deleted');
  };

  const handleToggle = (id: string) => {
    store.toggleWebhook(id);
    const wh = store.webhooks.find((w) => w.id === id);
    toast.success(wh?.isActive ? 'Webhook disabled' : 'Webhook enabled');
  };

  return (
    <div className="space-y-6" >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
            <Webhook className="h-5 w-5 text-[#0052ff]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#f7f8f8]">Webhooks Management</h2>
            <p className="text-xs text-[#8a8f98]">
              Send instant notifications when specific events occur in your account
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white rounded-full px-4"
        >
          <Plus className="h-4 w-4 ml-2" />
          Add Webhook
        </Button>
      </div>

      {/* Add Webhook Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-lg" >
          <DialogHeader>
            <DialogTitle className="text-[#f7f8f8]">Add New Webhook</DialogTitle>
            <DialogDescription className="text-[#8a8f98] text-xs">
              Enter the endpoint details that will receive notifications
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* URL Input */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">URL</Label>
              <Input
                placeholder="https://example.com/webhook"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm font-mono"
                dir="ltr"
              />
              {!newUrl.startsWith('https://') && newUrl.length > 0 && (
                <p className="text-[10px] text-[#f6465d] flex items-center gap-1">
                  <X className="h-3 w-3" />
                  URL must start with https://
                </p>
              )}
            </div>

            {/* Label Input */}
            <div className="space-y-2">
              <Label className="text-xs text-[#8a8f98]">Label</Label>
              <Input
                placeholder="e.g.: Revenue alerts"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm"
              />
            </div>

            {/* Event Selection */}
            <div className="space-y-3">
              <Label className="text-xs text-[#8a8f98]">Events</Label>
              <div className="space-y-3 bg-[#191a1b] p-3 rounded-lg border border-white/5 max-h-60 overflow-y-auto custom-scrollbar">
                {EVENT_GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-[10px] text-[#8a8f98] font-medium mb-1.5">{group}</p>
                    <div className="space-y-1.5">
                      {WEBHOOK_EVENTS.filter((e) => e.group === group).map((event) => (
                        <label
                          key={event.value}
                          className="flex items-center gap-2 cursor-pointer hover:bg-[#1f2021] p-1.5 rounded transition-colors"
                        >
                          <Checkbox
                            checked={selectedEvents.includes(event.value)}
                            onCheckedChange={() => toggleEvent(event.value)}
                            className="data-[state=checked]:bg-[#0052ff] data-[state=checked]:border-[#0052ff]"
                          />
                          <span className="text-xs text-[#d0d6e0]">{event.label}</span>
                        </label>
                      ))}
                    </div>
                    {group !== EVENT_GROUPS[EVENT_GROUPS.length - 1] && (
                      <Separator className="bg-white/5 mt-2" />
                    )}
                  </div>
                ))}
              </div>
              {selectedEvents.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedEvents.map((event) => (
                    <Badge
                      key={event}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0.5 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 cursor-pointer hover:bg-[#0052ff]/20"
                      onClick={() => toggleEvent(event)}
                    >
                      {EVENT_LABELS[event]}
                      <X className="h-2.5 w-2.5 mr-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Create Button */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleCreate}
                className="flex-1 bg-[#0052ff] hover:bg-[#0052ff]/80 text-white"
                disabled={!newUrl.startsWith('https://') || !newLabel.trim() || selectedEvents.length === 0}
              >
                Create Webhook
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddForm(false)}
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-sm" >
          <DialogHeader>
            <DialogTitle className="text-[#f7f8f8]">Delete Webhook</DialogTitle>
            <DialogDescription className="text-[#8a8f98] text-xs">
              Are you sure you want to delete this webhook? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => deleteId && handleDelete(deleteId)}
              className="flex-1 bg-[#f6465d] hover:bg-[#f6465d]/80 text-white"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              Delete
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              className="flex-1 bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#0052ff] animate-spin" />
        </div>
      )}

      {/* Webhook List */}
      {!isLoading && webhooks.length > 0 && (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onDelete={() => setDeleteId(webhook.id)}
              onTest={() => handleTest(webhook.id)}
              onToggle={() => handleToggle(webhook.id)}
              isTesting={testingId === webhook.id}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && webhooks.length === 0 && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="py-16 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mb-4">
              <Webhook className="h-8 w-8 text-[#0052ff] opacity-50" />
            </div>
            <h3 className="text-base font-medium text-[#f7f8f8] mb-2">No webhooks</h3>
            <p className="text-sm text-[#8a8f98] text-center max-w-sm mb-4">
              Add a webhook to receive instant notifications when events like incoming transactions or price changes occur
            </p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-[#0052ff] hover:bg-[#0052ff]/80 text-white rounded-full px-6"
            >
              <Plus className="h-4 w-4 ml-2" />
              Add Webhook
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
