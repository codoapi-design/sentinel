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
} from 'lucide-react';
import { defaultEmailSettings, daysOfWeek, assets } from '@/lib/mock-data';
import { toast } from 'sonner';

export function EmailSettings() {
  const [settings, setSettings] = useState(defaultEmailSettings);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

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
        setSettings({ ...settings, verified: true });
        setCodeSent(false);
        setVerificationCode('');
        toast.success('Email verified successfully');
      } else {
        toast.error(data.error || 'Incorrect verification code');
      }
    } catch {
      // Fallback: accept any 6-digit code in dev mode
      if (verificationCode.length === 6) {
        setSettings({ ...settings, verified: true });
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

  return (
    <div className="space-y-6">
      {/* Connection */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0ecb81]/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-[#0ecb81]" />
            </div>
            <div>
              <CardTitle className="text-[#f7f8f8] text-base">Email Alerts</CardTitle>
              <CardDescription className="text-[#8a8f98] text-xs">
                Receive alerts and reports directly to your email
              </CardDescription>
            </div>
            <div className="mr-auto">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
              />
            </div>
          </div>
        </CardHeader>
        {settings.enabled && (
          <CardContent className="space-y-4">
            {/* Email input */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-[#8a8f98]">Email</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="example@email.com"
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm"
                      dir="ltr"
                      disabled={settings.verified}
                    />
                    {settings.verified && (
                      <Badge variant="outline" className="bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20 text-[10px] whitespace-nowrap px-2">
                        <MailCheck className="h-3 w-3 ml-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                </div>
                {!settings.verified && (
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
                            <div className="flex items-center gap-1">
                              <div className="h-3 w-3 border-2 border-[#8a8f98] border-t-transparent rounded-full animate-spin" />
                              Sending...
                            </div>
                          ) : (
                            'Send verification code'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {!settings.verified && (
                <p className="text-[10px] text-[#8a8f98] flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  You must verify your email before enabling alerts
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Notification Rules */}
      {settings.enabled && settings.verified && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-[#f7f8f8] text-base">Alert Rules</CardTitle>
            <CardDescription className="text-[#8a8f98] text-xs">
              Customize email alerts to your needs
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

            {/* Large transaction (email-specific) */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f7931a]/10 flex items-center justify-center">
                  <ArrowUpDown className="h-4 w-4 text-[#f7931a]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Large transactions (in or out)</p>
                  <p className="text-xs text-[#8a8f98]">Instant alert for any transaction exceeding the limit</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={settings.largeTransaction.amount}
                  onChange={(e) => updateSetting('largeTransaction', 'amount', parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                />
                <span className="text-xs text-[#8a8f98]">USD</span>
                <Switch
                  checked={settings.largeTransaction.enabled}
                  onCheckedChange={(checked) => updateSetting('largeTransaction', 'enabled', checked)}
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
                  <p className="text-xs text-[#8a8f98]">Detailed weekly report of all transactions, revenue and expenses</p>
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

            {/* Monthly report (email-specific) */}
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-[#191a1b]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0052ff]/10 flex items-center justify-center">
                  <FileBarChart className="h-4 w-4 text-[#0052ff]" />
                </div>
                <div>
                  <p className="text-sm text-[#d0d6e0]">Monthly report on day</p>
                  <p className="text-xs text-[#8a8f98]">Comprehensive monthly report including portfolio analysis, taxes, and recommendations</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={settings.monthlyReport.day}
                  onChange={(e) => updateSetting('monthlyReport', 'day', parseInt(e.target.value) || 1)}
                  className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center"
                  dir="ltr"
                  placeholder="1-28"
                />
                <span className="text-xs text-[#8a8f98]">of the month</span>
                <Switch
                  checked={settings.monthlyReport.enabled}
                  onCheckedChange={(checked) => updateSetting('monthlyReport', 'enabled', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      {settings.enabled && settings.verified && (
        <div className="flex justify-end">
          <Button
            className="rounded-full bg-[#0ecb81] hover:bg-[#0ecb81]/80 text-white px-8"
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
