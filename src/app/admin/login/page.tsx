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
        setError('Invalid email or password');
        return;
      }

      // Check admin privileges
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('role, two_factor_enabled')
        .eq('user_id', authData.user?.id)
        .single();

      if (adminError || !adminData) {
        await supabase.auth.signOut();
        setError('You do not have access to the admin panel');
        return;
      }

      // If 2FA is enabled, proceed to verification step
      if (adminData.two_factor_enabled) {
        setUserId(authData.user?.id || null);
        setStep('totp');
        return;
      }

      // Without 2FA - sign in directly
      setTimeout(() => {
        router.push('/admin');
        router.refresh();
      }, 300);
    } catch (err) {
      console.error('Admin login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Verify TOTP code
      const res = await fetch('/api/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: totpCode }),
      });

      if (res.ok) {
        setTimeout(() => {
          router.push('/admin');
          router.refresh();
        }, 300);
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid verification code');
      }
    } catch (err) {
      console.error('2FA verification error:', err);
      setError('An error occurred during verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] flex flex-col" dir="ltr">
      {/* Top Bar */}
      <nav className="flex items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to Site</span>
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
              {step === 'totp' ? 'Two-Factor Authentication' : 'Admin Panel'}
            </h1>
            <p className="text-sm text-[#8a8f98]">
              {step === 'totp' ? 'Enter the verification code from your authenticator app' : 'Admin access only'}
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
                <label className="text-xs text-[#8a8f98]">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@radareum.app"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pl-10 pr-4 rounded-xl text-sm focus:outline-none focus:border-[#f7931a]/50"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#8a8f98]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pl-10 pr-10 rounded-xl text-sm focus:outline-none focus:border-[#f7931a]/50"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8f98] hover:text-[#d0d6e0]"
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
                    <span>Verifying...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}

          {/* Step 2: TOTP Verification */}
          {step === 'totp' && (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-[#8a8f98]">Verification Code (6 digits)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setTotpCode(val);
                    }}
                    placeholder="000000"
                    className="w-full bg-[#191a1b] border border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pl-10 pr-4 rounded-xl text-sm tracking-[0.5em] text-center focus:outline-none focus:border-[#f7931a]/50"
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
                    <span>Verifying...</span>
                  </div>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(null); }}
                className="w-full text-xs text-[#8a8f98] hover:text-[#f7f8f8] transition-colors py-2"
              >
                Back to Sign In
              </button>
            </form>
          )}

          <p className="text-center text-[10px] text-[#8a8f98] mt-6">
            This page is restricted to system administrators only
          </p>
        </div>
      </div>
    </div>
  );
}
