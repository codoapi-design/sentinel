'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Lock, Sparkles, Zap } from 'lucide-react';
import {
  ALERT_TIER_META,
  type AlertTier,
} from '@/lib/plans/alerts';
import { cn } from '@/lib/utils';

export function AlertRow({
  icon,
  iconBg,
  title,
  description,
  control,
  muted,
  locked,
  lockHint,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description: string;
  control: ReactNode;
  muted?: boolean;
  locked?: boolean;
  lockHint?: string | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-4 transition-colors',
        locked || muted ? 'bg-transparent' : 'hover:bg-[#191a1b]/50',
        locked && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            iconBg,
            (muted || locked) && 'opacity-70',
          )}
        >
          {locked ? <Lock className="h-3.5 w-3.5 text-[#8a8f98]" /> : icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('text-sm', muted || locked ? 'text-[#8a8f98]' : 'text-[#d0d6e0]')}>
              {title}
            </p>
            {locked && (
              <Badge className="bg-white/5 text-[#8a8f98] border-0 text-[9px] px-1.5 py-0 h-4">
                Locked
              </Badge>
            )}
          </div>
          <p className="text-xs text-[#8a8f98]">
            {locked && lockHint ? lockHint : description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">{control}</div>
    </div>
  );
}

export function AlertTierSection({
  tier,
  locked,
  children,
  onUpgrade,
  footnote,
}: {
  tier: AlertTier;
  locked: boolean;
  children: ReactNode;
  onUpgrade?: () => void;
  footnote?: string;
}) {
  const meta = ALERT_TIER_META[tier];
  const TierIcon = tier === 'instant' ? Zap : tier === 'advanced' ? Sparkles : null;

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        locked ? 'border-white/5 bg-[#0c0d0e]/40' : 'border-white/5',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5',
          locked ? 'bg-[#191a1b]/30' : 'bg-[#191a1b]/50',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.accentBg)}>
            {locked ? (
              <Lock className="h-3.5 w-3.5 text-[#8a8f98]" />
            ) : TierIcon ? (
              <TierIcon className={cn('h-3.5 w-3.5', meta.accent)} />
            ) : (
              <span className={cn('text-[10px] font-semibold', meta.accent)}>B</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[#f7f8f8]">{meta.label}</p>
              <Badge className={cn('border-0 text-[10px]', meta.accentBg, meta.accent)}>
                {meta.badgePlan}+
              </Badge>
            </div>
            {footnote && <p className="text-[10px] text-[#8a8f98] mt-0.5">{footnote}</p>}
          </div>
        </div>

        {locked && onUpgrade && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-white/10 text-xs text-[#d0d6e0] hover:bg-white/5 shrink-0"
            onClick={onUpgrade}
          >
            Upgrade
          </Button>
        )}
      </div>

      <div className={cn(locked && 'pointer-events-none select-none')}>{children}</div>
    </div>
  );
}

export function AlertSectionDivider() {
  return <Separator className="bg-white/5" />;
}

export function PlanAlertsBanner({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl px-3.5 py-3 border border-white/5 bg-[#191a1b]/40 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#d0d6e0]">{title}</p>
        <p className="text-[11px] text-[#8a8f98] mt-0.5">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg bg-[#0052ff] hover:bg-[#0045dd] text-white text-xs shrink-0"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
