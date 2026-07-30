import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/referral/leaderboard — top referrers (public motivation board)
 */
export async function GET() {
  try {
    const admin = createServerClient();
    const { data: rows, error } = await admin
      .from('referral_profiles')
      .select('user_id, referral_code, total_referrals, paid_conversions, total_commission_usd, activation_rewards_granted')
      .eq('status', 'active')
      .order('total_commission_usd', { ascending: false })
      .limit(25);

    if (error) {
      console.warn('[Referral Leaderboard]', error.message);
      return NextResponse.json({ leaders: [] });
    }

    const userIds = (rows || []).map(r => r.user_id);
    const { data: profiles } = userIds.length
      ? await admin
          .from('user_profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', userIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null; email: string; avatar_url: string | null }> };

    const byId = new Map((profiles || []).map(p => [p.user_id, p]));

    const leaders = (rows || []).map((row, index) => {
      const p = byId.get(row.user_id);
      const name =
        p?.full_name?.trim() ||
        p?.email?.split('@')[0] ||
        `Member ${row.referral_code.slice(0, 4)}`;
      return {
        rank: index + 1,
        displayName: name,
        avatarUrl: p?.avatar_url || null,
        totalReferrals: row.total_referrals,
        paidConversions: row.paid_conversions,
        totalCommissionUsd: Number(row.total_commission_usd || 0),
        activationRewards: row.activation_rewards_granted,
        codePreview: `${row.referral_code.slice(0, 2)}••••${row.referral_code.slice(-2)}`,
      };
    });

    return NextResponse.json({ leaders });
  } catch (error) {
    console.error('[Referral Leaderboard]', error);
    return NextResponse.json({ leaders: [] });
  }
}
