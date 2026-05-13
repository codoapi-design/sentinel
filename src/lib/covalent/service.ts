/**
 * Covalent (GoldRush) API Service for Sentinel
 * Provides transaction history, token balances, and portfolio data
 */

const COVALENT_BASE_URL = 'https://api.covalenthq.com/v1';

interface CovalentTransaction {
  block_height: number;
  tx_hash: string;
  successful: boolean;
  from_address: string;
  to_address: string | null;
  value: string;
  gas_spent: string;
  gas_price: string;
  log_events: CovalentLogEvent[];
}

interface CovalentLogEvent {
  sender: string | null;
  recipient: string | null;
  decoded?: {
    name: string;
    signature: string;
    params: Array<{ name: string; value: string; type: string }>;
  };
  raw_log_topics: string[];
}

interface CovalentTokenBalance {
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  balance: string;
  balance_24h: string;
  quote: number;
  quote_24h: number;
  logo_url: string | null;
  type: string;
  chain_id: number;
  protocol_name?: string;
}

interface CovalentTokenHolder {
  address: string;
  balance: string;
}

export class CovalentService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COVALENT_API_KEY || process.env.COVALENT || process.env.NEXT_PUBLIC_COVALENT_API_KEY || '';
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64');
  }

  async getTransactions(chainId: number, address: string, page = 0, pageSize = 50): Promise<CovalentTransaction[]> {
    try {
      const url = `${COVALENT_BASE_URL}/${chainId}/address/${address}/transactions_v3/?page-number=${page}&page-size=${pageSize}`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() },
      });
      if (!response.ok) throw new Error(`Covalent API error: ${response.status}`);
      const data = await response.json();
      return data.data?.items || [];
    } catch (error) {
      console.error('[Covalent] getTransactions error:', error);
      return [];
    }
  }

  async getTokenBalances(chainId: number, address: string): Promise<CovalentTokenBalance[]> {
    try {
      const url = `${COVALENT_BASE_URL}/${chainId}/address/${address}/balances_v2/`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() },
      });
      if (!response.ok) throw new Error(`Covalent API error: ${response.status}`);
      const data = await response.json();
      return data.data?.items || [];
    } catch (error) {
      console.error('[Covalent] getTokenBalances error:', error);
      return [];
    }
  }

  async getPortfolioSummary(chainId: number, address: string) {
    const [transactions, balances] = await Promise.all([
      this.getTransactions(chainId, address, 0, 10),
      this.getTokenBalances(chainId, address),
    ]);

    const totalValue = balances.reduce((sum, b) => sum + (b.quote || 0), 0);

    return {
      totalValue,
      tokenCount: balances.length,
      transactionCount: transactions.length,
      balances: balances.slice(0, 50),
      recentTransactions: transactions.slice(0, 10),
    };
  }
}
