'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileAvatar } from '@/components/profile-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Check,
  Copy,
  Gift,
  Link2,
  Loader2,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  clearReferralCode,
  getBrowserFingerprint,
  readReferralCode,
} from '@/lib/referrals/client';
import { useProfileStore } from '@/stores/profile-store';

type ReferralStatus = {
  joined: boolean;
  policy: {
    commissionPct: number;
    commissionMonths: number;
    activationRewardDays: number;
    maxActivationRewardsPerMonth: number;
    rules: string[];
  };
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  profile: null | {
    referralCode: string;
    payoutWallet: string;
    totalReferrals: number;
    paidConversions: number;
    totalCommissionUsd: number;
    activationRewardsGranted: number;
    rewardPlanId: string | null;
    rewardPlanActiveUntil: string | null;
    rewardActive: boolean;
    link: string;
    status: string;
  };
  recentEvents?: Array<{
    id: string;
    event_type: string;
    plan_id: string | null;
    amount_usd: number;
    note: string | null;
    created_at: string;
  }>;
};

type Leader = {
  rank: number;
  displayName: string;
  avatarUrl: string | null;
  totalReferrals: number;
  paidConversions: number;
  totalCommissionUsd: number;
  activationRewards: number;
  codePreview: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || 'S';
}

function shortWallet(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

export function ReferralProgram() {
  const { user } = useAuth();
  const profile = useProfileStore();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const [payoutWallet, setPayoutWallet] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, boardRes] = await Promise.all([
        fetch('/api/referral'),
        fetch('/api/referral/leaderboard'),
      ]);
      if (statusRes.ok) {
        const next = (await statusRes.json()) as ReferralStatus;
        setStatus(next);
        useProfileStore.getState().setProfile({
          fullName: next.displayName || useProfileStore.getState().fullName,
          email: next.email || useProfileStore.getState().email,
          avatarUrl:
            next.avatarUrl !== undefined
              ? next.avatarUrl
              : useProfileStore.getState().avatarUrl,
          hydrated: true,
        });
      }
      if (boardRes.ok) {
        const board = await boardRes.json();
        setLeaders(board.leaders || []);
      }
    } catch (err) {
      console.warn('[Referral] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Attribute signup if cookie present
  useEffect(() => {
    if (!user) return;
    const code = readReferralCode();
    if (!code) return;
    void fetch('/api/referral/attribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        fingerprint: getBrowserFingerprint(),
      }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (data.success || data.reason === 'already_attributed') {
          clearReferralCode();
        }
      })
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutWallet }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not join');
        return;
      }
      toast.success('Welcome to the Referral Program');
      setJoinOpen(false);
      setPayoutWallet('');
      await load();
    } catch {
      toast.error('Could not join referral program');
    } finally {
      setJoining(false);
    }
  };

  const handleCopy = async () => {
    const link = status?.profile?.link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const policy = status?.policy;
  const joined = Boolean(status?.joined && status.profile);
  const displayName = profile.fullName || status?.displayName || 'Member';
  const avatarUrl = profile.avatarUrl ?? status?.avatarUrl ?? null;

  const stats = useMemo(() => {
    if (!status?.profile) return null;
    return [
      { label: 'Referrals', value: String(status.profile.totalReferrals), icon: Users },
      {
        label: 'Paid conversions',
        value: String(status.profile.paidConversions),
        icon: ShieldCheck,
      },
      {
        label: 'Earned',
        value: formatUsd(status.profile.totalCommissionUsd),
        icon: Wallet,
      },
      {
        label: 'Free months',
        value: String(status.profile.activationRewardsGranted),
        icon: Gift,
      },
    ];
  }, [status]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-16 text-[#8a8f98]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading referral program…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!joined ? (
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#f7931a]/10 flex items-center justify-center shrink-0">
                  <Gift className="h-5 w-5 text-[#f7931a]" />
                </div>
                <div>
                  <CardTitle className="text-[#f7f8f8] text-base">Referral Program</CardTitle>
                  <CardDescription className="text-[#8a8f98] text-xs mt-0.5">
                    Share Radareum. Earn 10% for 6 months + a powerful activation reward.
                  </CardDescription>
                </div>
              </div>
              <Button
                className="rounded-xl bg-[#f7931a] hover:bg-[#e08518] text-white h-9 px-5"
                onClick={() => setJoinOpen(true)}
              >
                <Gift className="h-4 w-4 mr-1.5" />
                Join
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-white/5 bg-[#191a1b]/40 p-4 space-y-2.5">
              <p className="text-xs font-medium text-[#d0d6e0]">Program policy</p>
              <ul className="space-y-2">
                {(policy?.rules || []).map(rule => (
                  <li key={rule} className="flex gap-2 text-xs text-[#8a8f98] leading-relaxed">
                    <Check className="h-3.5 w-3.5 text-[#0ecb81] shrink-0 mt-0.5" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-[#8a8f98] pt-1">
                Caps: max {policy?.maxActivationRewardsPerMonth ?? 3} free-month rewards per calendar
                month. Fraud signals (self-referral, duplicate device/IP) are blocked.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <CardContent className="p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <ProfileAvatar
                  name={displayName}
                  avatarUrl={avatarUrl}
                  className="h-12 w-12"
                  fallbackClassName="bg-[#191a1b] text-[#d0d6e0] text-sm"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold text-[#f7f8f8] truncate">{displayName}</p>
                    <Badge className="bg-[#0ecb81]/10 text-[#0ecb81] border-0 text-[10px]">
                      Active referrer
                    </Badge>
                    {status?.profile?.rewardActive && (
                      <Badge className="bg-[#f7931a]/10 text-[#f7931a] border-0 text-[10px]">
                        Free {status.profile.rewardPlanId} active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#8a8f98] mt-0.5 flex items-center gap-1.5">
                    <Wallet className="h-3 w-3" />
                    Payout {shortWallet(status!.profile!.payoutWallet)}
                  </p>
                </div>
              </div>

              <div className="flex-1 min-w-0 lg:max-w-xl">
                <p className="text-[10px] uppercase tracking-wide text-[#8a8f98] mb-1.5">
                  Your referral link
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-[#191a1b] px-3 py-2 text-xs text-[#d0d6e0] font-mono truncate">
                    {status!.profile!.link}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white h-9 shrink-0"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {stats?.map(stat => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/5 bg-[#191a1b]/50 px-3 py-3"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-[#8a8f98] mb-1">
                      <Icon className="h-3 w-3" />
                      {stat.label}
                    </div>
                    <p className="text-sm font-semibold text-[#f7f8f8] font-mono-num">{stat.value}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#f7931a]" />
            <CardTitle className="text-sm text-[#f7f8f8]">Top referrers</CardTitle>
          </div>
          <CardDescription className="text-xs text-[#8a8f98]">
            Live board of members earning commissions and activation rewards
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaders.length === 0 ? (
            <p className="text-xs text-[#8a8f98] py-6 text-center">
              Be the first to join and climb the leaderboard.
            </p>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#191a1b]/60 text-[10px] uppercase tracking-wide text-[#8a8f98]">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Member</div>
                <div className="col-span-2 text-right">Referrals</div>
                <div className="col-span-2 text-right">Paid</div>
                <div className="col-span-2 text-right">Earned</div>
                <div className="col-span-1 text-right">Rewards</div>
              </div>
              {leaders.map(row => (
                <div
                  key={`${row.rank}-${row.codePreview}`}
                  className={cn(
                    'grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-t border-white/5 text-xs',
                    row.rank <= 3 && 'bg-[#f7931a]/[0.03]',
                  )}
                >
                  <div className="col-span-1 text-[#8a8f98] font-mono-num">{row.rank}</div>
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <Avatar className="h-7 w-7 border border-white/10">
                      {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt={row.displayName} /> : null}
                      <AvatarFallback className="bg-[#191a1b] text-[10px] text-[#d0d6e0]">
                        {initials(row.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[#d0d6e0] truncate">{row.displayName}</span>
                  </div>
                  <div className="col-span-2 text-right text-[#d0d6e0] font-mono-num">
                    {row.totalReferrals}
                  </div>
                  <div className="col-span-2 text-right text-[#d0d6e0] font-mono-num">
                    {row.paidConversions}
                  </div>
                  <div className="col-span-2 text-right text-[#0ecb81] font-mono-num">
                    {formatUsd(row.totalCommissionUsd)}
                  </div>
                  <div className="col-span-1 text-right text-[#f7931a] font-mono-num">
                    {row.activationRewards}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[#f7931a]" />
              Join Referral Program
            </DialogTitle>
            <DialogDescription className="text-xs text-[#8a8f98]">
              Enter the EVM wallet that should receive your 10% commission. This address will later
              connect to the payment smart contract (90% platform / 10% referrer).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs text-[#8a8f98]">Payout wallet (EVM)</label>
            <Input
              value={payoutWallet}
              onChange={e => setPayoutWallet(e.target.value)}
              placeholder="0x…"
              className="bg-[#191a1b] border-white/10 text-[#d0d6e0] font-mono text-sm"
              dir="ltr"
            />
            <p className="text-[10px] text-[#8a8f98]">
              Use a wallet you control. One payout address can only be linked to one referral account.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="border-white/10 text-[#8a8f98]"
              onClick={() => setJoinOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#f7931a] hover:bg-[#e08518] text-white"
              disabled={joining || !payoutWallet.trim()}
              onClick={() => void handleJoin()}
            >
              {joining ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Joining…
                </>
              ) : (
                <>
                  <Gift className="h-3.5 w-3.5 mr-1.5" />
                  Join
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
