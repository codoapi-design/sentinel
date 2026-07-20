/**
 * Etherscan API V2 Service
 *
 * Unified multichain endpoint: https://api.etherscan.io/v2/api
 * Requires chainid parameter for target network.
 *
 * Docs: https://docs.etherscan.io/v2-migration
 */

import { getApiKey } from '@/lib/env';

const BASE_URL = 'https://api.etherscan.io/v2/api';

export interface EtherscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  methodId?: string;
  functionName?: string;
}

export interface EtherscanTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

/** ERC-20 holding row returned by the `addresstokenbalance` (PRO) endpoint. */
export interface EtherscanTokenHolding {
  TokenAddress: string;
  TokenName: string;
  TokenSymbol: string;
  TokenQuantity: string; // raw integer amount
  TokenDivisor: string;  // decimals
  TokenPriceUSD?: string; // USD price per token (may be "0" or absent)
}

const RATE_LIMIT_HINT = /rate limit|max calls|too many|max rate/i;

export class EtherscanService {
  private apiKey: string;

  constructor() {
    this.apiKey = getApiKey('etherscan');
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Low-level request against the unified V2 endpoint with automatic retry on
   * rate-limit responses. Returns the parsed response (status/message/result).
   */
  private async fetchResponse<T>(
    chainId: number,
    params: Record<string, string>,
    retries = 2,
  ): Promise<EtherscanResponse<T>> {
    if (!this.apiKey) {
      throw new Error('Etherscan API key not configured (ETHERSCAN_API_KEY)');
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('chainid', String(chainId));
    url.searchParams.set('apikey', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        throw new Error(`Etherscan HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as EtherscanResponse<T>;

      // Back off and retry when the API reports a rate-limit condition.
      const rateLimited =
        data.status !== '1' &&
        (RATE_LIMIT_HINT.test(String(data.message)) ||
          RATE_LIMIT_HINT.test(String(data.result)));
      if (rateLimited && attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }

      return data;
    }
  }

  private async request<T>(
    chainId: number,
    params: Record<string, string>,
  ): Promise<T[]> {
    const data = await this.fetchResponse<T[] | string>(chainId, params);

    if (data.status !== '1') {
      // "No transactions found" is a valid empty result
      if (
        data.message === 'No transactions found' ||
        data.result === 'No transactions found'
      ) {
        return [];
      }
      throw new Error(`Etherscan API error: ${data.message} — ${String(data.result)}`);
    }

    if (!Array.isArray(data.result)) {
      return [];
    }

    return data.result;
  }

  /**
   * Raw request for endpoints whose `result` is a scalar/object (not an array),
   * e.g. account balance. Returns the raw `result` field.
   */
  private async requestRaw(
    chainId: number,
    params: Record<string, string>,
  ): Promise<unknown> {
    const data = await this.fetchResponse<unknown>(chainId, params);
    return data.result;
  }

  /**
   * Native coin balance (in wei) for an address on a chain.
   *
   * Throws on a non-success response (e.g. a chain that isn't available on the
   * current API plan) so callers can classify and skip it. A genuine zero
   * balance comes back as status "1" with result "0".
   */
  async getNativeBalance(address: string, chainId: number): Promise<bigint> {
    const data = await this.fetchResponse<string>(chainId, {
      module: 'account',
      action: 'balance',
      address,
      tag: 'latest',
    });

    if (data.status === '1') {
      try {
        return BigInt(String(data.result ?? '0'));
      } catch {
        return BigInt(0);
      }
    }

    throw new Error(
      `Etherscan API error: ${data.message} — ${String(data.result)}`,
    );
  }

  /**
   * Whether an error/message indicates the chain is not available on the
   * current API plan (Free tier only covers selected chains).
   */
  static isChainUnsupported(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /not supported for this chain|upgrade your api plan|full chain coverage/i.test(msg);
  }

  /**
   * Get ALL ERC-20 token holdings for an address on a chain in a single call
   * (Etherscan V2 `account/addresstokenbalance`). Includes USD prices.
   *
   * This is a PRO endpoint (Standard plan+). Returns:
   *   - an array of holdings when available (may be empty for a wallet with none)
   *   - `null` when the endpoint is unavailable for this key (e.g. Free tier),
   *     signalling the caller to fall back to transfer-history derivation.
   */
  async getAddressTokenBalances(
    address: string,
    chainId: number,
    page = 1,
    offset = 1000,
  ): Promise<EtherscanTokenHolding[] | null> {
    const data = await this.fetchResponse<EtherscanTokenHolding[] | string>(chainId, {
      module: 'account',
      action: 'addresstokenbalance',
      address,
      page: String(page),
      offset: String(offset),
    });

    if (data.status === '1') {
      return Array.isArray(data.result) ? data.result : [];
    }
    // Any non-success (PRO unavailable, unsupported chain, error) → fall back.
    return null;
  }

  /**
   * Get normal (native) transactions for an address
   */
  async getNormalTransactions(
    address: string,
    chainId: number,
    options: {
      startBlock?: number;
      endBlock?: number;
      page?: number;
      offset?: number;
      sort?: 'asc' | 'desc';
    } = {},
  ): Promise<EtherscanTransaction[]> {
    return this.request<EtherscanTransaction>(chainId, {
      module: 'account',
      action: 'txlist',
      address,
      startblock: String(options.startBlock ?? 0),
      endblock: String(options.endBlock ?? 99999999),
      page: String(options.page ?? 1),
      offset: String(options.offset ?? 100),
      sort: options.sort ?? 'desc',
    });
  }

  /**
   * Get ERC-20 token transfers for an address
   */
  async getTokenTransfers(
    address: string,
    chainId: number,
    options: {
      startBlock?: number;
      endBlock?: number;
      page?: number;
      offset?: number;
      sort?: 'asc' | 'desc';
    } = {},
  ): Promise<EtherscanTokenTransfer[]> {
    return this.request<EtherscanTokenTransfer>(chainId, {
      module: 'account',
      action: 'tokentx',
      address,
      startblock: String(options.startBlock ?? 0),
      endblock: String(options.endBlock ?? 99999999),
      page: String(options.page ?? 1),
      offset: String(options.offset ?? 100),
      sort: options.sort ?? 'desc',
    });
  }

  /**
   * Fetch combined transaction history (native + ERC-20)
   */
  async getTransactionsForAddress(
    address: string,
    chainId: number,
    page: number = 1,
    pageSize: number = 100,
    startBlock: number = 0,
  ): Promise<{ normal: EtherscanTransaction[]; tokens: EtherscanTokenTransfer[] }> {
    const [normal, tokens] = await Promise.all([
      this.getNormalTransactions(address, chainId, {
        startBlock,
        page,
        offset: pageSize,
        sort: 'desc',
      }),
      this.getTokenTransfers(address, chainId, {
        startBlock,
        page,
        offset: pageSize,
        sort: 'desc',
      }),
    ]);

    return { normal, tokens };
  }
}

let instance: EtherscanService | null = null;

export function getEtherscanService(): EtherscanService {
  if (!instance) {
    instance = new EtherscanService();
  }
  return instance;
}
