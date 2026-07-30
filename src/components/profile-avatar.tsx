'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarPreset } from '@/lib/profile/avatars';
import { profileInitials } from '@/stores/profile-store';
import { cn } from '@/lib/utils';

type ProfileAvatarProps = {
  name: string;
  email?: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function ProfileAvatar({
  name,
  email,
  avatarUrl,
  className,
  fallbackClassName,
}: ProfileAvatarProps) {
  const preset = getAvatarPreset(avatarUrl);
  const initials = profileInitials(name, email);

  return (
    <Avatar className={cn('border border-white/10', className)}>
      <AvatarFallback
        className={cn(
          'text-xs font-bold text-white',
          !preset && 'bg-[#0052ff]/20 text-[#0052ff]',
          fallbackClassName,
        )}
        style={preset ? { backgroundColor: preset.bg } : undefined}
      >
        {preset ? preset.glyph : initials}
      </AvatarFallback>
    </Avatar>
  );
}
