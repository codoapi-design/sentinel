/**
 * Alchemy Service for CryptoBooks
 * 
 * Handles all interactions with Alchemy API:
 * - Fetching asset transfers for a wallet
 * - Getting transaction receipts with logs
 * - Classifying transactions using the classifier
 * - Supporting multiple networks (Ethereum, Base, Arbitrum, Optimism, BSC)
 */

import { Alchemy, Network, AssetTransfersCategory, AssetTransfersResult, SortingOrder } from 'alchemy-sdk';
import { classifyTransaction, type ClassifiedTransaction, type TokenTransfer } from './classifier';

// ============================================================
// Network Configuration
// ============================================================

interface NetworkConfig {
  alchemyNetwork: Network;
  name: string;
  nameAr: string;
  nativeCurrency: string;
  chainId: number;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    alchemyNetwork: Network.ETH_MAINNET,
    name: 'Ethereum',
    nameAr: 'إيثريوم',
    nativeCurrency: 'ETH',
    chainId: 1,
  },
  base: {
    alchemyNetwork: Network.BASE_MAINNET,
    name: 'Base',
    nameAr: 'بيس',
    nativeCurrency: 'ETH',
    chainId: 8453,
  },
  arbitrum: {
    alchemyNetwork: Network.ARB_MAINNET,
    name: 'Arbitrum',
    nameAr: 'أربيتروم',
    nativeCurrency: 'ETH',
    chainId: 42161,
  },
  optimism: {
    alchemyNetwork: Network.OPT_MAINNET,
    name: 'Optimism',
    nameAr: 'أوبتيميزم',
    nativeCurrency: 'ETH',
    chainId: 10,
  },
  polygon: {
    alchemyNetwork: Network.MATIC_MAINNET,
    name: 'Polygon',
    nameAr: 'بوليغون',
    nativeCurrency: 'MATIC',
    chainId: 137,
  },
};

// ============================================================
// Alchemy Client Factory
// ============================================================

const alchemyClients = new Map<string, Alchemy>();

