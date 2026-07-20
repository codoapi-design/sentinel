/**
 * Environment Variable Resolver for Sentinel
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
 * Get an API key from environment variables with fallback support.
 */
export function getApiKey(provider: string): string {
  const config = API_KEY_CONFIG[provider];
  if (!config) {
    return process.env[provider] || process.env[`${provider}_API_KEY`] || '';
  }

  if (process.env[config.primary]) {
    return process.env[config.primary]!;
  }

  for (const fallback of config.fallbacks) {
    if (process.env[fallback]) {
      return process.env[fallback]!;
    }
  }

  return '';
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
