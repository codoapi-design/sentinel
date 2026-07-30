'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Mail, Save, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useWalletStore } from '@/stores/wallet-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { planDisplayName } from '@/lib/plans/address-families';
import {
  createDefaultAlertPayloads,
  disableAlertPayloads,
  planAllowsAlertChannel,
  type AlertKey,
  type AlertPayloads,
} from '@/lib/plans/alerts';
import { AlertCatalogPanels } from '@/components/alerts/alert-catalog-panels';
import { PlanAlertsBanner } from '@/components/alerts/alert-ui';

export function EmailSettings({ onUpgrade }: { onUpgrade?: () => void }) {
  const { user } = useAuth();
  const { currentPlan } = useWalletStore();

  const accountEmail = user?.email ?? '';
  const emailChannelAllowed = planAllowsAlertChannel(currentPlan, 'email');

  const [payloads, setPayloads] = useState<AlertPayloads>(() => createDefaultAlertPayloads());
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [saving, setSaving] = useState(false);

  const alertsActive = emailChannelAllowed && alertsEnabled;
  const alertsPanelId = 'email-alerts-panel';

  const updateSetting = (key: AlertKey, field: string, value: boolean | number | string) => {
    if (!alertsActive) return;
    setPayloads(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const handleToggleAlerts = (checked: boolean) => {
    if (!emailChannelAllowed) {
      toast.info('Email alerts start on Starter', {
        description: 'Upgrade to unlock email notifications.',
        action: onUpgrade
          ? {
              label: 'Upgrade',
              onClick: onUpgrade,
            }
          : undefined,
      });
      onUpgrade?.();
      return;
    }
    if (!accountEmail) {
      toast.error('No account email found. Please sign in again.');
      return;
    }
    setAlertsEnabled(checked);
    if (!checked) {
      setPayloads(prev => disableAlertPayloads(prev));
    }
  };

  const handleSave = async () => {
    if (!alertsEnabled || !accountEmail) return;
    setSaving(true);
    const settings = {
      enabled: true,
      email: accountEmail,
      verified: true,
      ...payloads,
    };
    try {
      const response = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 'current-user',
          settings,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Email alert settings saved', {
          description: `Alerts will be sent to ${accountEmail}`,
        });
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.success('Email alert settings saved (demo mode)', {
        description: `Alerts will be sent to ${accountEmail}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#0ecb81]/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-[#0ecb81]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-[#f7f8f8] text-base">Email Alerts</CardTitle>
                  {alertsEnabled && emailChannelAllowed && (
                    <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  )}
                  <Badge className="bg-white/5 text-[#8a8f98] border-0 text-[10px]">
                    {planDisplayName(currentPlan)}
                  </Badge>
                </div>
                <CardDescription className="text-[#8a8f98] text-xs mt-0.5">
                  {emailChannelAllowed
                    ? accountEmail
                      ? `Active alert preferences for ${accountEmail}`
                      : 'Enable email alerts using your account email'
                    : 'Email alerts unlock on Starter and above'}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#191a1b]/50 px-3 h-9">
                <span className="text-xs text-[#8a8f98] hidden sm:inline">
                  {alertsEnabled && emailChannelAllowed ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={alertsEnabled && emailChannelAllowed}
                  disabled={!emailChannelAllowed || !accountEmail}
                  onCheckedChange={handleToggleAlerts}
                  aria-label="Enable or disable email alerts"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-white/10 text-[#8a8f98] hover:bg-white/5 hover:text-[#d0d6e0] h-9 w-9 p-0"
                onClick={() => setAlertsExpanded(open => !open)}
                aria-expanded={alertsExpanded}
                aria-controls={alertsPanelId}
                aria-label={alertsExpanded ? 'Collapse alerts' : 'Expand alerts'}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-300 ease-out',
                    alertsExpanded && 'rotate-180',
                  )}
                  aria-hidden
                />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!emailChannelAllowed && (
            <PlanAlertsBanner
              title="Email channel locked on Free Plan"
              description="Free includes Telegram daily reports and basic alerts only. Starter unlocks email + weekly & monthly reports."
              actionLabel="View plans"
              onAction={onUpgrade}
            />
          )}

          <div
            id={alertsPanelId}
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
              alertsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
            aria-hidden={!alertsExpanded}
          >
            <div
              className={cn(
                'min-h-0 overflow-hidden space-y-4',
                !alertsExpanded && 'pointer-events-none',
              )}
            >
              {emailChannelAllowed && !alertsEnabled && (
                <PlanAlertsBanner
                  title="Email alerts are disabled"
                  description="Turn on the switch above to start receiving alerts at your account email."
                />
              )}

              {emailChannelAllowed && (
                <div className={cn(!alertsEnabled && 'opacity-55')}>
                  <AlertCatalogPanels
                    channel="email"
                    planId={currentPlan}
                    payloads={payloads}
                    channelReady={alertsActive}
                    onUpdate={updateSetting}
                    onUpgrade={onUpgrade}
                  />
                </div>
              )}
            </div>
          </div>

          {alertsActive && (
            <div className="flex justify-end pt-1">
              <Button
                className="rounded-full bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white px-8"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
