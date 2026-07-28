/**
 * Terminal provider used when no real provider is configured or every
 * configured provider has been exhausted.
 *
 * It keeps the façade total: callers always receive a `PriceResult`, with every
 * unresolved token carried as an explicit miss rather than a thrown error or a
 * fabricated zero.
 */

import { allMisses, type PriceProvider, type PriceResult, type TokenRef } from '../types';

export class NullProvider implements PriceProvider {
  readonly id = 'null';
  readonly supportsHistorical = true;

  isConfigured(): boolean {
    return true;
  }

  async getSpotPrices(tokens: TokenRef[]): Promise<PriceResult> {
    return allMisses(tokens, 'no_provider', 'no pricing provider is configured');
  }

  async getHistoricalPrices(tokens: TokenRef[]): Promise<PriceResult> {
    return allMisses(tokens, 'no_provider', 'no pricing provider is configured');
  }
}
