'use client';

import { Fragment, useMemo } from 'react';
import {
  alertsForTier,
  planAllowsAlert,
  planAllowsAlertTier,
  upgradeHintForAlert,
  type AlertChannel,
  type AlertKey,
  type AlertPayloads,
  type AlertTier,
} from '@/lib/plans/alerts';
import { normalizePlanId } from '@/lib/plans/address-families';
import { filterVisibleAssets } from '@/lib/finance/visibility';
import { usePortfolio } from '@/hooks/use-portfolio';
import { AlertRow, AlertSectionDivider, AlertTierSection } from '@/components/alerts/alert-ui';
import { ALERT_ICONS, renderAlertControls } from '@/components/alerts/alert-controls';

const TIER_ORDER: AlertTier[] = ['basic', 'advanced', 'instant'];

const TIER_FOOTNOTES: Record<AlertTier, (plan: string, channel: AlertChannel) => string> = {
  basic: (plan, channel) => {
    if (plan === 'free' && channel === 'telegram') {
      return 'Core thresholds + daily Telegram report';
    }
    if (plan === 'starter') {
      return 'Core thresholds + weekly & monthly reports';
    }
    return 'Core transfer, portfolio, price, and gas alerts';
  },
  advanced: () => 'Custom signals for traders, cash-flow, clients, and yield',
  instant: () => 'Near real-time pushes via chain events (~30s sync)',
};

export function AlertCatalogPanels({
  channel,
  planId,
  payloads,
  channelReady,
  onUpdate,
  onUpgrade,
}: {
  channel: AlertChannel;
  planId: string;
  payloads: AlertPayloads;
  /** Telegram connected / email alerts enabled */
  channelReady: boolean;
  onUpdate: (key: AlertKey, field: string, value: boolean | number | string) => void;
  onUpgrade?: () => void;
}) {
  const plan = normalizePlanId(planId);
  const { portfolio, isLoading } = usePortfolio();

  const walletAssets = useMemo(() => {
    const tokens = filterVisibleAssets(portfolio?.tokens || [], false);
    const bySymbol = new Map<string, string>();
    for (const token of tokens) {
      const symbol = token.symbol?.trim();
      if (!symbol) continue;
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, token.name ? `${symbol} · ${token.name}` : symbol);
      }
    }
    return [...bySymbol.entries()]
      .map(([symbol, label]) => ({ symbol, label }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [portfolio?.tokens]);

  return (
    <div className="space-y-4">
      {TIER_ORDER.map(tier => {
        const defs = alertsForTier(tier, channel);
        if (defs.length === 0) return null;

        const tierUnlocked = planAllowsAlertTier(plan, tier);
        const sectionLocked = !tierUnlocked;

        return (
          <AlertTierSection
            key={tier}
            tier={tier}
            locked={sectionLocked}
            onUpgrade={onUpgrade}
            footnote={TIER_FOOTNOTES[tier](plan, channel)}
          >
            {defs.map((def, index) => {
              const allowed = planAllowsAlert(plan, def.key, channel);
              const interactive = channelReady && allowed;
              const lockedRow = !allowed;
              const hint = upgradeHintForAlert(plan, def.key, channel);
              const icons = ALERT_ICONS[def.key];
              const enabled = Boolean(
                (payloads[def.key] as { enabled?: boolean } | undefined)?.enabled,
              );

              return (
                <Fragment key={def.key}>
                  {index > 0 && <AlertSectionDivider />}
                  <AlertRow
                    muted={!channelReady || lockedRow}
                    locked={lockedRow}
                    lockHint={hint}
                    icon={icons.icon}
                    iconBg={icons.iconBg}
                    title={def.title}
                    description={def.description}
                    control={renderAlertControls(def.key, payloads, {
                      interactive,
                      checked: interactive ? enabled : false,
                      update: onUpdate,
                      walletAssets,
                      assetsLoading: isLoading,
                    })}
                  />
                </Fragment>
              );
            })}
          </AlertTierSection>
        );
      })}
    </div>
  );
}
