'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { UserProfilePopover } from '@/components/user-profile-popover';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Coins,
  Users,
  Globe,
  Tags,
  Settings,
  CreditCard,
  Gift,
  Menu,
  X,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isDemo?: boolean;
  userName?: string;
  userInitial?: string;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'assets', label: 'Assets', icon: Coins },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'networks', label: 'Networks', icon: Globe },
  { id: 'types', label: 'Types', icon: Tags },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'referral', label: 'Referral Program', icon: Gift },
];

export function Sidebar({ activeTab, onTabChange, isDemo, userName, userInitial }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between p-4 h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-[#f7f8f8]">Radareum</span>
          )}
          {isDemo && !collapsed && (
            <span className="text-[10px] bg-[#f7931a]/10 text-[#f7931a] border border-[#f7931a]/20 px-1.5 py-0.5 rounded font-medium">
              DEMO
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </div>

      <Separator className="bg-white/5" />

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                setMobileOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-[#0052ff]/10 text-[#0052ff]'
                  : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#191a1b]'
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0052ff]" />
              )}
            </button>
          );
        })}
      </nav>

      <Separator className="bg-white/5" />

      {/* User section — opens profile popover */}
      <div className="p-3">
        <UserProfilePopover
          isDemo={isDemo}
          collapsed={collapsed}
          fallbackName={userName}
          fallbackInitial={userInitial}
          onUpgrade={() => {
            onTabChange('subscription');
            setMobileOpen(false);
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#0f1011] text-[#f7f8f8] border border-white/10 h-10 w-10"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-[#08090a] border-r border-white/5 z-50 lg:hidden transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen bg-[#08090a] border-r border-white/5 sticky top-0 transition-all duration-300 flex-shrink-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
