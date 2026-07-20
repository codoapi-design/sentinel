/**
 * DeBank API Service for Sentinel
 * Provides portfolio, DeFi positions, and token balance data
 *
 * NOTE: DeBank has migrated their free API to a paid model (DeBank Cloud).
 * The old free endpoints (api.debank.com) may return 404 for some paths.
 * This service gracefully falls back when endpoints are unavailable,
 * allowing other providers (Zerion, Covalent) to handle data instead.
 *
 * If a DEBANK_API_KEY is configured, it uses the pro API.
 * Otherwise, it tries the free API as a best-effort fallback.
 */

const DEBANK_FREE_BASE_URL = 'https://api.debank.com';
const DEBANK_PRO_BASE_URL = 'https://pro-openapi.debank.com/v1';

interface DeBankTokenBalance {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol: string | null;
  optimized_symbol: string | null;
  decimals: number;
  logo_url: string | null;
  protocol_id: string;
  price: number;
  is_core: boolean;
  is_verified: boolean;
  is_wallet: boolean;
  time_at: number | null;
  amount: number;
  raw_amount: number | null;
}

interface DeBankProtocol {
  id: string;
  chain: string;
  logo_url: string | null;
  name: string;
  tvl: number;
  portfolio_item_list: DeBankPortfolioItem[];
}

interface DeBankPortfolioItem {
  name: string;
  detail_types: string[];
  detail: {
    supply_token_list?: DeBankTokenBalance[];
    reward_token_list?: DeBankTokenBalance[];
    borrow_token_list?: DeBankTokenBalance[];
    token?: DeBankTokenBalance;
    tokens?: DeBankTokenBalance[];
    lp_token_list?: DeBankTokenBalance[];
  };
  stats: {
    asset_usd_value: number;
    debt_usd_value: number;
    net_usd_value: number;
  };
}

interface DeBankTotalBalance {
  total_usd_value: number;
  chain_list: {
    id: string;
    name: string;
    usd_value: number;
    logo_url: string | null;
  }[];
}

export class DeBankService {
  private apiKey: string;
  private useProApi: boolean;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEBANK_API_KEY || process.env.DEBANK || process.env.NEXT_PUBLIC_DEBANK_API_KEY || '';
    this.useProApi = this.apiKey !== '';
  }

  /**
   * Only treat DeBank as usable when a paid API key is present. The legacy free
   * endpoints are unreliable and can hang for the full request timeout, so we
   * skip them entirely in the Etherscan-only setup.
   */
  isConfigured(): boolean {
    return this.useProApi;
  }

  private getBaseUrl(): string {
    return this.useProApi ? DEBANK_PRO_BASE_URL : DEBANK_FREE_BASE_URL;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.useProApi) {
      headers['AccessKey'] = this.apiKey;
    }
    return headers;
  }

  async getTotalBalance(address: string): Promise<DeBankTotalBalance | null> {
    try {
      const url = `${this.getBaseUrl()}/user/total_balance?id=${address}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        // If pro API fails, try free API as fallback
        if (this.useProApi) {
          console.warn('[DeBank] Pro API failed, trying free API');
          return this.getFreeTotalBalance(address);
        }
        // Free API may be rate-limited or endpoint removed
        console.warn(`[DeBank] getTotalBalance returned ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      if (this.useProApi) {
        return this.getFreeTotalBalance(address);
      }
      console.warn('[DeBank] getTotalBalance error:', error);
      return null;
    }
  }

  private async getFreeTotalBalance(address: string): Promise<DeBankTotalBalance | null> {
    try {
      const url = `${DEBANK_FREE_BASE_URL}/user/total_balance?id=${address}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        // 429 = rate limited, 404 = endpoint removed
        console.warn(`[DeBank] Free API getTotalBalance returned ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[DeBank] Free API getTotalBalance error:', error);
      return null;
    }
  }

  async getTokenBalances(address: string): Promise<DeBankTokenBalance[]> {
    try {
      const url = `${this.getBaseUrl()}/user/token_list?id=${address}&is_all=false`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (this.useProApi) {
          console.warn('[DeBank] Pro API failed for tokens, trying free API');
          return this.getFreeTokenBalances(address);
        }
        // Free API endpoint may no longer exist
        console.warn(`[DeBank] getTokenBalances returned ${response.status}`);
        return [];
      }
      return await response.json();
    } catch (error) {
      if (this.useProApi) {
        return this.getFreeTokenBalances(address);
      }
      console.warn('[DeBank] getTokenBalances error:', error);
      return [];
    }
  }

  private async getFreeTokenBalances(address: string): Promise<DeBankTokenBalance[]> {
    try {
      const url = `${DEBANK_FREE_BASE_URL}/user/token_list?id=${address}&is_all=false`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        console.warn(`[DeBank] Free API getTokenBalances returned ${response.status}`);
        return [];
      }
      return await response.json();
    } catch (error) {
      console.warn('[DeBank] Free API getTokenBalances error:', error);
      return [];
    }
  }

  async getComplexProtocolList(address: string): Promise<DeBankProtocol[]> {
    try {
      const url = `${this.getBaseUrl()}/user/complex_protocol_list?id=${address}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (this.useProApi) {
          console.warn('[DeBank] Pro API failed for protocols, trying free API');
          return this.getFreeComplexProtocolList(address);
        }
        console.warn(`[DeBank] getComplexProtocolList returned ${response.status}`);
        return [];
      }
      return await response.json();
    } catch (error) {
      if (this.useProApi) {
        return this.getFreeComplexProtocolList(address);
      }
      console.warn('[DeBank] getComplexProtocolList error:', error);
      return [];
    }
  }

  private async getFreeComplexProtocolList(address: string): Promise<DeBankProtocol[]> {
    try {
      const url = `${DEBANK_FREE_BASE_URL}/user/complex_protocol_list?id=${address}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        console.warn(`[DeBank] Free API getComplexProtocolList returned ${response.status}`);
        return [];
      }
      return await response.json();
    } catch (error) {
      console.warn('[DeBank] Free API getComplexProtocolList error:', error);
      return [];
    }
  }

  async getPortfolioSummary(address: string) {
    const [totalBalance, tokens, protocols] = await Promise.all([
      this.getTotalBalance(address),
      this.getTokenBalances(address),
      this.getComplexProtocolList(address),
    ]);

    const totalTokenValue = tokens.reduce((sum, t) => sum + (t.price * t.amount), 0);
    const totalDefiValue = protocols.reduce((sum, p) => {
      return sum + p.portfolio_item_list.reduce((s, item) => s + item.stats.net_usd_value, 0);
    }, 0);

    return {
      totalValue: totalBalance?.total_usd_value || (totalTokenValue + totalDefiValue),
      totalTokenValue,
      totalDefiValue,
      chainList: totalBalance?.chain_list || [],
      tokenCount: tokens.length,
      protocolCount: protocols.length,
      tokens: tokens.slice(0, 50),
      protocols,
    };
  }
}
