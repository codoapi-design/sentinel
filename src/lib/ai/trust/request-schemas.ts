/**
 * Package 1 — Strict Zod validation for AI request bodies.
 * Transport / abuse limits only — not analytical history caps.
 */

import { z } from 'zod';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_FILTER_KEYS = 40;
const MAX_FILTER_VALUE_LEN = 200;
const MAX_STRING = 200;
const MAX_MESSAGE = 2000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CONTENT = 4000;
const MAX_SCREEN_ASSETS = 200;
const MAX_SCREEN_TXS = 200;
const MAX_SCREEN_CLIENTS = 100;
const MAX_VISIBLE_ROW_IDS = 500;
const MAX_IDEMPOTENCY_KEY = 128;

const finiteNumber = z.number().finite();
const nonNegativeFinite = finiteNumber.refine(n => n >= 0, { message: 'Must be non-negative.' });

const uuidSchema = z
  .string()
  .trim()
  .refine(v => UUID_REGEX.test(v), { message: 'Expected a valid UUID.' });

const periodSchema = z.union([
  z.enum(['7d', '30d', '90d', '3m', '6m', '1y', 'ytd', 'all', 'max']),
  z.string().trim().min(1).max(32),
  z.number().int().positive().max(3650),
]);

const filterValueSchema = z.union([
  z.string().max(MAX_FILTER_VALUE_LEN),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const filtersSchema = z
  .record(z.string().max(64), filterValueSchema)
  .refine(obj => Object.keys(obj).length <= MAX_FILTER_KEYS, {
    message: `At most ${MAX_FILTER_KEYS} filter keys.`,
  })
  .optional()
  .nullable();

const screenAssetSchema = z
  .object({
    symbol: z.string().max(64).optional(),
    name: z.string().max(200).optional().nullable(),
    valueUsd: z.number().finite().optional().nullable(),
    quantity: z.number().finite().optional().nullable(),
    priceUsd: z.number().finite().optional().nullable(),
    network: z.string().max(64).optional().nullable(),
    tokenAddress: z.string().max(128).optional().nullable(),
    isSpam: z.boolean().optional().nullable(),
  })
  .passthrough();

const screenTxSchema = z
  .object({
    id: z.string().max(128).optional(),
    hash: z.string().max(128).optional(),
    txHash: z.string().max(128).optional(),
    valueUsd: z.number().finite().optional().nullable(),
    value: z.number().finite().optional().nullable(),
    token: z.string().max(64).optional().nullable(),
    network: z.string().max(64).optional().nullable(),
    type: z.string().max(64).optional().nullable(),
    timestamp: z.union([z.number().finite(), z.string().max(64)]).optional().nullable(),
  })
  .passthrough();

export const screenSnapshotSchema = z
  .object({
    page: z.string().max(MAX_STRING).optional(),
    sectionType: z.string().max(MAX_STRING).optional(),
    period: periodSchema.optional().nullable(),
    portfolioValueUsd: nonNegativeFinite.optional().nullable(),
    assetsMode: z.enum(['merge', 'replace']).optional(),
    transactionsMode: z.enum(['merge', 'replace']).optional(),
    assets: z.array(screenAssetSchema).max(MAX_SCREEN_ASSETS).optional(),
    transactions: z.array(screenTxSchema).max(MAX_SCREEN_TXS).optional(),
    clients: z.array(z.record(z.string(), z.unknown())).max(MAX_SCREEN_CLIENTS).optional(),
    snapshots: z.array(z.record(z.string(), z.unknown())).max(800).optional(),
    investmentReturn: z.unknown().optional(),
    tradingVolume: z.unknown().optional(),
    visibleRowIds: z.array(z.string().max(128)).max(MAX_VISIBLE_ROW_IDS).optional(),
    clientAsOf: z.string().max(64).optional().nullable(),
    sorting: z.record(z.string(), z.unknown()).optional(),
    filters: filtersSchema,
  })
  // Strip unknown keys (abuse protection) without breaking older clients that
  // send additive presentation fields we have not listed yet.
  .strip()
  .optional()
  .nullable();

const SUPPORTED_SECTIONS = [
  'portfolio',
  'assets',
  'asset',
  'transactions',
  'trading-volume',
  'revenue',
  'expenses',
  'networks',
  'network',
  'counterparties',
  'counterparty',
  'clients',
  'client',
  'risk',
  'performance',
  'investment-return',
  'roi',
  'flow',
  'overview',
  'dashboard',
  'types',
  'type',
] as const;

export const analyzeRequestSchema = z
  .object({
    walletId: uuidSchema,
    sectionType: z.string().trim().max(MAX_STRING).optional().nullable(),
    sectionTitle: z.string().trim().max(MAX_STRING).optional().nullable(),
    page: z.string().trim().max(MAX_STRING).optional().nullable(),
    asset: z.string().trim().max(64).optional().nullable(),
    network: z.string().trim().max(64).optional().nullable(),
    counterparty: z.string().trim().max(200).optional().nullable(),
    typeId: z.string().trim().max(64).optional().nullable(),
    period: periodSchema.optional().nullable(),
    filters: filtersSchema,
    includeHidden: z.boolean().optional(),
    screenSnapshot: screenSnapshotSchema,
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY).optional(),
    /** Ignored if present — server forces mode. */
    mode: z.unknown().optional(),
  })
  // Strip unknown keys for backward compatibility with older clients.
  .strip()
  .superRefine((val, ctx) => {
    if (val.sectionType) {
      const key = val.sectionType.toLowerCase().replace(/[\s_]+/g, '-');
      if (
        !(SUPPORTED_SECTIONS as readonly string[]).includes(key) &&
        key.length > 0 &&
        !/^[a-z0-9-]{1,64}$/.test(key)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectionType'],
          message: 'Unsupported section type.',
        });
      }
    }
  });

