'use client';

import { MessageCircle } from 'lucide-react';

interface FloatingChatButtonProps {
  onClick: () => void;
}

/**
 * Dedicated bottom-left chat FAB.
 * Always paints when mounted — no wallet / plan / tab gates.
 * Explicit w/h so flex parents cannot stretch it off-screen.
 */
export function FloatingChatButton({ onClick }: FloatingChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 left-6 z-[100] w-14 h-14 bg-[#191a1b] hover:bg-[#28282c] border border-white/10 rounded-full shadow-lg flex items-center justify-center text-[#0052ff] transition-all duration-300 hover:scale-105 hover:border-[#0052ff]/30"
      aria-label="Open Radareum AI chat"
      title="Ask Radareum AI"
      data-testid="floating-chat-button"
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  );
}