function getAlchemyClient(networkKey: string): Alchemy {
  if (alchemyClients.has(networkKey)) {
    return alchemyClients.get(networkKey)!;
  }

  const networkConfig = NETWORKS[networkKey];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${networkKey}`);
  }

  const apiKey = process.env.ALCHEMY_API_KEY || process.env.ALCHEMY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY not set in environment');
  }

  const alchemy = new Alchemy({
    apiKey,
    network: networkConfig.alchemyNetwork,
  });

  alchemyClients.set(networkKey, alchemy);
  return alchemy;
}

// ============================================================
// Fetch & Classify Transactions
// ============================================================

export interface FetchTransactionsParams {
  walletAddress: string;
  networkKey?: string; // default: 'ethereum'
  fromBlock?: string;
  toBlock?: string;
  maxCount?: number;
  pageKey?: string;
}

export interface FetchTransactionsResult {
  transactions: ClassifiedTransaction[];
  pageKey: string | null;
  totalFetched: number;
  networkKey: string;
}

export async function fetchAndClassifyTransactions(
  params: FetchTransactionsParams
): Promise<FetchTransactionsResult> {
  const {
    walletAddress,
    networkKey = 'ethereum',
    fromBlock = 'latest',
    toBlock = 'latest',
    maxCount = 100,
    pageKey,
  } = params;

  const alchemy = getAlchemyClient(networkKey);
  const networkConfig = NETWORKS[networkKey];

  // Determine effective fromBlock - Alchemy requires block >= 0x885918 for getAssetTransfers
  // If '0x0' is provided, use a recent block instead (last 10000 blocks ≈ ~1.5 days)
  let effectiveFromBlock = fromBlock;
  if (fromBlock === '0x0' || fromBlock === '0') {
    // Use a recent block number - approximately 1 week ago
    try {
      const currentBlock = await alchemy.core.getBlockNumber();
      effectiveFromBlock = `0x${Math.max(0, currentBlock - 50000).toString(16)}`;
    } catch {
      effectiveFromBlock = 'latest';
    }
  }

  const transferCategories = [
    AssetTransfersCategory.EXTERNAL,
    AssetTransfersCategory.INTERNAL,
    AssetTransfersCategory.ERC20,
    AssetTransfersCategory.ERC721,
    AssetTransfersCategory.ERC1155,
  ];

  // Fetch outgoing transfers
  const outTransfers = await alchemy.core.getAssetTransfers({
    fromBlock: effectiveFromBlock,
    toBlock,
    maxCount,
    pageKey: pageKey || undefined,
    fromAddress: walletAddress,
    category: transferCategories,
    order: SortingOrder.DESCENDING,
    withMetadata: true,
    excludeZeroValue: true,
  });

  // Fetch incoming transfers
  const inTransfers = await alchemy.core.getAssetTransfers({
    fromBlock: effectiveFromBlock,
    toBlock,
    maxCount,
    toAddress: walletAddress,
    category: transferCategories,
    order: SortingOrder.DESCENDING,
    withMetadata: true,
    excludeZeroValue: true,
  });

  // Merge and deduplicate by hash
  const allTransfers = [...outTransfers.transfers, ...inTransfers.transfers];
  const seenHashes = new Set<string>();
  const uniqueTransfers = allTransfers.filter(t => {
    if (seenHashes.has(t.hash)) return false;
    seenHashes.add(t.hash);
    return true;
  });

  // Sort by block number descending
  uniqueTransfers.sort((a, b) => {
    const blockA = typeof a.blockNum === 'string' ? parseInt(a.blockNum, 16) : 0;
    const blockB = typeof b.blockNum === 'string' ? parseInt(b.blockNum, 16) : 0;
    return blockB - blockA;
  });

  // Classify each transaction
  const classified: ClassifiedTransaction[] = [];

  for (const transfer of uniqueTransfers) {
    try {
      const classifiedTx = await classifyAssetTransfer(transfer, walletAddress, networkKey, networkConfig);
      classified.push(classifiedTx);
    } catch (error) {
      console.error(`Error classifying tx ${transfer.hash}:`, error);
      // Still include with basic classification
      classified.push(createFallbackClassification(transfer, walletAddress, networkKey, networkConfig));
    }
  }

  return {
    transactions: classified,
    pageKey: outTransfers.pageKey || null,
    totalFetched: classified.length,
    networkKey,
  };
}

// ============================================================
// Classify a single AssetTransfer
// ============================================================

async function classifyAssetTransfer(
  transfer: AssetTransfersResult,
  userAddress: string,
  networkKey: string,
  networkConfig: NetworkConfig
): Promise<ClassifiedTransaction> {
  const alchemy = getAlchemyClient(networkKey);
  const userAddr = userAddress.toLowerCase();

  // Try to get receipt for deeper analysis
  let receipt = null;
  let txData = null;
  try {
    [receipt, txData] = await Promise.all([
      alchemy.core.getTransactionReceipt(transfer.hash),
      alchemy.core.getTransaction(transfer.hash),
    ]);
  } catch {
    // If we can't get receipt, fall back to basic classification
  }

  // Determine value
  const rawValue = transfer.rawContract?.value || '0x0';
  const valueEth = transfer.value || 0;
  const decimals = transfer.rawContract?.decimal ? parseInt(transfer.rawContract.decimal) : 18;

  // Determine direction
  const fromAddr = (transfer.from || '').toLowerCase();
  const toAddr = (transfer.to || '').toLowerCase();
  const isFromUser = fromAddr === userAddr;
  const isToUser = toAddr === userAddr;

  // Use classifier if we have receipt and tx data
  if (receipt && txData) {
    const classified = classifyTransaction({
      tx: {
        hash: txData.hash,
        from: txData.from,
        to: txData.to,
        value: txData.value.toString(),
        data: txData.data,
        gasPrice: txData.gasPrice?.toString(),
      },
      receipt: {
        status: receipt.status,
        gasUsed: Number(receipt.gasUsed),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        logs: receipt.logs.map(log => ({
          address: log.address,
          topics: log.topics as string[],
          data: log.data,
        })),
      },
      assetTransfers: [{
        from: transfer.from || '',
        to: transfer.to || '',
        value: transfer.value || null,
        asset: transfer.asset || '',
        category: transfer.category || '',
      }],
      userAddress,
      network: networkKey,
      networkAr: networkConfig.nameAr,
    });

    // Enrich with data from asset transfer
    classified.timestamp = transfer.metadata?.blockTimestamp
      ? new Date(transfer.metadata.blockTimestamp).getTime()
      : classified.timestamp;
    classified.date = transfer.metadata?.blockTimestamp
      ? new Date(transfer.metadata.blockTimestamp).toISOString().split('T')[0]
      : classified.date;
    classified.blockNumber = typeof transfer.blockNum === 'string'
      ? parseInt(transfer.blockNum, 16)
      : classified.blockNumber;

    // Add token transfer info
    if (transfer.asset && transfer.asset !== networkConfig.nativeCurrency) {
      classified.tokenTransfers = [{
        tokenSymbol: transfer.asset || 'UNKNOWN',
        tokenName: transfer.asset || 'Unknown Token',
        tokenAddress: transfer.rawContract?.address || '',
        from: transfer.from || '',
        to: transfer.to || '',
        value: rawValue,
        decimals,
        valueFormatted: valueEth,
      }];
    }

    return classified;
  }

  // Fallback: classify from asset transfer data alone
  return createFallbackClassification(transfer, userAddress, networkKey, networkConfig);
}

// ============================================================
// Fallback Classification (when receipt is unavailable)
// ============================================================

function createFallbackClassification(
  transfer: AssetTransfersResult,
  userAddress: string,
  networkKey: string,
  networkConfig: NetworkConfig,
): ClassifiedTransaction {
  const userAddr = userAddress.toLowerCase();
  const fromAddr = (transfer.from || '').toLowerCase();
  const toAddr = (transfer.to || '').toLowerCase();
  const isFromUser = fromAddr === userAddr;
  const isToUser = toAddr === userAddr;

  const rawValue = transfer.rawContract?.value || '0x0';
  const valueEth = transfer.value || 0;
  const decimals = transfer.rawContract?.decimal ? parseInt(transfer.rawContract.decimal) : 18;

  // Basic classification from direction and category
  let type: ClassifiedTransaction['type'];
  let direction: ClassifiedTransaction['direction'];

  if (isFromUser && isToUser) {
    direction = 'self';
    type = 'income';
  } else if (isFromUser) {
    direction = 'out';
    type = 'expense';
  } else {
    direction = 'in';
    type = 'income';
  }

  // Check if ERC-20 token transfer
  const isTokenTransfer = transfer.category === AssetTransfersCategory.ERC20 ||
    transfer.category === AssetTransfersCategory.ERC721 ||
    transfer.category === AssetTransfersCategory.ERC1155;

  const tokenTransfers: TokenTransfer[] = [];
  if (isTokenTransfer && transfer.asset) {
    tokenTransfers.push({
      tokenSymbol: transfer.asset,
      tokenName: transfer.asset,
      tokenAddress: transfer.rawContract?.address || '',
      from: transfer.from || '',
      to: transfer.to || '',
      value: rawValue,
      decimals,
      valueFormatted: valueEth,
    });
  }

  const timestamp = transfer.metadata?.blockTimestamp
    ? new Date(transfer.metadata.blockTimestamp).getTime()
    : Date.now();

  const date = transfer.metadata?.blockTimestamp
    ? new Date(transfer.metadata.blockTimestamp).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const blockNumber = typeof transfer.blockNum === 'string'
    ? parseInt(transfer.blockNum, 16)
    : 0;

  const TYPE_LABELS_AR = {
    income: 'إيراد',
    expense: 'مصروف',
    trade: 'تداول',
    defi: 'DeFi',
    staking: 'Staking Reward',
    gas: 'رسوم غاز',
  };

  return {
    txHash: transfer.hash,
    blockNumber,
    timestamp,
    date,
    from: transfer.from || '',
    to: transfer.to || '',
    value: rawValue,
    valueEth,
    gasUsed: 0,
    gasPrice: '0',
    gasFeeEth: 0,
    status: true,
    type,
    typeAr: TYPE_LABELS_AR[type],
    methodId: null,
    methodName: null,
    protocol: null,
    protocolAr: null,
    network: networkKey,
    networkAr: networkConfig.nameAr,
    tokenTransfers,
    direction,
  };
}

// ============================================================
// Get Wallet Portfolio (token balances)
// ============================================================

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  valueUsd: number;
  contractAddress: string;
  decimals: number;
  logo?: string;
}

export async function getWalletBalances(
  walletAddress: string,
  networkKey: string = 'ethereum'
): Promise<TokenBalance[]> {
  const alchemy = getAlchemyClient(networkKey);

  try {
    const balances = await alchemy.core.getTokenBalances(walletAddress);

    const tokenBalances: TokenBalance[] = balances.tokenBalances
      .filter(b => b.tokenBalance && b.tokenBalance !== '0x0' && b.tokenBalance !== '0x')
      .map(b => ({
        symbol: '',
        name: '',
        balance: Number(BigInt(b.tokenBalance || '0x0')) / 1e18,
        valueUsd: 0,
        contractAddress: b.contractAddress,
        decimals: 18,
      }));

    // Enrich with metadata
    for (const tb of tokenBalances) {
      try {
        const metadata = await alchemy.core.getTokenMetadata(tb.contractAddress);
        tb.symbol = metadata.symbol || 'UNKNOWN';
        tb.name = metadata.name || 'Unknown Token';
        tb.decimals = metadata.decimals || 18;
        tb.balance = Number(BigInt(tokenBalances.find(t => t.contractAddress === tb.contractAddress)?.contractAddress || '0x0')) / Math.pow(10, tb.decimals);
        tb.logo = metadata.logo || undefined;
      } catch {
        // Skip metadata if unavailable
      }
    }

    return tokenBalances.filter(tb => tb.balance > 0);
  } catch (error) {
    console.error('Error fetching wallet balances:', error);
    return [];
  }
}

// ============================================================
// Get Native Balance (ETH/MATIC)
// ============================================================

export async function getNativeBalance(
  walletAddress: string,
  networkKey: string = 'ethereum'
): Promise<number> {
  const alchemy = getAlchemyClient(networkKey);
  try {
    const balance = await alchemy.core.getBalance(walletAddress);
    return Number(balance) / 1e18;
  } catch {
    return 0;
  }
}
