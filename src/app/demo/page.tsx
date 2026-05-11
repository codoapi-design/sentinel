'use client';

import { Dashboard } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Shield, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function DemoPage() {
  return (
    <div className="relative">
      {/* Demo Banner - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-[#f7931a]/10 border-b border-[#f7931a]/20 px-4 py-1.5 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-xs text-[#f7931a] font-medium">
            Demo Mode — Viewing sample data with pre-populated wallets and transactions.
          </span>
          <Link href="/login">
            <Button size="sm" className="h-6 text-[10px] bg-[#0052ff] hover:bg-[#0045dd] text-white rounded-full px-3">
              Sign in for real data
            </Button>
          </Link>
        </div>
      </div>

      {/* Dashboard in demo mode */}
      <div className="pt-[32px]">
        <Dashboard onLogout={() => {}} isDemo={true} />
      </div>
    </div>
  );
}
