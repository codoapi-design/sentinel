import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  ANALYSIS_DEPTH_VALUES,
  FOCUS_AREA_VALUES,
  PREFERENCE_KEYS,
  RESPONSE_STYLE_VALUES,
  type PreferenceKey,
} from '../config';
import { getMemoryStore } from '../store/memory-store';
import type { AiUserPreference } from '../types';

const valueSchemas: Record<PreferenceKey, z.ZodTypeAny> = {
  language: z.string().min(2).max(16),
  fiat_currency: z.string().min(3).max(8),
  analysis_depth: z.enum(ANALYSIS_DEPTH_VALUES),
  default_wallet: z.string().uuid(),
  focus_areas: z.array(z.enum(FOCUS_AREA_VALUES)).min(1).max(4),
  response_style: z.enum(RESPONSE_STYLE_VALUES),
};

export function validatePreferenceValue(key: PreferenceKey, value: unknown): unknown {
  return valueSchemas[key].parse(value);
}

export async function upsertExplicitPreference(input: {
  userId: string;
  key: PreferenceKey;
  value: unknown;
  source?: 'explicit_user_setting' | 'explicit_chat_confirmation';
}): Promise<AiUserPreference> {
  if (!PREFERENCE_KEYS.includes(input.key)) {
    throw new Error(`Invalid preference key: ${input.key}`);
  }
  const source = input.source ?? 'explicit_user_setting';
  const value = validatePreferenceValue(input.key, input.value);
  const now = new Date().toISOString();
  const row: AiUserPreference = {
    id: randomUUID(),
    userId: input.userId,
    key: input.key,
    value,
    source,
    confidence: 1,
    firstObservedAt: now,
    lastConfirmedAt: now,
    expiresAt: null,
    active: true,
  };
  return getMemoryStore().upsertPreference(row);
}

export async function listActivePreferences(userId: string): Promise<AiUserPreference[]> {
  return getMemoryStore().listPreferences(userId);
}

export async function resetPreference(userId: string, key: PreferenceKey): Promise<boolean> {
  return getMemoryStore().deactivatePreference(userId, key);
}

/** Temporary chat style requests must not become permanent preferences. */
export function isTemporaryStyleRequest(message: string): boolean {
  return /\b(this time|for now|just this|once)\b/i.test(message);
}
