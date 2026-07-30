import { getAddress, zeroAddress, type Address } from 'viem';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * Resolve on-chain `referrer` for a PaymentIntent.
 * Returns zero address when ineligible (100% treasury).
 */
export async function resolveOnChainReferrer(args: {
  supabase: SupabaseClient<Database>;
  payerUserId: string;
  payerAddress: Address;
}): Promise<Address> {
  const { supabase, payerUserId, payerAddress } = args;
  const payer = getAddress(payerAddress);

  const { data: attribution } = await supabase
    .from('referral_attributions')
    .select('*')
    .eq('referred_user_id', payerUserId)
    .in('status', ['signed_up', 'converted'])
    .maybeSingle();

  if (!attribution) return zeroAddress;
  if (attribution.referrer_user_id === payerUserId) return zeroAddress;

  const periodEnd = attribution.commission_period_end
    ? new Date(attribution.commission_period_end)
    : null;
  if (!periodEnd || periodEnd.getTime() < Date.now()) return zeroAddress;

  const { data: referrer } = await supabase
    .from('referral_profiles')
    .select('payout_wallet, status, user_id')
    .eq('user_id', attribution.referrer_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!referrer?.payout_wallet) return zeroAddress;

  let wallet: Address;
  try {
    wallet = getAddress(referrer.payout_wallet);
  } catch {
    return zeroAddress;
  }

  // Contract blocks referrer == payer; also block self-referral via same wallet.
  if (wallet.toLowerCase() === payer.toLowerCase()) return zeroAddress;

  return wallet;
}
