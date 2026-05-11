'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Shield, Eye, EyeOff, Mail, Lock, ArrowLeft, KeyRound, Smartphone } from 'lucide-react';
import Link from 'next/link';

type Step = 'credentials' | 'totp';

export default function AdminLoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        return;
      }

      // التحقق من صلاحية الأدمن
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('role, two_factor_enabled')
        .eq('user_id', authData.user?.id)
        .single();

      if (adminError || !adminData) {
        await supabase.auth.signOut();
        setError('ليس لديك صلاحية الوصول إلى لوحة الإدارة');
        return;
      }

      // إذا كان 2FA مفعلاً، انتقل لخطوة التحقق
      if (adminData.two_factor_enabled) {
        setUserId(authData.user?.id || null);
        setStep('totp');
        return;
      }

      // بدون 2FA - تسجيل الدخول مباشرة
      router.push('/admin');
    } catch {
      setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // التحقق من كود TOTP
      const res = await fetch('/api/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: totpCode }),
      });

      if (res.ok) {
        router.push('/admin');
      } else {
        const data = await res.json();
        setError(data.error || 'رمز التحقق غير صحيح');
      }
    } catch {
      setError('حدث خطأ في التحقق. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] flex flex-col" dir="rtl">
      {/* Top Bar */}
      <nav className="flex items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">العودة للموقع</span>
        </Link>
      </nav>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#f7931a]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {step === 'totp' ? (
                <Smartphone className="h-7 w-7 text-[#f7931a]" />
              ) : (
                <Shield className="h-7 w-7 text-[#f7931a]" />
              )}
            </div>
            <h1 className="text-xl font-bold text-[#f7f8f8] mb-1">
              {step === 'totp' ? 'التحقق بخطوتين' : 'لوحة الإدارة'}
            </h1>
            <p className="text-sm text-[#8a8f98]">
              {step === 'totp' ? 'أدخل رمز التحقق من تطبيق المصادقة' : 'تسجيل دخول المديرين فقط'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-xl">
              <p className="text-xs text-[#f6465d]">{error}</p>
            </div>
          )}

          {/* Step 1: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-[#8a8f98]">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@sentinel.app"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pr-10 pl-4 rounded-xl text-sm focus:outline-none focus:border-[#f7931a]/50"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#8a8f98]">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pr-10 pl-10 rounded-xl text-sm focus:outline-none focus:border-[#f7931a]/50"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8f98] hover:text-[#d0d6e0]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#f7931a] hover:bg-[#e8860f] text-white font-medium h-11 text-sm transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جاري التحقق...</span>
                  </div>
                ) : (
                  'تسجيل الدخول'
                )}
              </button>
            </form>
          )}

          {/* Step 2: TOTP Verification */}
          {step === 'totp' && (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-[#8a8f98]">رمز التحقق (6 أرقام)</label>
                <div className="relative">
                  <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setTotpCode(val);
                    }}
                    placeholder="000000"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pr-10 pl-4 rounded-xl text-sm tracking-[0.5em] text-center focus:outline-none focus:border-[#f7931a]/50"
                    required
                    autoFocus
                    maxLength={6}
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full rounded-xl bg-[#f7931a] hover:bg-[#e8860f] text-white font-medium h-11 text-sm transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جاري التحقق...</span>
                  </div>
                ) : (
                  'تحقق'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(null); }}
                className="w-full text-xs text-[#8a8f98] hover:text-[#f7f8f8] transition-colors py-2"
              >
                العودة لتسجيل الدخول
              </button>
            </form>
          )}

          <p className="text-center text-[10px] text-[#8a8f98] mt-6">
            هذه الصفحة مخصصة لمديري النظام فقط
          </p>
        </div>
      </div>
    </div>
  );
}
