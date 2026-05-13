/**
 * DeBank API Service for Sentinel
 * Provides portfolio, DeFi positions, and token balance data
 */

const DEBANK_BASE_URL = 'https://pro-openapi.debank.com/v1';

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

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEBANK_API_KEY || process.env.DEBANK || process.env.NEXT_PUBLIC_DEBANK_API_KEY || '';
  }

  private getHeaders(): Record<string, string> {
    return {
      'AccessKey': this.apiKey,
      'Accept': 'application/json',
    };
  }

  async getTotalBalance(address: string): Promise<DeBankTotalBalance | null> {
    try {
      const url = `${DEBANK_BASE_URL}/user/total_balance?id=${address}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`DeBank API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[DeBank] getTotalBalance error:', error);
      return null;
    }
  }

  async getTokenBalances(address: string): Promise<DeBankTokenBalance[]> {
    try {
      const url = `${DEBANK_BASE_URL}/user/token_list?id=${address}&is_all=false`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`DeBank API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[DeBank] getTokenBalances error:', error);
      return [];
    }
  }

  async getComplexProtocolList(address: string): Promise<DeBankProtocol[]> {
    try {
      const url = `${DEBANK_BASE_URL}/user/complex_protocol_list?id=${address}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`DeBank API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[DeBank] getComplexProtocolList error:', error);
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
