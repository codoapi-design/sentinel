'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { clearUserLocalState } from '@/lib/clear-user-local-state';
import { useWalletStore } from '@/stores/wallet-store';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const boundUserIdRef = useRef<string | null>(null);

  const bindSessionUser = useCallback((nextUser: User | null) => {
    const nextId = nextUser?.id ?? null;
    const prevId = boundUserIdRef.current;
    if (prevId === nextId) {
      if (nextId) useWalletStore.getState().bindOwner(nextId);
      return;
    }

    // Account switched or signed out — wipe local caches from the previous user
    if (prevId && prevId !== nextId) {
      clearUserLocalState(nextId);
    } else if (!prevId && nextId) {
      // First bind this session: drop orphan/legacy cache not owned by this user
      const cachedOwner = useWalletStore.getState().ownerUserId;
      const hasCachedWallets = useWalletStore.getState().wallets.length > 0;
      if ((cachedOwner && cachedOwner !== nextId) || (!cachedOwner && hasCachedWallets)) {
        clearUserLocalState(nextId);
      } else {
        useWalletStore.getState().bindOwner(nextId);
      }
    } else if (!nextId) {
      clearUserLocalState(null);
    }

    boundUserIdRef.current = nextId;
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      bindSessionUser(currentSession?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === 'SIGNED_IN') {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          bindSessionUser(newSession?.user ?? null);
        } else if (event === 'SIGNED_OUT') {
          bindSessionUser(null);
          setSession(null);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED') {
          setSession(newSession);
          setUser(newSession?.user ?? null);
        } else {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          bindSessionUser(newSession?.user ?? null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [bindSessionUser]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      // New account must not inherit the previous user's local wallet cache
      clearUserLocalState(null);

      // Prefer server register (auto-confirmed) to avoid confirmation-email rate limits
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { error: (payload.error as string) || 'Registration failed' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.session?.user) {
        bindSessionUser(data.session.user);
        setSession(data.session);
        setUser(data.session.user);

        // Apply Free Plan from register response so the dashboard never flashes "expired".
        try {
          const { useSubscriptionStore, FREE_TRIAL_TX } = await import(
            '@/stores/subscription-store'
          );
          const trial = payload.freeTrial as
            | { startDate?: string; endDate?: string; created?: boolean }
            | null
            | undefined;
          if (trial?.endDate) {
            useSubscriptionStore.getState().setSubscription({
              planId: 'free',
              planName: 'Free',
              billingPeriod: 'monthly',
              price: 0,
              startDate: trial.startDate || new Date().toISOString(),
              endDate: trial.endDate,
              txHash: FREE_TRIAL_TX,
              paymentToken: 'FREE',
              paymentChain: 0,
              status: 'active',
              aiRequestsUsed: 0,
              syncPausedAt: null,
            });
          }
        } catch {
          /* store may be unavailable */
        }
      }

      return { error: null, needsEmailConfirmation: false as const };
    } catch (err) {
      console.error('Sign up error:', err);
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, [bindSessionUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error.message);
        return { error: error.message };
      }

      if (data.session) {
        bindSessionUser(data.session.user);
        setSession(data.session);
        setUser(data.session.user);
      }

      return { error: null };
    } catch (err) {
      console.error('Sign in exception:', err);
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, [bindSessionUser]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      console.error('Google sign in error:', err);
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      console.error('Apple sign in error:', err);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      clearUserLocalState(null);
      boundUserIdRef.current = null;
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signInWithApple,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
