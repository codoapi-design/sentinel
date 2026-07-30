'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileAvatar } from '@/components/profile-avatar';
import { cn } from '@/lib/utils';
import { AVATAR_PRESETS, toPresetAvatarUrl } from '@/lib/profile/avatars';
import {
  formatPlanLabel,
  profileInitials,
  useProfileStore,
} from '@/stores/profile-store';
import { useWalletStore } from '@/stores/wallet-store';
import { Check, Copy, Link2, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

type UserProfilePopoverProps = {
  isDemo?: boolean;
  collapsed?: boolean;
  fallbackName?: string;
  fallbackInitial?: string;
  onUpgrade?: () => void;
  className?: string;
};

export function UserProfilePopover({
  isDemo,
  collapsed,
  fallbackName,
  fallbackInitial,
  onUpgrade,
  className,
}: UserProfilePopoverProps) {
  const { fullName, email, avatarUrl, hydrated, setProfile } = useProfileStore();
  const currentPlan = useWalletStore(s => s.currentPlan);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayName = isDemo ? 'Demo User' : fullName || fallbackName || 'User';
  const displayEmail = isDemo ? 'demo@radareum.app' : email || '';
  const displayAvatar = isDemo ? 'preset:radareum' : avatarUrl;
  const planLabel = isDemo ? 'Demo Mode' : formatPlanLabel(currentPlan);
  const initial =
    fallbackInitial || profileInitials(displayName, displayEmail) || 'U';

  const hydrate = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) return;
      const data = await res.json();
      setProfile({
        fullName: data.fullName || '',
        email: data.email || '',
        avatarUrl: data.avatarUrl || null,
        hydrated: true,
      });
      if (data.plan) {
        useWalletStore.getState().setCurrentPlan(data.plan);
      }
    } catch {
      // keep fallbacks
    }
  }, [isDemo, setProfile]);

  useEffect(() => {
    if (!hydrated && !isDemo) void hydrate();
  }, [hydrated, isDemo, hydrate]);

  useEffect(() => {
    if (!open || isDemo) return;
    setReferralLoading(true);
    void fetch('/api/referral')
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.joined && data.profile?.link) {
          setReferralLink(data.profile.link as string);
        } else {
          setReferralLink(null);
        }
        if (data.displayName || data.avatarUrl !== undefined) {
          setProfile({
            fullName: data.displayName || useProfileStore.getState().fullName,
            email: data.email || useProfileStore.getState().email,
            avatarUrl:
              data.avatarUrl !== undefined
                ? data.avatarUrl
                : useProfileStore.getState().avatarUrl,
            hydrated: true,
          });
        }
      })
      .catch(() => setReferralLink(null))
      .finally(() => setReferralLoading(false));
  }, [open, isDemo, setProfile]);

  const startEdit = () => {
    setDraftName(displayName);
    setDraftAvatar(displayAvatar);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftName('');
    setDraftAvatar(null);
  };

  const saveProfile = async () => {
    if (isDemo) return;
    const name = draftName.trim();
    if (!name) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          avatarUrl: draftAvatar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update profile');
        return;
      }
      setProfile({
        fullName: data.fullName || name,
        email: data.email || email,
        avatarUrl: data.avatarUrl ?? draftAvatar,
        hydrated: true,
      });
      setEditing(false);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) cancelEdit();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#191a1b] transition-colors cursor-pointer text-left',
            collapsed && 'justify-center',
            className,
          )}
          aria-label="Open profile"
        >
          <ProfileAvatar
            name={displayName}
            email={displayEmail}
            avatarUrl={displayAvatar}
            className="h-8 w-8"
            fallbackClassName={isDemo ? undefined : !displayAvatar ? 'bg-[#0052ff]/20 text-[#0052ff]' : undefined}
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#f7f8f8] truncate">{displayName}</p>
              <p className="text-xs text-[#8a8f98] truncate">{planLabel}</p>
            </div>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] p-0 bg-[#0f1011] border-white/10 text-[#f7f8f8] shadow-xl"
      >
        <div className="relative p-4 pb-3">
          {!isDemo && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="absolute top-3 right-3 h-7 w-7 rounded-md flex items-center justify-center text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b] transition-colors"
              aria-label="Edit profile"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              className="absolute top-3 right-3 h-7 w-7 rounded-md flex items-center justify-center text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b] transition-colors"
              aria-label="Cancel edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="flex flex-col items-center text-center gap-2 pt-1">
            <ProfileAvatar
              name={editing ? draftName || displayName : displayName}
              email={displayEmail}
              avatarUrl={editing ? draftAvatar : displayAvatar}
              className="h-14 w-14"
              fallbackClassName="text-sm"
            />

            {editing ? (
              <>
                <Input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  maxLength={80}
                  className="h-8 text-sm bg-[#191a1b] border-white/10 text-center"
                  placeholder="Your name"
                />
                <div className="w-full pt-1">
                  <p className="text-[10px] uppercase tracking-wide text-[#8a8f98] mb-2">
                    Choose avatar
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {AVATAR_PRESETS.map(preset => {
                      const value = toPresetAvatarUrl(preset.id);
                      const selected = draftAvatar === value;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.label}
                          onClick={() => setDraftAvatar(value)}
                          className={cn(
                            'h-9 w-9 rounded-full text-xs font-bold text-white mx-auto transition-all',
                            selected && 'ring-2 ring-[#0052ff] ring-offset-2 ring-offset-[#0f1011]',
                          )}
                          style={{ backgroundColor: preset.bg }}
                        >
                          {preset.glyph}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="min-w-0 w-full px-2">
                <p className="text-sm font-semibold text-[#f7f8f8] truncate">{displayName}</p>
                {displayEmail ? (
                  <p className="text-xs text-[#8a8f98] truncate mt-0.5">{displayEmail}</p>
                ) : null}
              </div>
            )}
          </div>

          {editing && (
            <div className="flex gap-2 mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-[#8a8f98]"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 h-8 bg-[#0052ff] hover:bg-[#0045dd] text-white"
                onClick={() => void saveProfile()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {!editing && (
          <>
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#191a1b]/60 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[#8a8f98]">Plan</p>
                  <p className="text-sm font-medium text-[#f7f8f8] truncate">{planLabel}</p>
                </div>
                {!isDemo && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 rounded-md bg-[#f7931a] hover:bg-[#e08518] text-white text-xs px-2.5"
                    onClick={() => {
                      setOpen(false);
                      onUpgrade?.();
                    }}
                  >
                    Upgrade
                  </Button>
                )}
              </div>
            </div>

            {!isDemo && (referralLoading || referralLink) && (
              <div className="px-4 pb-4">
                <p className="text-[10px] uppercase tracking-wide text-[#8a8f98] mb-1.5 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  Referral link
                </p>
                {referralLoading && !referralLink ? (
                  <div className="flex items-center gap-2 text-xs text-[#8a8f98]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                ) : referralLink ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 rounded-md border border-white/10 bg-[#191a1b] px-2.5 py-1.5 text-[11px] text-[#d0d6e0] font-mono truncate">
                      {referralLink}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 rounded-md bg-[#0052ff] hover:bg-[#0045dd] text-white px-2"
                      onClick={() => void handleCopy()}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
