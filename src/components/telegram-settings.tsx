'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { defaultTelegramSettings, daysOfWeek, assets } from '@/lib/mock-data';
import { useWalletStore } from '@/stores/wallet-store';
import { toast } from 'sonner';

type ConnectionStatus = 'disconnected' | 'linking' | 'connected';

export function TelegramSettings() {
  const [settings, setSettings] = useState(defaultTelegramSettings);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [chatId, setChatId] = useState('');
  const [botUsername] = useState('CryptoBooksBot');

  const { currentPlan } = useWalletStore();

  const updateSetting = <K extends keyof typeof settings>(
    key: K,
    field: string,
    value: boolean | number | string
  ) => {
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
      // Generate connection link from API
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

          // Open Telegram link in new tab
          window.open(result.data.link, '_blank');

          toast.success('Telegram link opened', {
            description: 'Press Start in the bot to link your account',
          });

          // Poll for connection confirmation (simplified)
          // In production, this would use WebSocket or polling
          const pollInterval = setInterval(async () => {
            // Check if user has connected via the code
            try {
              const checkResponse = await fetch(`/api/telegram/connect?code=${result.data.code}`);
              if (checkResponse.ok) {
                const checkResult = await checkResponse.json();
                if (checkResult.success) {
                  setConnectionStatus('connected');
                  setChatId('connected');
                  clearInterval(pollInterval);
                  toast.success('Telegram connected successfully!');
                }
              }
            } catch {
              // Continue polling
            }
          }, 3000);

          // Stop polling after 2 minutes
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
    setChatId('');
    toast.success('Telegram disconnected');
  };

  const handleSave = () => {
    toast.success('Alert settings saved successfully', {
      description: 'Settings will apply within a minute',
    });
  };

  return (
    <div className="space-y-6">
      {/* Connection Card - New B3OS Style */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-[#0052ff]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-[#f7f8f8] text-base">Telegram Alerts</CardTitle>
                {connectionStatus === 'connected' && (
                  <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 ml-1" />
                    Connected
                  </Badge>
                )}
              </div>
              <CardDescription className="text-[#8a8f98] text-xs">
                {connectionStatus === 'connected'
                  ? 'Receive alerts and chat with the smart accountant via Telegram'
                  : 'Connect Telegram to receive alerts and chat with the smart accountant'}
              </CardDescription>
            </div>
            {connectionStatus === 'connected' && (
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {connectionStatus === 'disconnected' && (
            /* Disconnected State — Show Connect Button */
            <div className="bg-[#191a1b]/50 rounded-xl p-6 text-center space-y-4 border border-white/5">
              <div className="w-14 h-14 rounded-2xl bg-[#0052ff]/10 flex items-center justify-center mx-auto">
                <Send className="h-7 w-7 text-[#0052ff]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#f7f8f8] mb-1">Connect Telegram</h3>
                <p className="text-xs text-[#8a8f98]">
                  Click the button below to open the bot @{botUsername} on Telegram
                  and press Start to link your account
                </p>
              </div>
              <Button
                className="rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white px-6 h-11"
                onClick={handleConnect}
                disabled={isLinking}
              >
                {isLinking ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    Creating connection link...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 ml-2" />
                    Connect Telegram
                  </>
                )}
              </Button>
            </div>
          )}

          {connectionStatus === 'linking' && (
            /* Linking State — Show instructions */
            <div className="bg-[#0052ff]/5 rounded-xl p-6 space-y-4 border border-[#0052ff]/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-[#0052ff] animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#f7f8f8]">Waiting for connection</h3>
                  <p className="text-xs text-[#8a8f98]">
                    Press Start in the bot on Telegram to complete linking
                  </p>
                </div>
              </div>

              {telegramLink && (
                <Button
                  variant="outline"
                  className="rounded-xl border-[#0052ff]/30 text-[#0052ff] hover:bg-[#0052ff]/10 w-full"
                  onClick={() => window.open(telegramLink, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 ml-2" />
                  Open Telegram bot again
                </Button>
              )}

              <Button
                variant="ghost"
                className="text-[#8a8f98] hover:text-[#f6465d] text-xs"
                onClick={() => {
                  setConnectionStatus('disconnected');
                  setTelegramLink(null);
                }}
              >
                <Unlink className="h-3 w-3 ml-1" />
                Cancel connection
              </Button>
            </div>
          )}

          {connectionStatus === 'connected' && (
            /* Connected State — Show status and disconnect */
            <div className="bg-[#0ecb81]/5 rounded-xl p-4 border border-[#0ecb81]/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0ecb81]/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-[#0ecb81]" />
                  </div>
                  <div>
                    <p className="text-sm text-[#f7f8f8]">Connected to @{botUsername}</p>
                    <p className="text-[10px] text-[#8a8f98]">You can chat with the smart accountant via Telegram</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#0052ff] hover:text-[#0052ff] hover:bg-[#0052ff]/10 text-xs h-7"
                    onClick={() => window.open(`https://t.me/${botUsername}`, '_blank')}
                  >
                    <MessageSquare className="h-3.5 w-3.5 ml-1" />
                    Open Chat
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#f6465d] hover:text-[#f6465d] hover:bg-[#f6465d]/10 text-xs h-7"
                    onClick={handleDisconnect}
                  >
                    <Unlink className="h-3.5 w-3.5 ml-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* AI Agent Info */}
          <div className="bg-[#191a1b]/50 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2.5">
              <Bot className="h-4 w-4 text-[#0052ff]" />
              <div className="flex-1">
                <p className="text-xs text-[#d0d6e0]">The smart accountant is also available on Telegram</p>
                <p className="text-[10px] text-[#8a8f98]">Ask about your wallet, taxes, and get instant reports</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Rules — Only show when connected */}
      {connectionStatus === 'connected' && settings.enabled && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-[#f7f8f8] text-base">Alert Rules</CardTitle>
            <CardDescription className="text-[#8a8f98] text-xs">
              Customize alerts to your needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {/* Inbound above amount */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0ecb81]/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-[#0ecb81]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Incoming transfers above</p>
                  <p className="text-xs text-[#8a8f98]">Alert when receiving a large amount</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={settings.inboundAbove.amount}
                  onChange={(e) => updateSetting('inboundAbove', 'amount', parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">USD</span>
                <Switch
                  checked={settings.inboundAbove.enabled}
                  onCheckedChange={(checked) => updateSetting('inboundAbove', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Outbound above amount */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f6465d]/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-[#f6465d]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Outgoing transfers above</p>
                  <p className="text-xs text-[#8a8f98]">Alert when sending a large amount</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={settings.outboundAbove.amount}
                  onChange={(e) => updateSetting('outboundAbove', 'amount', parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">USD</span>
                <Switch
                  checked={settings.outboundAbove.enabled}
                  onCheckedChange={(checked) => updateSetting('outboundAbove', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Portfolio reaches amount */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0052ff]/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-[#0052ff]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">When wallet reaches</p>
                  <p className="text-xs text-[#8a8f98]">Alert when total value reaches a threshold</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={settings.portfolioReaches.amount}
                  onChange={(e) => updateSetting('portfolioReaches', 'amount', parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">USD</span>
                <Switch
                  checked={settings.portfolioReaches.enabled}
                  onCheckedChange={(checked) => updateSetting('portfolioReaches', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Asset rises by percentage */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0ecb81]/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-[#0ecb81]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">When an asset rises by</p>
                  <p className="text-xs text-[#8a8f98]">Alert when a specific asset price rises</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={settings.assetRises.asset}
                  onValueChange={(value) => updateSetting('assetRises', 'asset', value)}
                >
                  <SelectTrigger className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    {assets.map(a => (
                      <SelectItem key={a.id} value={a.symbol} className="text-[#d0d6e0] text-xs">
                        {a.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={settings.assetRises.percentage}
                  onChange={(e) => updateSetting('assetRises', 'percentage', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">%</span>
                <Switch
                  checked={settings.assetRises.enabled}
                  onCheckedChange={(checked) => updateSetting('assetRises', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Asset drops by percentage */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f6465d]/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-[#f6465d]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">When an asset drops by</p>
                  <p className="text-xs text-[#8a8f98]">Alert when a specific asset price drops</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={settings.assetDrops.asset}
                  onValueChange={(value) => updateSetting('assetDrops', 'asset', value)}
                >
                  <SelectTrigger className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    {assets.map(a => (
                      <SelectItem key={a.id} value={a.symbol} className="text-[#d0d6e0] text-xs">
                        {a.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={settings.assetDrops.percentage}
                  onChange={(e) => updateSetting('assetDrops', 'percentage', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">%</span>
                <Switch
                  checked={settings.assetDrops.enabled}
                  onCheckedChange={(checked) => updateSetting('assetDrops', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Daily summary */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#627eea]/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-[#627eea]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Daily summary at</p>
                  <p className="text-xs text-[#8a8f98]">Daily report of wallet value and changes</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="time"
                  value={settings.dailySummary.time}
                  onChange={(e) => updateSetting('dailySummary', 'time', e.target.value)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <Switch
                  checked={settings.dailySummary.enabled}
                  onCheckedChange={(checked) => updateSetting('dailySummary', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Weekly report */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f7931a]/10 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-[#f7931a]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Weekly report every</p>
                  <p className="text-xs text-[#8a8f98]">Weekly report with all transactions</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={settings.weeklyReport.day}
                  onValueChange={(value) => updateSetting('weeklyReport', 'day', value)}
                >
                  <SelectTrigger className="w-28 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    {daysOfWeek.map(day => (
                      <SelectItem key={day} value={day} className="text-[#d0d6e0] text-xs">
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={settings.weeklyReport.enabled}
                  onCheckedChange={(checked) => updateSetting('weeklyReport', 'enabled', checked)}
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Gas exceeds */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f6465d]/10 flex items-center justify-center">
                  <Fuel className="h-4 w-4 text-[#f6465d]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Gas fees exceed</p>
                  <p className="text-xs text-[#8a8f98]">Alert when daily gas fees exceed a threshold</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={settings.gasExceeds.amount}
                  onChange={(e) => updateSetting('gasExceeds', 'amount', parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">USD/day</span>
                <Switch
                  checked={settings.gasExceeds.enabled}
                  onCheckedChange={(checked) => updateSetting('gasExceeds', 'enabled', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      {connectionStatus === 'connected' && settings.enabled && (
        <div className="flex justify-end">
          <Button
            className="rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white px-8"
            onClick={handleSave}
          >
            <Save className="h-4 w-4 ml-2" />
            Save Settings
          </Button>
        </div>
      )}
    </div>
  );
}
