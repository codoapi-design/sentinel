'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Building2,
  Check,
  Clock,
  FileText,
  Gift,
  Network,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { pricingTiers, type PricingTier } from '@/lib/mock-data';
import { PaymentModal } from '@/components/payment-modal';
import {
  FREE_TRIAL_TX,
  createSubscriptionPayload,
  useSubscriptionStore,
  type Subscription,
} from '@/stores/subscription-store';
import { useWalletStore } from '@/stores/wallet-store';
import { toWalletPlanId } from '@/lib/plans/entitlements';

// ============================================================
// Plan Icon
// ============================================================

function PlanIcon({ planId }: { planId: string }) {
  switch (planId) {
    case 'free':
      return <Gift className="h-5 w-5 text-[#8a8f98]" />;
    case 'starter':
      return <Zap className="h-5 w-5 text-[#0ecb81]" />;
    case 'pro':
      return <Sparkles className="h-5 w-5 text-[#0052ff]" />;
    case 'enterprise':
    case 'business':
      return <Building2 className="h-5 w-5 text-[#f7931a]" />;
    default:
      return <Wallet className="h-5 w-5 text-[#8a8f98]" />;
  }
}

// ============================================================
// Limit Row
// ============================================================

function LimitRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-[#191a1b] rounded-lg">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[#8a8f98]" />
        <span className="text-xs text-[#8a8f98]">{label}</span>
      </div>
      <span className="text-xs font-medium text-[#d0d6e0]">
        {value === Infinity ? '∞' : value}
      </span>
    </div>
  );
}

function syncSubscription(subscription: Subscription) {
  return fetch('/api/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  }).catch(err => {
    console.error('Failed to sync subscription:', err);
    return null;
  });
}

/** After activate/renew: resume incremental sync so missing history is backfilled. */
async function resumeWalletSyncs() {
  const { wallets, syncWallet } = useWalletStore.getState();
  for (const wallet of wallets) {
    try {
      await syncWallet(wallet.id, 'auto');
    } catch (err) {
      console.warn('[Subscription] Resume sync failed for', wallet.id, err);
    }
  }
}

async function activatePlan(args: {
  planId: string;
  billingPeriod: 'monthly' | 'yearly';
  txHash: string;
  paymentToken: Subscription['paymentToken'];
  paymentChain: number;
  price?: number;
  successMessage: string;
  /** When true, skip POST /api/subscription (already activated via payments/confirm). */
  skipServerSync?: boolean;
}) {
  const payload = createSubscriptionPayload({
    planId: args.planId,
    billingPeriod: args.billingPeriod,
    txHash: args.txHash,
    paymentToken: args.paymentToken,
    paymentChain: args.paymentChain,
    price: args.price,
  });

  useSubscriptionStore.getState().setSubscription(payload);
  useWalletStore.getState().setCurrentPlan(toWalletPlanId(args.planId));
  if (!args.skipServerSync) {
    await syncSubscription(payload);
  }
  toast.success(args.successMessage);
  void resumeWalletSyncs();
}

