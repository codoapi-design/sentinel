'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  Wallet,
  Network,
  MessageSquare,
  Clock,
  FileText,
  Zap,
  Sparkles,
  Building2,
} from 'lucide-react';
import { pricingTiers, type PricingTier } from '@/lib/mock-data';
import { PaymentModal } from '@/components/payment-modal';

// ============================================================
// Plan Icon
// ============================================================

function PlanIcon({ planId }: { planId: string }) {
  switch (planId) {
    case 'starter':
      return <Zap className="h-5 w-5 text-[#0ecb81]" />;
    case 'pro':
      return <Sparkles className="h-5 w-5 text-[#0052ff]" />;
    case 'enterprise':
      return <Building2 className="h-5 w-5 text-[#f7931a]" />;
    default:
      return <Wallet className="h-5 w-5 text-[#8a8f98]" />;
  }
}

// ============================================================
// Limit Row
// ============================================================

function LimitRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
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

// ============================================================
// Pricing Page
// ============================================================

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentTier, setPaymentTier] = useState<PricingTier | null>(null);

  const getPrice = (tier: PricingTier) => {
    if (billingPeriod === 'yearly') {
      return tier.yearlyMonthly;
    }
    return tier.price;
  };

  const handleSubscribe = (tier: PricingTier) => {
    setPaymentTier(tier);
  };

  const handlePaymentSuccess = (txHash: string, tierId: string, period: 'monthly' | 'yearly') => {
    const tier = pricingTiers.find(t => t.id === tierId);
    const price = period === 'yearly' ? (tier?.yearlyMonthly || 0) : (tier?.price || 0);

    const subscription = {
      planId: tierId,
      planName: tier?.nameEn || '',
      billingPeriod: period,
      price,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + (period === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
      txHash,
      paymentToken: 'USDC' as const,
      paymentChain: 8453,
      status: 'active' as const,
    };

    localStorage.setItem('cryptobooks_subscription', JSON.stringify(subscription));
    setPaymentTier(null);

    fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }).catch(err => console.error('Failed to sync subscription:', err));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#f7f8f8] mb-2">Choose the right plan</h2>
        <p className="text-sm text-[#8a8f98] mb-4">
          Pay with crypto and activate instantly — USDC or USDT on any EVM network
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
            <span className="mr-1 text-[10px] text-[#0ecb81]">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pricingTiers.map((tier) => (
          <Card
            key={tier.id}
            className={`relative overflow-hidden bg-[#0f1011] transition-all duration-300 hover:border-white/10 ${
              tier.highlighted
                ? 'border-[#0052ff]/50 shadow-lg shadow-[#0052ff]/5'
                : 'border-white/5'
            }`}
          >
            {/* Top accent line */}
            {tier.highlighted && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-l from-[#0052ff] via-[#0052ff] to-[#0052ff]/50" />
            )}

            <CardContent className="p-6">
              {/* Badge */}
              <div className="flex items-center gap-2 mb-3">
                <PlanIcon planId={tier.id} />
                {tier.badge && (
                  <Badge className="bg-[#0052ff] text-white rounded-full text-[10px] h-5">
                    {tier.badge}
                  </Badge>
                )}
              </div>

              {/* Plan name & price */}
              <h3 className="text-lg font-bold text-[#f7f8f8] mb-0.5">{tier.nameEn}</h3>
              <p className="text-[11px] text-[#8a8f98] mb-4">{tier.description}</p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold text-[#f7f8f8] font-mono-num">
                  ${getPrice(tier)}
                </span>
                <span className="text-[#8a8f98] text-sm">
                  /month
                </span>
              </div>

              {billingPeriod === 'yearly' && (
                <p className="text-[10px] text-[#0ecb81] mb-4">
                  Yearly bill: ${(getPrice(tier) * 12).toFixed(2)} (Save ${((tier.price * 12) - (getPrice(tier) * 12)).toFixed(2)})
                </p>
              )}
              {billingPeriod === 'monthly' && <div className="mb-4" />}

              {/* Limits grid */}
              <div className="space-y-1.5 mb-5">
                <LimitRow icon={Wallet} label="Wallets" value={tier.limits.wallets} />
                <LimitRow icon={Network} label="Networks" value={tier.limits.networks} />
                <LimitRow icon={FileText} label="Transactions" value={tier.limits.transactions === Infinity ? '∞' : tier.limits.transactions.toLocaleString()} />
                <LimitRow icon={MessageSquare} label="AI Messages" value={tier.limits.aiChats === Infinity ? '∞' : tier.limits.aiChats} />
                <LimitRow icon={Clock} label="Sync" value={tier.limits.syncInterval} />
              </div>

              {/* Features list */}
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

              {/* Subscribe button */}
              <Button
                onClick={() => handleSubscribe(tier)}
                className={`w-full rounded-full font-medium text-sm h-10 ${
                  tier.highlighted
                    ? 'bg-[#0052ff] hover:bg-[#0045dd] text-white'
                    : 'bg-[#191a1b] hover:bg-[#28282c] text-[#d0d6e0] border border-white/10'
                }`}
              >
                Subscribe Now
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Modal */}
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
