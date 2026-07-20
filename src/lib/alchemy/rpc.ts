/**
 * Shared Alchemy JSON-RPC helper for EVM and non-EVM hosts.
 */

import { getApiKey } from '@/lib/env';

const forbiddenHosts = new Set<string>();

export class AlchemyHostForbiddenError extends Error {
  host: string;
  constructor(host: string) {
    super(`Alchemy host "${host}" returned HTTP 403 (network not enabled)`);
    this.name = 'AlchemyHostForbiddenError';
    this.host = host;
  }
}

export async function alchemyHostRpc<T = unknown>(
  host: string,
  method: string,
  params: unknown[],
  retries = 2,
): Promise<T> {
  if (forbiddenHosts.has(host)) {
    throw new AlchemyHostForbiddenError(host);
  }

  const apiKey = getApiKey('alchemy');
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://${host}/v2/${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        next: { revalidate: 0 },
      });
      if (response.status === 403) {
        forbiddenHosts.add(host);
        throw new AlchemyHostForbiddenError(host);
      }
      if (!response.ok) {
        throw new Error(`Alchemy HTTP ${response.status}`);
      }
      const data = (await response.json()) as { result?: T; error?: { message?: string } };
      if (data.error) {
        throw new Error(data.error.message || 'Alchemy RPC error');
      }
      return data.result as T;
    } catch (err) {
      if (err instanceof AlchemyHostForbiddenError) throw err;
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function isAlchemyKeyConfigured(): boolean {
  return getApiKey('alchemy').length > 0;
}
