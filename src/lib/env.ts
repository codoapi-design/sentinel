/**
 * Environment Variable Resolver for Radareum
 *
 * Resolves API keys from multiple possible env variable naming conventions.
 * Supports both PROVIDER_API_KEY and PROVIDER formats.
 */

type EnvKeyConfig = {
  primary: string;
  fallbacks: string[];
};

const API_KEY_CONFIG: Record<string, EnvKeyConfig> = {
  covalent: {
    primary: 'COVALENT_API_KEY',
    fallbacks: ['COVALENT', 'NEXT_PUBLIC_COVALENT_API_KEY'],
  },
  zerion: {
    primary: 'ZERION_API_KEY',
    fallbacks: ['ZERION', 'NEXT_PUBLIC_ZERION_API_KEY'],
  },
  alchemy: {
    primary: 'ALCHEMY_API_KEY',
    fallbacks: ['ALCHEMY', 'NEXT_PUBLIC_ALCHEMY_API_KEY'],
  },
  debank: {
    primary: 'DEBANK_API_KEY',
    fallbacks: ['DEBANK', 'NEXT_PUBLIC_DEBANK_API_KEY'],
  },
  etherscan: {
    primary: 'ETHERSCAN_API_KEY',
    fallbacks: ['ETHERSCAN', 'NEXT_PUBLIC_ETHERSCAN_API_KEY'],
  },
  coingecko: {
    primary: 'COINGECKO_API_KEY',
    fallbacks: ['COINGECKO', 'NEXT_PUBLIC_COINGECKO_API_KEY'],
  },
  alchemy_webhook_secret: {
    primary: 'ALCHEMY_WEBHOOK_SECRET',
    fallbacks: ['ALCHEMY_WEBHOOK_SIGNING_KEY'],
  },
  alchemy_webhook_signing_key: {
    primary: 'ALCHEMY_WEBHOOK_SIGNING_KEY',
    fallbacks: ['ALCHEMY_WEBHOOK_SECRET'],
  },
};

/**
 * Prefer `.env.local` over stale OS User/Machine env vars during local development.
 * Next.js does not override pre-set process env with `.env.local`.
 */
function readEnvLocalValue(name: string): string | null {
  if (typeof window !== 'undefined') return null;
  if (process.env.NODE_ENV === 'production') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const filePath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() !== name) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.replace(/^\uFEFF/, '').trim();
      return value || null;
    }
  } catch {
    // ignore missing / unreadable .env.local
  }
  return null;
}

/**
 * Get an API key from environment variables with fallback support.
 */
export function getApiKey(provider: string): string {
  const config = API_KEY_CONFIG[provider];
  const names = config
    ? [config.primary, ...config.fallbacks]
    : [provider, `${provider}_API_KEY`];

  for (const name of names) {
    const fromFile = readEnvLocalValue(name);
    if (fromFile) return fromFile;
  }

  let raw = '';
  for (const name of names) {
    if (process.env[name]) {
      raw = process.env[name]!;
      break;
    }
  }
  // Strip BOM / quotes / whitespace from .env editors that corrupt values.
  return raw.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
}

export function isApiKeyConfigured(provider: string): boolean {
  return getApiKey(provider) !== '';
}

export function getResolvedEnvKeyName(provider: string): string {
  const config = API_KEY_CONFIG[provider];
  if (!config) return provider;

  if (process.env[config.primary]) return config.primary;

  for (const fallback of config.fallbacks) {
    if (process.env[fallback]) return fallback;
  }

  return config.primary;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '••••••••';
  return `${key.slice(0, 6)}•••••••${key.slice(-4)}`;
}

export function getProviderEnvStatus(): Record<string, {
  configured: boolean;
  masked: string | null;
  envKey: string;
  resolvedKey: string;
}> {
  const providers = ['covalent', 'zerion', 'alchemy', 'debank', 'etherscan', 'coingecko'];
  const result: Record<string, {
    configured: boolean;
    masked: string | null;
    envKey: string;
    resolvedKey: string;
  }> = {};

  for (const provider of providers) {
    const key = getApiKey(provider);
    const resolvedKey = getResolvedEnvKeyName(provider);
    const config = API_KEY_CONFIG[provider];

    result[provider] = {
      configured: key !== '',
      masked: key ? maskApiKey(key) : null,
      envKey: config?.primary || `${provider}_API_KEY`,
      resolvedKey,
    };
  }

  return result;
}