export const chatHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(MAX_HISTORY_CONTENT),
});

export const pageContextSchema = z
  .object({
    sectionType: z.string().trim().max(MAX_STRING).optional().nullable(),
    sectionTitle: z.string().trim().max(MAX_STRING).optional().nullable(),
    page: z.string().trim().max(MAX_STRING).optional().nullable(),
    asset: z.string().trim().max(64).optional().nullable(),
    network: z.string().trim().max(64).optional().nullable(),
    counterparty: z.string().trim().max(200).optional().nullable(),
    typeId: z.string().trim().max(64).optional().nullable(),
    period: periodSchema.optional().nullable(),
    filters: filtersSchema,
  })
  .strict()
  .optional()
  .nullable();

export const chatRequestSchema = z
  .object({
    walletId: uuidSchema,
    message: z.string().trim().min(1).max(MAX_MESSAGE),
    history: z.array(chatHistoryItemSchema).max(MAX_HISTORY_MESSAGES).optional(),
    /** Package 3 — server loads authoritative history when present. */
    conversationId: uuidSchema.optional().nullable(),
    pageContext: pageContextSchema,
    includeHidden: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY).optional(),
    /** Ignored if present — server forces mode. */
    mode: z.unknown().optional(),
  })
  .strip();

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface AiRequestErrorDetail {
  path: string;
  reason: string;
}

export interface AiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: AiRequestErrorDetail[];
    traceId: string;
  };
}

export function zodIssuesToDetails(error: z.ZodError): AiRequestErrorDetail[] {
  return error.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    reason: issue.message,
  }));
}

export function invalidAiRequest(
  traceId: string,
  details: AiRequestErrorDetail[],
  message = 'The request payload is invalid.',
): AiErrorBody {
  return {
    success: false,
    error: {
      code: 'INVALID_AI_REQUEST',
      message,
      details,
      traceId,
    },
  };
}

export function aiError(
  traceId: string,
  code: string,
  message: string,
  details?: AiRequestErrorDetail[],
): AiErrorBody {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      traceId,
    },
  };
}

/** Approximate JSON byte size guard (transport abuse protection). */
export const MAX_AI_BODY_BYTES = 256_000;
