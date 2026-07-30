/**
 * Client-side referral cookie helpers.
 */

import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_DAYS,
  normalizeReferralCode,
} from '@/lib/referrals/core';

export function captureReferralCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeReferralCode(params.get('ref') || params.get('r'));
    if (fromQuery) {
      persistReferralCode(fromQuery);
      return fromQuery;
    }
  } catch {
    /* ignore */
  }
  return readReferralCode();
}

export function persistReferralCode(code: string): void {
  const normalized = normalizeReferralCode(code);
  if (!normalized || typeof document === 'undefined') return;
  const maxAge = REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(normalized)}; path=/; max-age=${maxAge}; samesite=lax`;
  try {
    localStorage.setItem(REFERRAL_COOKIE, normalized);
  } catch {
    /* ignore */
  }
}

export function readReferralCode(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const fromLs = normalizeReferralCode(localStorage.getItem(REFERRAL_COOKIE));
    if (fromLs) return fromLs;
    // Legacy brand cookie/storage
    const legacyLs = normalizeReferralCode(localStorage.getItem('sentinel_ref'));
    if (legacyLs) {
      persistReferralCode(legacyLs);
      try {
        localStorage.removeItem('sentinel_ref');
      } catch {
        /* ignore */
      }
      return legacyLs;
    }
  } catch {
    /* ignore */
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${REFERRAL_COOKIE}=([^;]*)`));
  const fromCookie = normalizeReferralCode(match ? decodeURIComponent(match[1]) : null);
  if (fromCookie) return fromCookie;
  const legacyCookie = document.cookie.match(/(?:^|; )sentinel_ref=([^;]*)/);
  return normalizeReferralCode(legacyCookie ? decodeURIComponent(legacyCookie[1]) : null);
}

export function clearReferralCode(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
  try {
    localStorage.removeItem(REFERRAL_COOKIE);
  } catch {
    /* ignore */
  }
}

export function getBrowserFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ];
  return parts.join('|');
}
