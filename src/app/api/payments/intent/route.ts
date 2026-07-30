import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress, type Address, type Hex } from 'viem';

import { USDC_ADDRESSES, USDT_ADDRESSES } from '@/lib/web3-config';
import { pricingTiers } from '@/lib/mock-data';
import {
  getPaymentContractAddress,
  INTENT_DEADLINE_SECONDS,
  type PaymentTokenSymbol,
} from '@/lib/payments/config';
import { onChainPlanId, onChainUserId, tokenDecimalsFor, usdToTokenAmount } from '@/lib/payments/ids';
import { resolveOnChainReferrer } from '@/lib/payments/referrer';
import { signPaymentIntent } from '@/lib/payments/sign-intent';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type IntentBody = {
  planId?: string;
  billingPeriod?: 'monthly' | 'yearly';
  paymentToken?: PaymentTokenSymbol;
  chainId?: number;
  payer?: string;
};

export async function POST(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = (await request.json()) as IntentBody;
    const planId = body.planId;
    const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
    const paymentToken = body.paymentToken === 'USDT' ? 'USDT' : 'USDC';
    const chainId = Number(body.chainId);
    const payerRaw = body.payer;

    if (!planId || !payerRaw || !Number.isFinite(chainId)) {
      return NextResponse.json({ error: 'Missing planId, payer, or chainId' }, { status: 400 });
    }

    if (!isAddress(payerRaw)) {
      return NextResponse.json({ error: 'Invalid payer address' }, { status: 400 });
    }

    const contract = getPaymentContractAddress(chainId);
    if (!contract) {
      return NextResponse.json(
        { error: `Payments are not available on chain ${chainId} yet` },
        { status: 400 },
      );
    }

    const tier = pricingTiers.find(t => t.id === planId);
    if (!tier || tier.isFree || planId === 'free') {
      return NextResponse.json({ error: 'Invalid paid plan' }, { status: 400 });
    }

    const priceUsd = billingPeriod === 'yearly' ? tier.yearlyMonthly : tier.price;
    if (!(priceUsd > 0)) {
      return NextResponse.json({ error: 'Invalid plan price' }, { status: 400 });
    }

    const tokenAddress =
      paymentToken === 'USDC' ? USDC_ADDRESSES[chainId] : USDT_ADDRESSES[chainId];
    if (!tokenAddress) {
      return NextResponse.json(
        { error: `${paymentToken} is not supported on this network` },
        { status: 400 },
      );
    }

    const payer = getAddress(payerRaw) as Address;
    const admin = createServerClient();
    const referrer = await resolveOnChainReferrer({
      supabase: admin,
      payerUserId: user.id,
      payerAddress: payer,
    });

    const decimals = tokenDecimalsFor(chainId, paymentToken);
    const amount = usdToTokenAmount(priceUsd, decimals);
    const nowSec = Math.floor(Date.now() / 1000);
    const nonce = BigInt(nowSec) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(nowSec + INTENT_DEADLINE_SECONDS);

    const intent = {
      userId: onChainUserId(user.id),
      planId: onChainPlanId(planId),
      paymentToken: tokenAddress,
      amount,
      payer,
      referrer,
      nonce,
      deadline,
    };

    const { signature, signer } = await signPaymentIntent({ chainId, intent });

    return NextResponse.json({
      chainId,
      contract,
      paymentToken,
      priceUsd,
      billingPeriod,
      planId,
      signer,
      intent: {
        userId: intent.userId,
        planId: intent.planId,
        paymentToken: intent.paymentToken,
        amount: intent.amount.toString(),
        payer: intent.payer,
        referrer: intent.referrer,
        nonce: intent.nonce.toString(),
        deadline: intent.deadline.toString(),
      },
      signature: signature as Hex,
    });
  } catch (error) {
    console.error('[Payments/intent]', error);
    const message = error instanceof Error ? error.message : 'Failed to create payment intent';
    const status = message.includes('PAYMENT_SIGNER_PRIVATE_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
