/**
 * Profile display store — name/avatar shared across Sidebar, Referral, etc.
 */

import { create } from 'zustand';

export type ProfileState = {
  hydrated: boolean;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  setProfile: ( partial: Partial<Pick<ProfileState, 'fullName' | 'email' | 'avatarUrl' | 'hydrated'>>) => void;
  reset: () => void;
};

const initial = {
  hydrated: false,
  fullName: '',
  email: '',
  avatarUrl: null as string | null,
};

export const useProfileStore = create<ProfileState>(set => ({
  ...initial,
  setProfile: partial => set(state => ({ ...state, ...partial })),
  reset: () => set({ ...initial }),
}));

export function profileInitials(name: string, email?: string): string {
  const source = name.trim() || email?.split('@')[0] || 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || 'U').toUpperCase();
}

export function formatPlanLabel(plan: string | null | undefined): string {
  const id = (plan || 'free').toLowerCase();
  if (id === 'free' || id === 'trial') return 'Free Plan';
  if (id === 'starter' || id === 'basic') return 'Starter Plan';
  if (id === 'pro') return 'Pro Plan';
  if (id === 'business' || id === 'enterprise') return 'Business Plan';
  return `${plan} Plan`;
}
