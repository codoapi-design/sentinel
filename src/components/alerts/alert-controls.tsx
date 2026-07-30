'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell,
  Calendar,
  Clock,
  DollarSign,
  Fuel,
  Activity,
  AlertTriangle,
  ArrowUpDown,
  FileBarChart,
  Gauge,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRound,
  WifiOff,
  Bug,
} from 'lucide-react';
import { daysOfWeek } from '@/lib/mock-data';
import { type AlertKey, type AlertPayloads } from '@/lib/plans/alerts';

const inputClass =
  'w-24 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50';
const selectClass =
  'w-28 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs disabled:opacity-50';

export type WalletAssetOption = {
  symbol: string;
  label: string;
};

export const ALERT_ICONS: Record<AlertKey, { icon: ReactNode; iconBg: string }> = {
  inboundAbove: {
    icon: <DollarSign className="h-4 w-4 text-[#0ecb81]" />,
    iconBg: 'bg-[#0ecb81]/10',
  },
  outboundAbove: {
    icon: <DollarSign className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  portfolioReaches: {
    icon: <Bell className="h-4 w-4 text-[#0052ff]" />,
    iconBg: 'bg-[#0052ff]/10',
  },
  assetRises: {
    icon: <TrendingUp className="h-4 w-4 text-[#0ecb81]" />,
    iconBg: 'bg-[#0ecb81]/10',
  },
  assetDrops: {
    icon: <TrendingDown className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  gasExceeds: {
    icon: <Fuel className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  dailySummary: {
    icon: <Clock className="h-4 w-4 text-[#627eea]" />,
    iconBg: 'bg-[#627eea]/10',
  },
  weeklyReport: {
    icon: <Calendar className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  monthlyReport: {
    icon: <FileBarChart className="h-4 w-4 text-[#0052ff]" />,
    iconBg: 'bg-[#0052ff]/10',
  },
  multiAssetMoves: {
    icon: <Sparkles className="h-4 w-4 text-[#0052ff]" />,
    iconBg: 'bg-[#0052ff]/10',
  },
  namedClientTransfer: {
    icon: <UserRound className="h-4 w-4 text-[#0ecb81]" />,
    iconBg: 'bg-[#0ecb81]/10',
  },
  unknownAddress: {
    icon: <AlertTriangle className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  tradingVolumeSpike: {
    icon: <Activity className="h-4 w-4 text-[#0052ff]" />,
    iconBg: 'bg-[#0052ff]/10',
  },
  netFlowDaily: {
    icon: <ArrowUpDown className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  pnlThreshold: {
    icon: <TrendingDown className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  portfolioConcentration: {
    icon: <Gauge className="h-4 w-4 text-[#0052ff]" />,
    iconBg: 'bg-[#0052ff]/10',
  },
  dormancyBreak: {
    icon: <Bell className="h-4 w-4 text-[#627eea]" />,
    iconBg: 'bg-[#627eea]/10',
  },
  gasWeekly: {
    icon: <Fuel className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  stakingRewards: {
    icon: <Sparkles className="h-4 w-4 text-[#0ecb81]" />,
    iconBg: 'bg-[#0ecb81]/10',
  },
  instantLargeTransfer: {
    icon: <ArrowUpDown className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  tokenApprovalRisk: {
    icon: <ShieldAlert className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  defiHealthFactor: {
    icon: <Gauge className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
  spamTokenDetected: {
    icon: <Bug className="h-4 w-4 text-[#f7931a]" />,
    iconBg: 'bg-[#f7931a]/10',
  },
  syncFailure: {
    icon: <WifiOff className="h-4 w-4 text-[#f6465d]" />,
    iconBg: 'bg-[#f6465d]/10',
  },
};

type UpdateFn = (key: AlertKey, field: string, value: boolean | number | string) => void;

function AssetSelect({
  value,
  onChange,
  disabled,
  options,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  options: WalletAssetOption[];
  loading?: boolean;
}) {
  const hasOptions = options.length > 0;
  const valueInList = hasOptions && options.some(o => o.symbol === value);
  const fallbackSymbol = hasOptions ? options[0].symbol : '';
  const selectValue = hasOptions ? (valueInList ? value : fallbackSymbol) : undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hasOptions || disabled) return;
    if (!valueInList && fallbackSymbol && fallbackSymbol !== value) {
      onChangeRef.current(fallbackSymbol);
    }
  }, [hasOptions, valueInList, fallbackSymbol, value, disabled]);

  return (
    <Select
      value={selectValue}
      onValueChange={onChange}
      disabled={disabled || !hasOptions || loading}
    >
      <SelectTrigger className="min-w-[5.5rem] max-w-[9rem] h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs disabled:opacity-50">
        <SelectValue placeholder={loading ? 'Loading…' : 'No assets'} />
      </SelectTrigger>
      <SelectContent className="bg-[#191a1b] border-white/10 max-h-64">
        {options.map(asset => (
          <SelectItem key={asset.symbol} value={asset.symbol} className="text-[#d0d6e0] text-xs">
            {asset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function renderAlertControls(
  key: AlertKey,
  payloads: AlertPayloads,
  opts: {
    interactive: boolean;
    checked: boolean;
    update: UpdateFn;
    walletAssets: WalletAssetOption[];
    assetsLoading?: boolean;
  },
): ReactNode {
  const { interactive, checked, update, walletAssets, assetsLoading } = opts;
  const disabled = !interactive;

  const switchEl = (
    <Switch
      checked={checked}
      disabled={disabled || ((key === 'assetRises' || key === 'assetDrops') && walletAssets.length === 0)}
      onCheckedChange={v => update(key, 'enabled', v)}
    />
  );

  switch (key) {
    case 'inboundAbove':
    case 'outboundAbove':
    case 'portfolioReaches':
    case 'tradingVolumeSpike':
    case 'instantLargeTransfer':
    case 'gasExceeds':
    case 'gasWeekly':
      return (
        <>
          <Input
            type="number"
            value={(payloads[key] as { amount: number }).amount}
            onChange={e => update(key, 'amount', parseFloat(e.target.value) || 0)}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">
            {key === 'gasExceeds' ? 'USD/day' : key === 'gasWeekly' ? 'USD/wk' : 'USD'}
          </span>
          {switchEl}
        </>
      );

    case 'netFlowDaily':
    case 'pnlThreshold':
      return (
        <>
          <Input
            type="number"
            value={(payloads[key] as { amount: number }).amount}
            onChange={e => update(key, 'amount', parseFloat(e.target.value) || 0)}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">USD</span>
          {switchEl}
        </>
      );

    case 'assetRises':
    case 'assetDrops':
      return (
        <>
          <AssetSelect
            value={(payloads[key] as { asset: string }).asset}
            onChange={v => update(key, 'asset', v)}
            disabled={disabled}
            options={walletAssets}
            loading={assetsLoading}
          />
          <Input
            type="number"
            value={(payloads[key] as { percentage: number }).percentage}
            onChange={e => update(key, 'percentage', parseFloat(e.target.value) || 0)}
            disabled={disabled || walletAssets.length === 0}
            className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">%</span>
          {switchEl}
        </>
      );

    case 'multiAssetMoves':
    case 'portfolioConcentration':
      return (
        <>
          <Input
            type="number"
            value={(payloads[key] as { percentage: number }).percentage}
            onChange={e => update(key, 'percentage', parseFloat(e.target.value) || 0)}
            disabled={disabled}
            className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">%</span>
          {switchEl}
        </>
      );

    case 'dailySummary':
      return (
        <>
          <Input
            type="time"
            value={payloads.dailySummary.time}
            onChange={e => update('dailySummary', 'time', e.target.value)}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
          {switchEl}
        </>
      );

    case 'weeklyReport':
      return (
        <>
          <Select
            value={payloads.weeklyReport.day}
            onValueChange={v => update('weeklyReport', 'day', v)}
            disabled={disabled}
          >
            <SelectTrigger className={selectClass}>
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
          {switchEl}
        </>
      );

    case 'monthlyReport':
      return (
        <>
          <Input
            type="number"
            min={1}
            max={28}
            value={payloads.monthlyReport.day}
            onChange={e => update('monthlyReport', 'day', parseInt(e.target.value) || 1)}
            disabled={disabled}
            className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">of month</span>
          {switchEl}
        </>
      );

    case 'dormancyBreak':
      return (
        <>
          <Input
            type="number"
            min={1}
            value={payloads.dormancyBreak.days}
            onChange={e => update('dormancyBreak', 'days', parseInt(e.target.value) || 7)}
            disabled={disabled}
            className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">quiet days</span>
          {switchEl}
        </>
      );

    case 'defiHealthFactor':
      return (
        <>
          <Input
            type="number"
            step={0.05}
            value={payloads.defiHealthFactor.threshold}
            onChange={e =>
              update('defiHealthFactor', 'threshold', parseFloat(e.target.value) || 1.25)
            }
            disabled={disabled}
            className="w-20 h-8 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs font-mono-num text-center disabled:opacity-50"
            dir="ltr"
          />
          <span className="text-xs text-[#8a8f98]">HF</span>
          {switchEl}
        </>
      );

    default:
      return switchEl;
  }
}
