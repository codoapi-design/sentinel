'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAdminStore, type AdminInfo } from '@/stores/admin-store';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Bot,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  Bell,
  Menu,
  X,
  AlertTriangle,
  FileText,
  MessageSquare,
  Key,
  TrendingUp,
  Activity,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard, href: '/admin' },
  { id: 'analytics', label: 'التحليلات', icon: TrendingUp, href: '/admin/analytics' },
  { id: 'users', label: 'المستخدمين', icon: Users, href: '/admin/users' },
  { id: 'subscriptions', label: 'الاشتراكات', icon: CreditCard, href: '/admin/subscriptions' },
  { id: 'ai-usage', label: 'استخدام الذكاء', icon: Bot, href: '/admin/ai-usage' },
  { id: 'api-monitoring', label: 'مراقبة API', icon: Key, href: '/admin/api-monitoring' },
  { id: 'system-health', label: 'صحة النظام', icon: Activity, href: '/admin/system-health' },
  { id: 'alerts', label: 'التنبيهات', icon: AlertTriangle, href: '/admin/alerts' },
  { id: 'audit-log', label: 'سجل التدقيق', icon: ScrollText, href: '/admin/audit-log' },
  { id: 'content', label: 'المحتوى', icon: FileText, href: '/admin/content' },
  { id: 'notifications', label: 'الإشعارات', icon: MessageSquare, href: '/admin/notifications' },
  { id: 'settings', label: 'الإعدادات', icon: Settings, href: '/admin/settings' },
];

const roleColors: Record<string, string> = {
  super_admin: 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20',
  admin: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  viewer: 'bg-[#8a8f98]/10 text-[#8a8f98] border-[#8a8f98]/20',
};

const roleLabels: Record<string, string> = {
  super_admin: 'مدير أعلى',
  admin: 'مدير',
  viewer: 'مشاهد',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, sidebarCollapsed, setAdmin, toggleSidebar } = useAdminStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/admin/login');
          return;
        }

        const { data: adminData } = await supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', session.user.id)
          .single();

        if (!adminData) {
          router.push('/login');
          return;
        }

        setAdmin({
          userId: session.user.id,
          email: session.user.email || '',
          role: adminData.role as AdminInfo['role'],
        });
      } catch (err) {
        console.error('Admin layout auth error:', err);
        router.push('/admin/login');
      } finally {
        setLoading(false);
      }
    }
    loadAdmin();
  }, [router, setAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
          <span className="text-sm text-[#8a8f98]">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const activeSection = navItems.find(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)))?.id || 'dashboard';

  return (
    <div className="min-h-screen bg-[#08090a] flex" dir="rtl">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden lg:flex flex-col border-l border-white/5 bg-[#0c0d0e] transition-all duration-300 ${
          sidebarCollapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-[#f7f8f8]">Sentinel</span>
                <span className="text-[10px] text-[#8a8f98] block -mt-0.5">Admin Panel</span>
              </div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors"
          >
            {sidebarCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-[#0052ff]/10 text-[#0052ff]'
                    : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
                } ${sidebarCollapsed ? 'justify-center' : ''}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Admin Info */}
        {!sidebarCollapsed && admin && (
          <div className="p-3 border-t border-white/5">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
              <div className="w-8 h-8 rounded-full bg-[#0052ff]/20 flex items-center justify-center text-xs text-[#0052ff] font-bold">
                {admin.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#f7f8f8] truncate">{admin.email}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[admin.role]}`}>
                  {roleLabels[admin.role]}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 w-[260px] bg-[#0c0d0e] border-l border-white/5 flex flex-col">
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-[#f7f8f8]">Sentinel Admin</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-[#8a8f98]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { router.push(item.href); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      isActive ? 'bg-[#0052ff]/10 text-[#0052ff]' : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 lg:px-6 bg-[#0c0d0e]/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-[#8a8f98]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base font-semibold text-[#f7f8f8]">
              {navItems.find(i => i.id === activeSection)?.label || 'لوحة المعلومات'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f6465d] rounded-full" />
            </button>

            {admin && (
              <span className={`hidden sm:inline-flex text-[10px] px-2 py-1 rounded-full border ${roleColors[admin.role]}`}>
                {roleLabels[admin.role]}
              </span>
            )}

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/admin/login');
              }}
              className="p-2 rounded-lg hover:bg-[#f6465d]/10 text-[#8a8f98] hover:text-[#f6465d] transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
