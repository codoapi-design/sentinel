/**
 * Provider registry.
 *
 * Providers are singletons — they hold no per-request state and read their
 * credentials lazily, so a key added between cold starts is picked up without
 * rebuilding the registry.
 */

import type { PriceProvider } from '../types';
import { AlchemyPriceProvider } from './alchemy';
import { CoinGeckoProvider } from './coingecko';
import { DefiLlamaProvider } from './defillama';
import { NullProvider } from './null';

export { AlchemyPriceProvider } from './alchemy';
export { CoinGeckoProvider } from './coingecko';
export { DefiLlamaProvider } from './defillama';
export { NullProvider } from './null';

export type ProviderId = 'defillama' | 'coingecko' | 'alchemy' | 'null';

let registry: Record<ProviderId, PriceProvider> | null = null;

export function getProviderRegistry(): Record<ProviderId, PriceProvider> {
  if (!registry) {
    registry = {
      defillama: new DefiLlamaProvider(),
      coingecko: new CoinGeckoProvider(),
      alchemy: new AlchemyPriceProvider(),
      null: new NullProvider(),
    };
  }
  return registry;
}

export function getProvider(id: ProviderId): PriceProvider {
  return getProviderRegistry()[id];
}
