'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles } from 'lucide-react';
import { useUpgradePromptStore } from '@/stores/upgrade-prompt-store';

interface UpgradeRequiredModalProps {
  onUpgrade: () => void;
}

export function UpgradeRequiredModal({ onUpgrade }: UpgradeRequiredModalProps) {
  const open = useUpgradePromptStore(s => s.open);
  const reason = useUpgradePromptStore(s => s.reason);
  const closeUpgradePrompt = useUpgradePromptStore(s => s.closeUpgradePrompt);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) closeUpgradePrompt();
      }}
    >
      <DialogContent className="sm:max-w-md bg-[#0f1011] border-white/10 text-[#f7f8f8]">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-[#f7931a]/10 flex items-center justify-center mx-auto mb-2">
            <Crown className="h-6 w-6 text-[#f7931a]" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Free Plan ended
          </DialogTitle>
          <DialogDescription className="text-center text-[#8a8f98] text-sm leading-relaxed pt-1">
            {reason ||
              'Your 3-day Free Plan has expired. Wallet sync and AI features are paused until you upgrade.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-2 text-sm text-[#d0d6e0] bg-[#08090a] border border-white/5 rounded-xl p-4">
          <li className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#0052ff] mt-0.5 shrink-0" />
            Resume automatic wallet sync
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#0052ff] mt-0.5 shrink-0" />
            Unlock AI analysis and chat
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#0052ff] mt-0.5 shrink-0" />
            Keep alerts and reports running
          </li>
        </ul>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            className="w-full h-11 rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium"
            onClick={() => {
              closeUpgradePrompt();
              onUpgrade();
            }}
          >
            Upgrade plan
          </Button>
          <Button
            variant="ghost"
            className="w-full text-[#8a8f98] hover:text-[#d0d6e0] text-xs"
            onClick={closeUpgradePrompt}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
