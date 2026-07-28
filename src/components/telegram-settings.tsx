'use client';

import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  Send,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Calendar,
  Fuel,
  Save,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Link2,
  Unlink,
  MessageSquare,
  Bot,
  ChevronDown,
} from 'lucide-react';
import { defaultTelegramSettings, daysOfWeek, assets } from '@/lib/mock-data';
import { useWalletStore } from '@/stores/wallet-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'disconnected' | 'linking' | 'connected';

type TelegramSettingsState = typeof defaultTelegramSettings;

const ALERT_KEYS = [
  'inboundAbove',
  'outboundAbove',
  'portfolioReaches',
  'assetRises',
  'assetDrops',
  'dailySummary',
  'weeklyReport',
  'gasExceeds',
] as const;

type TelegramAlertKey = (typeof ALERT_KEYS)[number];

function disableAllAlerts(prev: TelegramSettingsState): TelegramSettingsState {
  const next = { ...prev, enabled: false };
  // Alert entries carry different payloads per key, so the indexed write is
  // narrowed to the shared `enabled` flag they all have.
  const toggles = next as Record<TelegramAlertKey, { enabled: boolean }>;
  for (const key of ALERT_KEYS) {
    toggles[key] = { ...prev[key], enabled: false };
  }
  return next;
}

export function TelegramSettings() {
  const [settings, setSettings] = useState(defaultTelegramSettings);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [botUsername] = useState('CryptoBooksBot');

  const { currentPlan } = useWalletStore();
  const isConnected = connectionStatus === 'connected';
  const alertsActive = isConnected;
  const alertsPanelId = 'telegram-alerts-panel';

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

  const handleConnect = async () => {
    setIsLinking(true);

    try {
      const response = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-session',
          plan: currentPlan,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setTelegramLink(result.data.link);
          setConnectionStatus('linking');

          window.open(result.data.link, '_blank');

          toast.success('Telegram link opened', {
            description: 'Press Start in the bot to link your account',
          });

          const pollInterval = setInterval(async () => {
            try {
              const checkResponse = await fetch(`/api/telegram/connect?code=${result.data.code}`);
              if (checkResponse.ok) {
                const checkResult = await checkResponse.json();
                if (checkResult.success) {
                  setConnectionStatus('connected');
                  setSettings((prev) => ({ ...prev, enabled: true }));
                  clearInterval(pollInterval);
                  toast.success('Telegram connected successfully!');
                }
              }
            } catch {
              // Continue polling
            }
          }, 3000);

          setTimeout(() => clearInterval(pollInterval), 120000);
        }
      } else {
        throw new Error('Failed to generate link');
      }
    } catch (error) {
      console.error('Telegram connect error:', error);
      toast.error('Failed to create connection link');
    } finally {
      setIsLinking(false);
    }
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setTelegramLink(null);
    setSettings((prev) => disableAllAlerts(prev));
    toast.success('Telegram disconnected');
  };

  const handleCancelLinking = () => {
    setConnectionStatus('disconnected');
    setTelegramLink(null);
  };

  const handleSave = () => {
    toast.success('Alert settings saved successfully', {
      description: 'Settings will apply within a minute',
    });
  };

  const alertChecked = (enabled: boolean) => (alertsActive ? enabled : false);

  return (
    <div className="space-y-6">
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5 text-[#0052ff]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-[#f7f8f8] text-base">Telegram Alerts</CardTitle>
                  {isConnected && (
                    <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                  {connectionStatus === 'linking' && (
                    <Badge className="bg-[#0052ff]/10 text-[#0052ff] border-0 text-[10px]">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Linking…
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-[#8a8f98] text-xs mt-0.5">
                  {isConnected
                    ? 'Receive alerts and chat with the smart accountant via Telegram'
                    : 'Connect Telegram to activate alert preferences'}
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
              ) : connectionStatus === 'linking' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-[#0052ff]/30 text-[#0052ff] hover:bg-[#0052ff]/10 h-9 px-3"
                  onClick={handleCancelLinking}
                >
                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white h-9 px-4"
                  onClick={handleConnect}
                  disabled={isLinking}
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      <Link2 className="h-3.5 w-3.5 mr-1.5" />
                      Connect Telegram
                    </>
                  )}
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
          {connectionStatus === 'linking' && (
            <div className="bg-[#0052ff]/5 rounded-xl p-4 border border-[#0052ff]/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0052ff]/10 flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 text-[#0052ff] animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#f7f8f8]">Waiting for connection</p>
                  <p className="text-xs text-[#8a8f98]">
                    Press Start in @{botUsername} on Telegram to complete linking
                  </p>
                </div>
              </div>
              {telegramLink && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-[#0052ff]/30 text-[#0052ff] hover:bg-[#0052ff]/10 w-full h-9"
                  onClick={() => window.open(telegramLink, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open Telegram bot again
                </Button>
              )}
            </div>
          )}

          {isConnected && (
            <div className="bg-[#0ecb81]/5 rounded-xl p-3.5 border border-[#0ecb81]/10">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#0ecb81]/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-[#0ecb81]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-[#f7f8f8]">Connected to @{botUsername}</p>
                    <p className="text-[10px] text-[#8a8f98]">
                      Chat with the smart accountant and receive alerts
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#0052ff] hover:text-[#0052ff] hover:bg-[#0052ff]/10 text-xs h-7"
                  onClick={() => window.open(`https://t.me/${botUsername}`, '_blank')}
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                  Open Chat
                </Button>
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
              {!isConnected && connectionStatus !== 'linking' && (
                <div className="rounded-xl px-3.5 py-2.5 border border-white/5 bg-[#191a1b]/40">
                  <p className="text-xs text-[#8a8f98]">
                    Alert toggles stay off until Telegram is connected. Link @{botUsername} to enable
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
                {/* Incoming transfers */}
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

                {/* Outgoing transfers */}
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

                {/* Portfolio threshold */}
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

                {/* Asset rises */}
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

                {/* Asset drops */}
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

                {/* Daily summary */}
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

                {/* Weekly report */}
                <AlertRow
                  muted={!alertsActive}
                  icon={<Calendar className="h-4 w-4 text-[#f7931a]" />}
                  iconBg="bg-[#f7931a]/10"
                  title="Weekly report every"
                  description="Weekly report with all transactions"
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

                {/* Gas fees */}
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
              </div>
            </div>
          </div>

          <div className="bg-[#191a1b]/50 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2.5">
              <Bot className="h-4 w-4 text-[#0052ff] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#d0d6e0]">
                  The smart accountant is also available on Telegram
                </p>
                <p className="text-[10px] text-[#8a8f98]">
                  Ask about your wallet, taxes, and get instant reports
                </p>
              </div>
            </div>
          </div>

          {isConnected && (
            <div className="flex justify-end pt-1">
              <Button
                className="rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white px-8"
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
