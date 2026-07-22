'use client';

import { Switch } from '@/components/ui/switch';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import { cn } from '@/lib/utils';

interface ShowSpamDustToggleProps {
  className?: string;
  /** Optional compact layout for tight headers */
  compact?: boolean;
}

/**
 * Global preference toggle — same state on Assets, Transactions, and Clients headers.
 * Default off: spam and $0 / dust are hidden from list UIs.
 */
export function ShowSpamDustToggle({ className, compact }: ShowSpamDustToggleProps) {
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const setShowSpamAndDust = useUiPreferencesStore((s) => s.setShowSpamAndDust);

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        compact ? 'text-[11px]' : 'text-xs',
        className,
      )}
    >
      <Switch
        checked={showSpamAndDust}
        onCheckedChange={setShowSpamAndDust}
        className="data-[state=checked]:bg-[#0052ff] data-[state=unchecked]:bg-white/10"
        aria-label="Show spam and zero-dollar items"
      />
      <span className={cn(showSpamAndDust ? 'text-[#d0d6e0]' : 'text-[#8a8f98]')}>
        Show spam & $0
      </span>
    </label>
  );
}
