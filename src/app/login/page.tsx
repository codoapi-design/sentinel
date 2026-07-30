'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn(email, password);

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      // Success - redirect to dashboard
      // Use router.push with a small delay to ensure session cookies are set
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 300);
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    await signInWithGoogle();
  };

  const handleAppleSignIn = async () => {
    setError(null);
    await signInWithApple();
  };

  return (
    <div className="min-h-screen bg-[#08090a] flex flex-col" dir="ltr">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-bold text-[#f7f8f8]">Radareum</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/demo">
            <Button variant="ghost" className="text-[#8a8f98] hover:text-[#f7f8f8] text-sm">
              Try Demo
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="outline" className="rounded-full border-white/10 text-[#d0d6e0] hover:bg-[#191a1b] text-sm">
              Sign Up
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#0052ff]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="h-7 w-7 text-[#0052ff]" />
            </div>
            <h1 className="text-2xl font-bold text-[#f7f8f8] mb-2">Welcome back</h1>
            <p className="text-[#8a8f98] text-sm">Sign in to your Radareum account</p>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl border-white/10 text-[#d0d6e0] hover:bg-[#191a1b] h-11 text-sm font-medium"
              onClick={handleGoogleSignIn}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl border-white/10 text-[#d0d6e0] hover:bg-[#191a1b] h-11 text-sm font-medium"
              onClick={handleAppleSignIn}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Continue with Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#08090a] px-3 text-[#8a8f98]">or sign in with email</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-xl">
              <p className="text-sm text-[#f6465d]">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-[#8a8f98]">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pl-10 rounded-xl"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm text-[#8a8f98]">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs text-[#0052ff] hover:text-[#0052ff]/80 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] h-11 pl-10 pr-10 rounded-xl"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8f98] hover:text-[#d0d6e0] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium h-11"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-[#8a8f98] mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[#0052ff] hover:text-[#0052ff]/80 font-medium transition-colors">
              Create one
            </Link>
          </p>

          {/* Demo Link */}
          <div className="mt-4 text-center">
            <Link href="/demo">
              <Button variant="ghost" className="text-[#8a8f98] hover:text-[#f7f8f8] text-xs">
                Or try the demo first
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
