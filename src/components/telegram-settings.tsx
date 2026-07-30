'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Save,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Link2,
  Unlink,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { planDisplayName } from '@/lib/plans/address-families';
import {
  createDefaultAlertPayloads,
  disableAlertPayloads,
  type AlertKey,
  type AlertPayloads,
} from '@/lib/plans/alerts';
import { AlertCatalogPanels } from '@/components/alerts/alert-catalog-panels';
import { PlanAlertsBanner } from '@/components/alerts/alert-ui';

type ConnectionStatus = 'disconnected' | 'linking' | 'connected';

export function TelegramSettings({ onUpgrade }: { onUpgrade?: () => void }) {
  const [payloads, setPayloads] = useState<AlertPayloads>(() => createDefaultAlertPayloads());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [botUsername] = useState('CryptoBooksBot');

  const { currentPlan } = useWalletStore();
  const isConnected = connectionStatus === 'connected';
  const alertsPanelId = 'telegram-alerts-panel';

  const updateSetting = (key: AlertKey, field: string, value: boolean | number | string) => {
    if (!isConnected) return;
    setPayloads(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
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
    setPayloads(disableAlertPayloads(payloads));
    toast.success('Telegram disconnected');
  };

  const handleCancelLinking = () => {
    setConnectionStatus('disconnected');
    setTelegramLink(null);
  };

  const handleSave = () => {
    toast.success('Telegram alert settings saved', {
      description: `Applied for your ${planDisplayName(currentPlan)} plan`,
    });
  };

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
                  <Badge className="bg-white/5 text-[#8a8f98] border-0 text-[10px]">
                    {planDisplayName(currentPlan)}
                  </Badge>
                </div>
                <CardDescription className="text-[#8a8f98] text-xs mt-0.5">
                  {isConnected
                    ? 'Active alert preferences, plus chat with the smart AI to analyze your wallet'
                    : 'Connect Telegram to activate alert preferences and chat with the smart AI for wallet analysis'}
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
                      Channel live · plan gates which alerts can fire
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
              {!isConnected && connectionStatus !== 'linking' && (
                <PlanAlertsBanner
                  title="Connect Telegram to configure alerts"
                  description="Preferences stay off until the bot is linked. Your plan still determines which tiers unlock."
                />
              )}

              <AlertCatalogPanels
                channel="telegram"
                planId={currentPlan}
                payloads={payloads}
                channelReady={isConnected}
                onUpdate={updateSetting}
                onUpgrade={onUpgrade}
              />
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
