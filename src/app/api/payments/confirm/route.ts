import { NextRequest, NextResponse } from 'next/server';
import {
  decodeEventLog,
  getAddress,
  isHash,
  type Address,
  type Hex,
} from 'viem';

import { pricingTiers } from '@/lib/mock-data';
import { PAYMENT_CONTRACT_ABI } from '@/lib/payments/abi';
import { activatePaidSubscription } from '@/lib/payments/activate';
import { getPaymentContractAddress } from '@/lib/payments/config';
import { onChainPlanId, onChainUserId } from '@/lib/payments/ids';
import { getPaymentPublicClient } from '@/lib/payments/rpc';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type ConfirmBody = {
  txHash?: string;
  chainId?: number;
  planId?: string;
  billingPeriod?: 'monthly' | 'yearly';
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

    const body = (await request.json()) as ConfirmBody;
    const chainId = Number(body.chainId);
    const txHash = body.txHash;
    const planId = body.planId;
    const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

    if (!txHash || !isHash(txHash) || !Number.isFinite(chainId) || !planId) {
      return NextResponse.json({ error: 'Missing txHash, chainId, or planId' }, { status: 400 });
    }

    const contract = getPaymentContractAddress(chainId);
    if (!contract) {
      return NextResponse.json({ error: `No payment contract on chain ${chainId}` }, { status: 400 });
    }

    const tier = pricingTiers.find(t => t.id === planId);
    if (!tier || tier.isFree) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const expectedUserId = onChainUserId(user.id).toLowerCase();
    const expectedPlanId = onChainPlanId(planId).toLowerCase();
    const priceUsd = billingPeriod === 'yearly' ? tier.yearlyMonthly : tier.price;

    const client = getPaymentPublicClient(chainId);
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

    let matched:
      | {
          payer: Address;
          paymentToken: Address;
          amount: bigint;
          intentNonce: bigint;
        }
      | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: PAYMENT_CONTRACT_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== 'PaymentReceived') continue;

        const args = decoded.args as {
          userId: Hex;
          payer: Address;
          planId: Hex;
          paymentToken: Address;
          amount: bigint;
          intentNonce: bigint;
        };

        if (args.userId.toLowerCase() !== expectedUserId) continue;
        if (args.planId.toLowerCase() !== expectedPlanId) continue;

        matched = {
          payer: getAddress(args.payer),
          paymentToken: getAddress(args.paymentToken),
          amount: args.amount,
          intentNonce: args.intentNonce,
        };
        break;
      } catch {
        // not our event
      }
    }

    if (!matched) {
      return NextResponse.json(
        { error: 'PaymentReceived event not found for this user/plan in the transaction' },
        { status: 400 },
      );
    }

    const admin = createServerClient();
    const period = await activatePaidSubscription({
      supabase: admin,
      userId: user.id,
      planId,
      billingPeriod,
      priceUsd,
      txHash,
      paymentToken: matched.paymentToken,
      paymentChain: chainId,
    });

    return NextResponse.json({
      success: true,
      planId,
      billingPeriod,
      priceUsd,
      chainId,
      txHash,
      payer: matched.payer,
      paymentToken: matched.paymentToken,
      amount: matched.amount.toString(),
      intentNonce: matched.intentNonce.toString(),
      startDate: period.startDate,
      endDate: period.endDate,
    });
  } catch (error) {
    console.error('[Payments/confirm]', error);
    const message = error instanceof Error ? error.message : 'Failed to confirm payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
