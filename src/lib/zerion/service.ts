/**
 * Zerion API Service for Sentinel
 * Provides wallet portfolio, DeFi positions, and transaction data
 */

const ZERION_BASE_URL = 'https://api.zerion.io/v1';

interface ZerionPortfolio {
  id: string;
  type: string;
  attributes: {
    position_type: string;
    fungible_info?: {
      name: string;
      symbol: string;
      icon?: { url: string };
    };
    quantity: { float?: number; integer?: string };
    value?: number;
    price?: number;
    changes?: {
      '1d'?: { percent?: number };
      '1h'?: { percent?: number };
    };
    protocol?: { name: string; icon?: { url: string } };
    chain: string;
  };
  relationships?: Record<string, unknown>;
}

interface ZerionTransaction {
  id: string;
  type: string;
  attributes: {
    operation_type: string;
    status: string;
    hash: string;
    block_number: number | null;
    timestamp: string;
    from_address: string;
    to_address: string;
    value: string;
    fee: { value: string; symbol: string } | null;
    changes: Array<{
      direction: string;
      fungible_info?: { name: string; symbol: string; icon?: { url: string } };
      quantity: { float?: number; integer?: string };
      value?: number;
      price?: number;
    }>;
    chain: string;
  };
}

export class ZerionService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ZERION_API_KEY || process.env.ZERION || process.env.NEXT_PUBLIC_ZERION_API_KEY || '';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      'Accept': 'application/json',
    };
  }

  async getPortfolio(address: string, currency = 'usd'): Promise<ZerionPortfolio[]> {
    if (!this.apiKey) {
      console.warn('[Zerion] API key not configured - skipping portfolio');
      return [];
    }
    try {
      const url = `${ZERION_BASE_URL}/wallets/${address}/positions/?currency=${currency}&filter[positions]=only_with_fungible`;
      console.log(`[Zerion] Fetching portfolio for ${address.slice(0,8)}...`);
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Zerion] API error ${response.status}: ${errorText.slice(0, 200)}`);
        throw new Error(`Zerion API error: ${response.status}`);
      }
      const data = await response.json();
      const positions = data.data || [];
      console.log(`[Zerion] Got ${positions.length} positions for ${address.slice(0,8)}...`);
      return positions;
    } catch (error) {
      console.error('[Zerion] getPortfolio error for', address, ':', error);
      return [];
    }
  }

  async getTransactions(address: string, currency = 'usd', page = 1, pageSize = 50): Promise<ZerionTransaction[]> {
    if (!this.apiKey) {
      console.warn('[Zerion] API key not configured - skipping transactions');
      return [];
    }
    try {
      const url = `${ZERION_BASE_URL}/wallets/${address}/transactions/?currency=${currency}&page[number]=${page}&page[size]=${pageSize}`;
      console.log(`[Zerion] Fetching transactions for ${address.slice(0,8)}...`);
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Zerion] API error ${response.status}: ${errorText.slice(0, 200)}`);
        throw new Error(`Zerion API error: ${response.status}`);
      }
      const data = await response.json();
      const txs = data.data || [];
      console.log(`[Zerion] Got ${txs.length} transactions for ${address.slice(0,8)}...`);
      return txs;
    } catch (error) {
      console.error('[Zerion] getTransactions error for', address, ':', error);
      return [];
    }
  }

  async getPortfolioSummary(address: string) {
    if (!this.apiKey) {
      console.warn('[Zerion] API key not configured - skipping portfolio summary');
      return { totalValue: 0, tokenCount: 0, defiPositionCount: 0, positions: [] };
    }
    const positions = await this.getPortfolio(address);

    const totalValue = positions.reduce((sum, p) => sum + (p.attributes.value || 0), 0);
    const tokens = positions.filter(p => p.attributes.position_type === 'wallet');
    const defiPositions = positions.filter(p => p.attributes.position_type !== 'wallet');

    return {
      totalValue,
      tokenCount: tokens.length,
      defiPositionCount: defiPositions.length,
      positions: positions.slice(0, 100),
    };
  }
}
