'use client';

import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Mail,
  MailCheck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Calendar,
  Fuel,
  Save,
  AlertTriangle,
  FileBarChart,
  ArrowUpDown,
  ChevronDown,
  Link2,
  Unlink,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { defaultEmailSettings, daysOfWeek, assets } from '@/lib/mock-data';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type EmailSettingsState = typeof defaultEmailSettings;

const ALERT_KEYS = [
  'inboundAbove',
  'outboundAbove',
  'largeTransaction',
  'portfolioReaches',
  'assetRises',
  'assetDrops',
  'gasExceeds',
  'dailySummary',
  'weeklyReport',
  'monthlyReport',
] as const;

type EmailAlertKey = (typeof ALERT_KEYS)[number];

function disableAllAlerts(prev: EmailSettingsState): EmailSettingsState {
  const next = { ...prev, enabled: false, verified: false };
  // Alert entries carry different payloads per key, so the indexed write is
  // narrowed to the shared `enabled` flag they all have.
  const toggles = next as Record<EmailAlertKey, { enabled: boolean }>;
  for (const key of ALERT_KEYS) {
    toggles[key] = { ...prev[key], enabled: false };
  }
  return next;
}

export function EmailSettings() {
  const [settings, setSettings] = useState(defaultEmailSettings);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);

  const isConnected = connectionStatus === 'connected' || settings.verified;
  const alertsActive = isConnected;
  const alertsPanelId = 'email-alerts-panel';

  const updateSetting = <K extends keyof typeof settings>(
    key: K,
    field: string,
    value: boolean | number | string
  ) => {
    if (!alertsActive) return;
    const current = settings[key] as Record<string, unknown>;
    setSettings({
      ...settings,
      [key]: {
        ...current,
        [field]: value,
      },
    });
  };

  const handleConnect = () => {
    setConnectionStatus('connecting');
    setCodeSent(false);
    setVerificationCode('');
  };

  const handleCancelConnecting = () => {
    setConnectionStatus('disconnected');
    setCodeSent(false);
    setVerificationCode('');
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setCodeSent(false);
    setVerificationCode('');
    setSettings((prev) => disableAllAlerts({ ...prev, email: '' }));
    toast.success('Email disconnected');
  };

  const handleSendCode = async () => {
    if (!settings.email) {
      toast.error('Please enter your email first');
      return;
    }
    setIsVerifying(true);
    try {
      const response = await fetch('/api/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          email: settings.email,
          userId: 'current-user', // In production: use auth user ID
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCodeSent(true);
        toast.success('Verification code sent to your email', {
          description: settings.email,
        });
      } else {
        toast.error(data.error || 'Failed to send verification code', {
          description: data.details || 'Check AWS SES settings',
        });
      }
    } catch {
      // Fallback to mock if API not available
      setCodeSent(true);
      toast.success('Verification code sent to your email (demo mode)', {
        description: settings.email,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode) {
      toast.error('Please enter the verification code');
      return;
    }
    try {
      const response = await fetch('/api/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          code: verificationCode,
          userId: 'current-user',
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, verified: true, enabled: true }));
        setConnectionStatus('connected');
        setCodeSent(false);
        setVerificationCode('');
        toast.success('Email verified successfully');
      } else {
        toast.error(data.error || 'Incorrect verification code');
      }
    } catch {
      // Fallback: accept any 6-digit code in dev mode
      if (verificationCode.length === 6) {
        setSettings((prev) => ({ ...prev, verified: true, enabled: true }));
        setConnectionStatus('connected');
        setCodeSent(false);
        setVerificationCode('');
        toast.success('Email verified successfully (demo mode)');
      } else {
        toast.error('Please enter a 6-digit code');
      }
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current-user',
          settings,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Email settings saved successfully', {
          description: 'Settings will apply within a minute',
        });
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.success('Email settings saved successfully (demo mode)', {
        description: 'Settings will apply within a minute',
      });
    }
  };

  const alertChecked = (enabled: boolean) => (alertsActive ? enabled : false);
  const showConnecting = connectionStatus === 'connecting' && !isConnected;

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
                  {isConnected && (
                    <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                  {showConnecting && (
                    <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Connecting…
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-[#8a8f98] text-xs mt-0.5">
                  {isConnected
                    ? 'Receive alerts and reports directly to your email'
                    : 'Connect email to activate alert preferences'}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-[#f6465d]/30 text-[#f6465d] hover:bg-[#f6465d]/10 hover:text-[#f6465d] h-9 px-3"
                  onClick={handleDisconnect}
                >
                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                  Disconnect
                </Button>
              ) : showConnecting ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-[#0ecb81]/30 text-[#0ecb81] hover:bg-[#0ecb81]/10 h-9 px-3"
                  onClick={handleCancelConnecting}
                >
                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white h-9 px-4"
                  onClick={handleConnect}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Connect Email
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-white/10 text-[#8a8f98] hover:bg-white/5 hover:text-[#d0d6e0] h-9 w-9 p-0"
                onClick={() => setAlertsExpanded((open) => !open)}
                aria-expanded={alertsExpanded}
                aria-controls={alertsPanelId}
                aria-label={alertsExpanded ? 'Collapse alerts' : 'Expand alerts'}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-300 ease-out',
                    alertsExpanded && 'rotate-180'
                  )}
                  aria-hidden
                />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {showConnecting && (
            <div className="bg-[#0ecb81]/5 rounded-xl p-4 border border-[#0ecb81]/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0ecb81]/10 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-[#0ecb81]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#f7f8f8]">Verify your email</p>
                  <p className="text-xs text-[#8a8f98]">
                    Enter your address and confirm the verification code to enable alerts
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-[#8a8f98]">Email</Label>
                  <Input
                    placeholder="example@email.com"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#8a8f98]">Verification Code</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Enter code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm flex-1"
                      dir="ltr"
                      disabled={!codeSent}
                    />
                    {codeSent ? (
                      <Button
                        size="sm"
                        className="bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white h-9 text-xs"
                        onClick={handleVerify}
                      >
                        Verify
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8] h-9 text-xs whitespace-nowrap"
                        onClick={handleSendCode}
                        disabled={isVerifying || !settings.email}
                      >
                        {isVerifying ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sending…
                          </span>
                        ) : (
                          'Send code'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-[#8a8f98] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                You must verify your email before enabling alerts
              </p>
            </div>
          )}

          {isConnected && (
            <div className="bg-[#0ecb81]/5 rounded-xl p-3.5 border border-[#0ecb81]/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#0ecb81]/10 flex items-center justify-center shrink-0">
                  <MailCheck className="h-4 w-4 text-[#0ecb81]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-[#f7f8f8] truncate">{settings.email}</p>
                  <p className="text-[10px] text-[#8a8f98]">
                    Verified — alerts and reports will be sent here
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            id={alertsPanelId}
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
              alertsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
            aria-hidden={!alertsExpanded}
          >
            <div
              className={cn(
                'min-h-0 overflow-hidden space-y-4',
                !alertsExpanded && 'pointer-events-none'
              )}
            >
              {!isConnected && !showConnecting && (
                <div className="rounded-xl px-3.5 py-2.5 border border-white/5 bg-[#191a1b]/40">
                  <p className="text-xs text-[#8a8f98]">
                    Alert toggles stay off until email is connected. Verify your address to enable
                    them.
                  </p>
                </div>
              )}

              <div
                className={cn(
                  'rounded-xl border border-white/5 overflow-hidden transition-opacity',
                  !alertsActive && 'opacity-55'
                )}
              >
                <AlertRow
                  muted={!alertsActive}
                  icon={<DollarSign className="h-4 w-4 text-[#0ecb81]" />}
                  iconBg="bg-[#0ecb81]/10"
                  title="Incoming transfers above"
                  description="Alert when receiving a large amount"
                  control={
                    <>
                      <Input
                        type="number"
                        value={settings.inboundAbove.amount}
                        onChange={(e) =>
                          updateSetting('inboundAbove', 'amount', parseFloat(e.target.value) || 0)
                        }
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">USD</span>
                      <Switch
                        checked={alertChecked(settings.inboundAbove.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('inboundAbove', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<DollarSign className="h-4 w-4 text-[#f6465d]" />}
                  iconBg="bg-[#f6465d]/10"
                  title="Outgoing transfers above"
                  description="Alert when sending a large amount"
                  control={
                    <>
                      <Input
                        type="number"
                        value={settings.outboundAbove.amount}
                        onChange={(e) =>
                          updateSetting('outboundAbove', 'amount', parseFloat(e.target.value) || 0)
                        }
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">USD</span>
                      <Switch
                        checked={alertChecked(settings.outboundAbove.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('outboundAbove', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<ArrowUpDown className="h-4 w-4 text-[#f7931a]" />}
                  iconBg="bg-[#f7931a]/10"
                  title="Large transactions (in or out)"
                  description="Instant alert for any transaction exceeding the limit"
                  control={
                    <>
                      <Input
                        type="number"
                        value={settings.largeTransaction.amount}
                        onChange={(e) =>
                          updateSetting(
                            'largeTransaction',
                            'amount',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">USD</span>
                      <Switch
                        checked={alertChecked(settings.largeTransaction.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('largeTransaction', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<Bell className="h-4 w-4 text-[#0052ff]" />}
                  iconBg="bg-[#0052ff]/10"
                  title="When wallet reaches"
                  description="Alert when total value reaches a threshold"
                  control={
                    <>
                      <Input
                        type="number"
                        value={settings.portfolioReaches.amount}
                        onChange={(e) =>
                          updateSetting(
                            'portfolioReaches',
                            'amount',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">USD</span>
                      <Switch
                        checked={alertChecked(settings.portfolioReaches.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('portfolioReaches', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<TrendingUp className="h-4 w-4 text-[#0ecb81]" />}
                  iconBg="bg-[#0ecb81]/10"
                  title="When an asset rises by"
                  description="Alert when a specific asset price rises"
                  control={
                    <>
                      <Select
                        value={settings.assetRises.asset}
                        onValueChange={(value) => updateSetting('assetRises', 'asset', value)}
                        disabled={!alertsActive}
                      >
                        <SelectTrigger className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs disabled:opacity-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#191a1b] border-white/10">
                          {assets.map((a) => (
                            <SelectItem
                              key={a.id}
                              value={a.symbol}
                              className="text-[#d0d6e0] text-xs"
                            >
                              {a.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={settings.assetRises.percentage}
                        onChange={(e) =>
                          updateSetting(
                            'assetRises',
                            'percentage',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        disabled={!alertsActive}
                        className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">%</span>
                      <Switch
                        checked={alertChecked(settings.assetRises.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('assetRises', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<TrendingDown className="h-4 w-4 text-[#f6465d]" />}
                  iconBg="bg-[#f6465d]/10"
                  title="When an asset drops by"
                  description="Alert when a specific asset price drops"
                  control={
                    <>
                      <Select
                        value={settings.assetDrops.asset}
                        onValueChange={(value) => updateSetting('assetDrops', 'asset', value)}
                        disabled={!alertsActive}
                      >
                        <SelectTrigger className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs disabled:opacity-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#191a1b] border-white/10">
                          {assets.map((a) => (
                            <SelectItem
                              key={a.id}
                              value={a.symbol}
                              className="text-[#d0d6e0] text-xs"
                            >
                              {a.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={settings.assetDrops.percentage}
                        onChange={(e) =>
                          updateSetting(
                            'assetDrops',
                            'percentage',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        disabled={!alertsActive}
                        className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">%</span>
                      <Switch
                        checked={alertChecked(settings.assetDrops.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('assetDrops', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<Fuel className="h-4 w-4 text-[#f6465d]" />}
                  iconBg="bg-[#f6465d]/10"
                  title="Gas fees exceed"
                  description="Alert when daily gas fees exceed a threshold"
                  control={
                    <>
                      <Input
                        type="number"
                        value={settings.gasExceeds.amount}
                        onChange={(e) =>
                          updateSetting('gasExceeds', 'amount', parseFloat(e.target.value) || 0)
                        }
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <span className="text-xs text-[#8a8f98]">USD/day</span>
                      <Switch
                        checked={alertChecked(settings.gasExceeds.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('gasExceeds', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<Clock className="h-4 w-4 text-[#627eea]" />}
                  iconBg="bg-[#627eea]/10"
                  title="Daily summary at"
                  description="Daily report of wallet value and changes"
                  control={
                    <>
                      <Input
                        type="time"
                        value={settings.dailySummary.time}
                        onChange={(e) => updateSetting('dailySummary', 'time', e.target.value)}
                        disabled={!alertsActive}
                        className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                      />
                      <Switch
                        checked={alertChecked(settings.dailySummary.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('dailySummary', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<Calendar className="h-4 w-4 text-[#f7931a]" />}
                  iconBg="bg-[#f7931a]/10"
                  title="Weekly report every"
                  description="Detailed weekly report of all transactions, revenue and expenses"
                  control={
                    <>
                      <Select
                        value={settings.weeklyReport.day}
                        onValueChange={(value) => updateSetting('weeklyReport', 'day', value)}
                        disabled={!alertsActive}
                      >
                        <SelectTrigger className="w-28 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs disabled:opacity-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#191a1b] border-white/10">
                          {daysOfWeek.map((day) => (
                            <SelectItem key={day} value={day} className="text-[#d0d6e0] text-xs">
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Switch
                        checked={alertChecked(settings.weeklyReport.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('weeklyReport', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />

                <Separator className="bg-white/5" />

                <AlertRow
                  muted={!alertsActive}
                  icon={<FileBarChart className="h-4 w-4 text-[#0052ff]" />}
                  iconBg="bg-[#0052ff]/10"
                  title="Monthly report on day"
                  description="Comprehensive monthly report including portfolio analysis, taxes, and recommendations"
                  control={
                    <>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        value={settings.monthlyReport.day}
                        onChange={(e) =>
                          updateSetting('monthlyReport', 'day', parseInt(e.target.value) || 1)
                        }
                        disabled={!alertsActive}
                        className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
                        dir="ltr"
                        placeholder="1-28"
                      />
                      <span className="text-xs text-[#8a8f98]">of the month</span>
                      <Switch
                        checked={alertChecked(settings.monthlyReport.enabled)}
                        disabled={!alertsActive}
                        onCheckedChange={(checked) =>
                          updateSetting('monthlyReport', 'enabled', checked)
                        }
                      />
                    </>
                  }
                />
              </div>
            </div>
          </div>

          {isConnected && (
            <div className="flex justify-end pt-1">
              <Button
                className="rounded-full bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white px-8"
                onClick={handleSave}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertRow({
  icon,
  iconBg,
  title,
  description,
  control,
  muted,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description: string;
  control: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-4 transition-colors',
        muted ? 'bg-transparent' : 'hover:bg-[#191a1b]/50'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            iconBg,
            muted && 'opacity-70'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className={cn('text-sm', muted ? 'text-[#8a8f98]' : 'text-[#d0d6e0]')}>{title}</p>
          <p className="text-xs text-[#8a8f98]">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">{control}</div>
    </div>
  );
}