// ============================================================
// Pricing Page
// ============================================================

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentTier, setPaymentTier] = useState<PricingTier | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);

  const isActive = useSubscriptionStore(s => s.isActive);
  const hasUsedFreeTrial = useSubscriptionStore(s => s.hasUsedFreeTrial);
  const subscription = useSubscriptionStore(s => s.subscription);

  const freeTrialState = useMemo(() => {
    const used = hasUsedFreeTrial();
    const activeFree =
      isActive() && subscription?.planId === 'free' && new Date(subscription.endDate) > new Date();
    if (activeFree) return 'active' as const;
    if (used) return 'used' as const;
    return 'available' as const;
  }, [hasUsedFreeTrial, isActive, subscription]);

  const getPrice = (tier: PricingTier) => {
    if (tier.isFree) return 0;
    if (billingPeriod === 'yearly') return tier.yearlyMonthly;
    return tier.price;
  };

  const handleSubscribe = (tier: PricingTier) => {
    if (tier.isFree) {
      void handleStartFreeTrial(tier);
      return;
    }
    setPaymentTier(tier);
  };

  const handleStartFreeTrial = async (tier: PricingTier) => {
    if (freeTrialState === 'active') {
      toast.info('Your Free Plan trial is already active');
      return;
    }
    if (freeTrialState === 'used') {
      toast.info('Free Plan trial already used on this account');
      return;
    }

    setStartingTrial(true);
    try {
      const trialDays = tier.trialDays ?? 3;
      await activatePlan({
        planId: 'free',
        billingPeriod: 'monthly',
        txHash: FREE_TRIAL_TX,
        paymentToken: 'FREE',
        paymentChain: 0,
        price: 0,
        successMessage: `Free Plan activated — ${trialDays} days to explore Radareum`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start Free Plan');
    } finally {
      setStartingTrial(false);
    }
  };

  const handlePaymentSuccess = (args: {
    txHash: string;
    tierId: string;
    period: 'monthly' | 'yearly';
    paymentToken: 'USDC' | 'USDT';
    paymentChain: number;
    priceUsd: number;
  }) => {
    const tier = pricingTiers.find(t => t.id === args.tierId);
    setPaymentTier(null);
    // Server already activated via /api/payments/confirm — sync local store only.
    void activatePlan({
      planId: args.tierId,
      billingPeriod: args.period,
      txHash: args.txHash,
      paymentToken: args.paymentToken,
      paymentChain: args.paymentChain,
      price: args.priceUsd,
      successMessage: `${tier?.nameEn || 'Plan'} activated — wallet sync resumed`,
      skipServerSync: true,
    });
  };

  const freeCtaLabel =
    freeTrialState === 'active'
      ? 'Trial active'
      : freeTrialState === 'used'
        ? 'Trial used'
        : startingTrial
          ? 'Starting…'
          : 'Start Free Trial';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#f7f8f8] mb-2">Choose the right plan</h2>
        <p className="text-sm text-[#8a8f98] mb-4">
          Start free for 3 days, or pay with crypto — USDC or USDT on any EVM network
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-[#0f1011] border border-white/5 rounded-full px-1 py-1">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              billingPeriod === 'monthly'
                ? 'bg-[#0052ff] text-white'
                : 'text-[#8a8f98] hover:text-[#d0d6e0]'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              billingPeriod === 'yearly'
                ? 'bg-[#0052ff] text-white'
                : 'text-[#8a8f98] hover:text-[#d0d6e0]'
            }`}
          >
            Yearly
            <span className="ml-1 text-[10px] text-[#0ecb81]">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {pricingTiers.map(tier => {
          const isFree = tier.isFree === true;
          return (
            <Card
              key={tier.id}
              className={`relative overflow-hidden bg-[#0f1011] transition-all duration-300 hover:border-white/10 ${
                tier.highlighted
                  ? 'border-[#0052ff]/50 shadow-lg shadow-[#0052ff]/5'
                  : isFree
                    ? 'border-white/10'
                    : 'border-white/5'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-l from-[#0052ff] via-[#0052ff] to-[#0052ff]/50" />
              )}

              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <PlanIcon planId={tier.id} />
                  {tier.badge && (
                    <Badge
                      className={`rounded-full text-[10px] h-5 ${
                        isFree
                          ? 'bg-white/10 text-[#d0d6e0] border-white/10'
                          : 'bg-[#0052ff] text-white'
                      }`}
                    >
                      {tier.badge}
                    </Badge>
                  )}
                </div>

                <h3 className="text-lg font-bold text-[#f7f8f8] mb-0.5">{tier.nameEn}</h3>
                <p className="text-[11px] text-[#8a8f98] mb-4">{tier.description}</p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold text-[#f7f8f8] font-mono-num">
                    ${getPrice(tier)}
                  </span>
                  <span className="text-[#8a8f98] text-sm">
                    {isFree ? `/${tier.trialDays ?? 3} days` : '/month'}
                  </span>
                </div>

                {!isFree && billingPeriod === 'yearly' && (
                  <p className="text-[10px] text-[#0ecb81] mb-4">
                    Yearly bill: ${(getPrice(tier) * 12).toFixed(2)} (Save $
                    {(tier.price * 12 - getPrice(tier) * 12).toFixed(2)})
                  </p>
                )}
                {(isFree || billingPeriod === 'monthly') && <div className="mb-4" />}

                <div className="space-y-1.5 mb-5">
                  <LimitRow icon={Wallet} label="Wallets" value={tier.limits.wallets} />
                  <LimitRow icon={Network} label="Networks" value={tier.limits.networks} />
                  <LimitRow
                    icon={FileText}
                    label="Transactions"
                    value={
                      tier.limits.transactions === Infinity
                        ? '∞'
                        : tier.limits.transactions.toLocaleString()
                    }
                  />
                  <LimitRow icon={Clock} label="Sync" value={tier.limits.syncInterval} />
                  {tier.limits.aiRequests != null && (
                    <LimitRow icon={Bot} label="AI requests" value={tier.limits.aiRequests} />
                  )}
                </div>

                <ul className="space-y-2.5 mb-5">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#d0d6e0]">
                      <div className="w-4 h-4 rounded-full bg-[#0ecb81]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-2.5 w-2.5 text-[#0ecb81]" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(tier)}
                  disabled={
                    isFree
                      ? startingTrial || freeTrialState !== 'available'
                      : false
                  }
                  className={`w-full rounded-full font-medium text-sm h-10 ${
                    tier.highlighted
                      ? 'bg-[#0052ff] hover:bg-[#0045dd] text-white'
                      : isFree
                        ? 'bg-[#191a1b] hover:bg-[#28282c] text-[#f7f8f8] border border-[#0ecb81]/30'
                        : 'bg-[#191a1b] hover:bg-[#28282c] text-[#d0d6e0] border border-white/10'
                  }`}
                >
                  {isFree ? freeCtaLabel : 'Subscribe Now'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {paymentTier && (
        <PaymentModal
          tier={paymentTier}
          billingPeriod={billingPeriod}
          onClose={() => setPaymentTier(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
