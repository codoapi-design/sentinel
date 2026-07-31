/**
 * Transaction Classifier for CryptoBooks
 * 
 * Classifies blockchain transactions into types:
 * - income: Incoming transfers (native or ERC-20)
 * - expense: Outgoing transfers (native or ERC-20)
 * - trade: Token swaps on DEXes (Uniswap, SushiSwap, 1inch, etc.)
 * - defi: DeFi interactions (lending, borrowing, staking, liquidity provision)
 * - staking: Staking rewards
 * - gas: Network gas fees (always present, but only classified as 'gas' type
 *         when the transaction's sole purpose is gas payment for a failed tx)
 */

// ============================================================
// Known Contract Addresses Database
// ============================================================

export interface ProtocolInfo {
  name: string;
  nameAr: string;
  type: 'trade' | 'defi' | 'staking' | 'nft' | 'bridge';
}

// Mainnet contract addresses (lowercase for matching)
const PROTOCOL_DB: Record<string, ProtocolInfo> = {
  // Uniswap
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': { name: 'Uniswap V3 Router', nameAr: 'Uniswap V3 Router', type: 'trade' },
  '0xe592427a0aece92de3edee1f18e0157c05861564': { name: 'Uniswap V3 SwapRouter', nameAr: 'Uniswap V3 SwapRouter', type: 'trade' },
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap Universal Router', nameAr: 'Uniswap Universal Router', type: 'trade' },

  // SushiSwap
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': { name: 'SushiSwap Router', nameAr: 'SushiSwap Router', type: 'trade' },
  '0x1b02da8cb0d097eb8d57a175b8817e87f2e0f5d3': { name: 'SushiSwap Router V2', nameAr: 'SushiSwap Router V2', type: 'trade' },

  // 1inch
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch Router', nameAr: '1inch Router', type: 'trade' },
  '0x111111125421ca6dc452d289314280a0f8842a65': { name: '1inch Router V5', nameAr: '1inch Router V5', type: 'trade' },

  // Curve
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { name: 'Curve Registry', nameAr: 'Curve Registry', type: 'trade' },
  '0x99a58482bd75cbab83b27ec03ca68ff489b5788f': { name: 'Curve Address Provider', nameAr: 'Curve Address Provider', type: 'trade' },

  // Paraswap
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': { name: 'ParaSwap Router', nameAr: 'ParaSwap Router', type: 'trade' },

  // Aave
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': { name: 'Aave Lending Pool V2', nameAr: 'Aave Lending Pool V2', type: 'defi' },
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': { name: 'Aave Pool V3', nameAr: 'Aave Pool V3', type: 'defi' },
  '0x8164cc65827dcfe994ab23944cbc90e0aa80bfcb': { name: 'Aave WETH Gateway', nameAr: 'Aave WETH Gateway', type: 'defi' },

  // Compound
  '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b': { name: 'Comptroller', nameAr: 'Comptroller', type: 'defi' },
  '0x39aa39c021dfbae8fac545936693ac917d5e7563': { name: 'cUSDC', nameAr: 'cUSDC', type: 'defi' },
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643': { name: 'cDAI', nameAr: 'cDAI', type: 'defi' },
  '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5': { name: 'cETH', nameAr: 'cETH', type: 'defi' },

  // Lido
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { name: 'Lido StETH', nameAr: 'Lido StETH', type: 'staking' },
  '0x1719b35ac1e0f2e2443b4e6b3e7e5c5d5e7f8e9a': { name: 'Lido Withdrawal', nameAr: 'Lido Withdrawal', type: 'staking' },

  // MakerDAO
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': { name: 'MKR Token', nameAr: 'MKR Token', type: 'defi' },

  // Balancer
  '0xba12222222228d8ba445958a75a0704d566bf2c8': { name: 'Balancer Vault', nameAr: 'Balancer Vault', type: 'defi' },

  // Rocket Pool
  '0xdd32650c4ca425e13d2e17e6f3e5f95e5886c0fd': { name: 'Rocket Pool Deposit', nameAr: 'Rocket Pool Deposit', type: 'staking' },

  // Yearn
  '0x0000000022d53366457f9d5e68ec105046fc4383': { name: 'Yearn Registry', nameAr: 'Yearn Registry', type: 'defi' },

  // Bridges (interaction with these contracts is never a pure Send/expense)
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': { name: 'Base Bridge', nameAr: 'Base Bridge', type: 'bridge' },
  '0x49048044d57e1c92a77f79988d21fa8faf74e97f': { name: 'Base Portal', nameAr: 'Base Portal', type: 'bridge' },
  '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f': { name: 'Arbitrum Inbox', nameAr: 'Arbitrum Inbox', type: 'bridge' },
  '0x72ce9c846789fdb6fc1f34ac4ad25dd9ef7031ef': { name: 'Arbitrum Gateway', nameAr: 'Arbitrum Gateway', type: 'bridge' },
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1': { name: 'Optimism Gateway', nameAr: 'Optimism Gateway', type: 'bridge' },
  '0x0439e60f02a8900a951603950d8d4527f400c3f1': { name: 'MetaMask Bridge', nameAr: 'MetaMask Bridge', type: 'bridge' },

  // NFT marketplaces
  '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b': { name: 'OpenSea Seaport', nameAr: 'OpenSea Seaport', type: 'nft' },
  '0x00000000006c3852cbef3e08e8df289169ede581': { name: 'Seaport 1.1', nameAr: 'Seaport 1.1', type: 'nft' },
};

// ============================================================
// Method ID Database
// ============================================================

interface MethodInfo {
  name: string;
  type: 'trade' | 'defi' | 'staking' | 'bridge';
}

const METHOD_DB: Record<string, MethodInfo> = {
  // Uniswap / DEX swaps
  '0x38ed1739': { name: 'swapExactTokensForTokens', type: 'trade' },
  '0x8803dbee': { name: 'swapTokensForExactTokens', type: 'trade' },
  '0x7ff36ab5': { name: 'swapExactETHForTokens', type: 'trade' },
  '0x18cbafe5': { name: 'swapExactTokensForETH', type: 'trade' },
  '0x791ac947': { name: 'swapExactTokensForETHSupportingFeeOnTransferTokens', type: 'trade' },
  '0xa2e8d6ce': { name: 'swapETHForExactTokens', type: 'trade' },
  '0xb6f9de95': { name: 'swapExactETHForTokensSupportingFeeOnTransferTokens', type: 'trade' },
  '0x88316456': { name: 'swapTokensForExactETH', type: 'trade' },
  '0x5c11d795': { name: 'swapExactTokensForETHSupportingFeeOnTransferTokens', type: 'trade' },

  // V3 Swaps
  '0x04e45aaf': { name: 'exactInputSingle', type: 'trade' },
  '0x5023b4df': { name: 'exactOutputSingle', type: 'trade' },
  '0xb858183f': { name: 'exactInput', type: 'trade' },
  '0xf28c0498': { name: 'exactOutput', type: 'trade' },

  // Universal Router
  '0x3593564c': { name: 'execute', type: 'trade' },
  '0x24856bc3': { name: 'executeWithReturn', type: 'trade' },

  // Liquidity provision (DeFi)
  '0xe8e33700': { name: 'addLiquidity', type: 'defi' },
  '0xf305d719': { name: 'addLiquidityETH', type: 'defi' },
  '0x02751cec': { name: 'removeLiquidityETH', type: 'defi' },

  // Aave
  '0xe8eda9df': { name: 'deposit', type: 'defi' },
  '0x69328dec': { name: 'withdraw', type: 'defi' },
  '0xc5ebeac7': { name: 'borrow', type: 'defi' },
  '0x573ade81': { name: 'repay', type: 'defi' },
  '0xa415bc08': { name: 'setUserUseReserveAsCollateral', type: 'defi' },

  // Compound
  '0xa0712d68': { name: 'mint', type: 'defi' },
  '0xdb006a75': { name: 'redeem', type: 'defi' },
  '0x3b4da69f': { name: 'redeemUnderlying', type: 'defi' },
  '0xeabe7d91': { name: 'repayBorrow', type: 'defi' },

  // Staking
  '0x6e553f65': { name: 'submit', type: 'staking' }, // Lido
  '0x3ccfd60b': { name: 'withdraw', type: 'staking' }, // Lido
  '0xa694fc3a': { name: 'stake', type: 'staking' },
  '0x2e1a7d4d': { name: 'withdraw', type: 'staking' },
  '0x0e15561a': { name: 'getReward', type: 'staking' },

  // Approvals — never expense/outflow
  '0x095ea7b3': { name: 'approve', type: 'trade' },
  '0x2195995c': { name: 'increaseAllowance', type: 'trade' },
  '0xa22cb465': { name: 'setApprovalForAll', type: 'trade' },

  // Pure ERC-20 transfers (direction resolved in refineTransactionType)
  '0xa9059cbb': { name: 'transfer', type: 'trade' },
  '0x23b872dd': { name: 'transferFrom', type: 'trade' },

  // MetaMask / aggregator swaps
  '0x5f575529': { name: 'swap', type: 'trade' }, // MetaMask Swap Router

  // Bridge / L2 messaging
  '0x428d7197': { name: 'deposit', type: 'bridge' }, // Arbitrum bridge
  '0x9ca36928': { name: 'withdraw', type: 'bridge' },
  '0xe11087d5': { name: 'depositTransaction', type: 'bridge' }, // OP Stack / Base
  '0xb1a1a882': { name: 'depositETH', type: 'bridge' },
  '0x2e7ba6ef': { name: 'depositERC20', type: 'bridge' },
  '0x58a99744': { name: 'bridgeETH', type: 'bridge' },
  '0x0ad58d2f': { name: 'bridgeERC20', type: 'bridge' },
  '0xc7c7f36d': { name: 'sendMessage', type: 'bridge' },
  '0x3dbb202b': { name: 'sendMessage', type: 'bridge' },
  '0x7b9bb414': { name: 'bridgeAndCall', type: 'bridge' },
};

// ============================================================
// Well-known Event Signatures (topic[0])
// ============================================================

const SWAP_EVENT_SIG = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'; // Uniswap Swap
const SWAP_V3_EVENT_SIG = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115d0d8af3'; // Uniswap V3 Swap
const DEPOSIT_EVENT_SIG = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c'; // Deposit(address,uint256)
const WITHDRAW_EVENT_SIG = '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65'; // Withdrawal(address,uint256)
const TRANSFER_EVENT_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer
const REWARD_PAID_SIG = '0xe2403640ba68fed3a2f88b7557551d1993f84b99bb10ff833f0cf8db0c5e0486'; // RewardPaid

// ============================================================
// Classification Types
// ============================================================

export type TransactionType = 'income' | 'expense' | 'trade' | 'defi' | 'staking' | 'gas' | 'nft' | 'bridge';

export interface ClassifiedTransaction {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  date: string;
  from: string;
  to: string;
  value: string; // ETH value in wei as string
  valueEth: number; // ETH value as number
  gasUsed: number;
  gasPrice: string;
  gasFeeEth: number;
  status: boolean; // true = success, false = failed
  type: TransactionType;
  typeAr: string;
  methodId: string | null;
  methodName: string | null;
  protocol: string | null;
  protocolAr: string | null;
  network: string;
  networkAr: string;
  // ERC-20 transfers within this transaction
  tokenTransfers: TokenTransfer[];
  // Direction relative to the tracked wallet
  direction: 'in' | 'out' | 'self' | 'mixed';
}

export interface TokenTransfer {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  from: string;
  to: string;
  value: string; // raw value
  decimals: number;
  valueFormatted: number; // human-readable
}

// ============================================================
// Type labels (English)
// ============================================================

const TYPE_LABELS_AR: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  trade: 'Trade',
  defi: 'DeFi',
  staking: 'Staking Reward',
  gas: 'Gas Fees',
  nft: 'NFT',
  bridge: 'Bridge',
};

// ============================================================
// Main Classification Function
// ============================================================

export function classifyTransaction(params: {
  tx: {
    hash: string;
    from: string;
    to: string | null;
    value: string;
    data: string;
    gasPrice?: string;
    network?: string;
  };
  receipt: {
    status: number | boolean;
    gasUsed: number;
    effectiveGasPrice: string;
    logs: Array<{
      address: string;
      topics: string[];
      data: string;
    }>;
  };
  assetTransfers?: Array<{
    from: string;
    to: string;
    value: number | null;
    asset: string;
    category: string;
  }>;
  userAddress: string;
  network?: string;
  networkAr?: string;
}): ClassifiedTransaction {
  const { tx, receipt, assetTransfers, userAddress, network = 'ethereum', networkAr = 'Ethereum' } = params;
  const userAddr = userAddress.toLowerCase();
  const txFrom = tx.from.toLowerCase();
  const txTo = (tx.to || '').toLowerCase();
  const isFromUser = txFrom === userAddr;
  const isToUser = txTo === userAddr;

  // Calculate gas fee
  const gasUsed = receipt.gasUsed;
  const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
  const gasFeeWei = BigInt(gasUsed) * effectiveGasPrice;
  const gasFeeEth = Number(gasFeeWei) / 1e18;
  const valueEth = Number(tx.value) / 1e18;

  // Check if transaction failed
  const isSuccess = receipt.status === 1 || receipt.status === true;

  // If failed, classify as gas-only
  if (!isSuccess) {
    return {
      txHash: tx.hash,
      blockNumber: 0,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      from: tx.from,
      to: tx.to || '',
      value: tx.value,
      valueEth,
      gasUsed,
      gasPrice: receipt.effectiveGasPrice,
      gasFeeEth,
      status: false,
      type: 'gas',
      typeAr: TYPE_LABELS_AR.gas,
      methodId: tx.data?.slice(0, 10) || null,
      methodName: null,
      protocol: null,
      protocolAr: null,
      network,
      networkAr,
      tokenTransfers: [],
      direction: isFromUser ? 'out' : 'in',
    };
  }

  // Extract method ID
  const methodId = tx.data && tx.data.length >= 10 ? tx.data.slice(0, 10) : null;

  // Step 1: Check method ID against known methods
  let classifiedType: TransactionType | null = null;
  let methodName: string | null = null;
  let protocol: string | null = null;
  let protocolAr: string | null = null;

  if (methodId && METHOD_DB[methodId]) {
    const methodInfo = METHOD_DB[methodId];
    classifiedType = methodInfo.type;
    methodName = methodInfo.name;
  }

  // Step 2: Check contract address against known protocols
  if (txTo && PROTOCOL_DB[txTo]) {
    const protocolInfo = PROTOCOL_DB[txTo];
    protocol = protocolInfo.name;
    protocolAr = protocolInfo.nameAr;
    // Contract-level classification overrides only if no method match
    if (!classifiedType) {
      classifiedType = protocolInfo.type;
    }
  }

  // Step 3: Analyze event logs for more precise classification
  const topics0 = receipt.logs.map(log => log.topics[0]?.toLowerCase());

  if (topics0.includes(SWAP_EVENT_SIG) || topics0.includes(SWAP_V3_EVENT_SIG)) {
    classifiedType = 'trade';
    if (!protocol) protocol = 'DEX Swap';
    if (!protocolAr) protocolAr = 'DEX';
  } else if (topics0.includes(DEPOSIT_EVENT_SIG) || topics0.includes(WITHDRAW_EVENT_SIG)) {
    if (!classifiedType || classifiedType === 'trade') {
      classifiedType = 'defi';
    }
  } else if (topics0.includes(REWARD_PAID_SIG)) {
    classifiedType = 'staking';
  }

  // Step 4: If still unclassified, determine by direction
  if (!classifiedType) {
    // Simple ETH transfer or ERC-20 transfer
    if (isFromUser && !isToUser) {
      classifiedType = 'expense';
    } else if (!isFromUser && isToUser) {
      classifiedType = 'income';
    } else if (isFromUser && isToUser) {
      // Self-transfer
      classifiedType = 'income';
    } else {
      // Neither from nor to user - might be internal
      classifiedType = 'income';
    }
  }

  // Step 5: For trade/defi/staking, refine direction
  let direction: 'in' | 'out' | 'self' | 'mixed';
  if (isFromUser && isToUser) {
    direction = 'self';
  } else if (isFromUser) {
    direction = 'out';
  } else if (isToUser) {
    direction = 'in';
  } else {
    direction = 'mixed';
  }

  // For trade/defi types, check if user is net receiver or sender
  if (classifiedType === 'trade' || classifiedType === 'defi') {
    // Check token transfers to determine net direction
    if (assetTransfers && assetTransfers.length > 0) {
      let hasIn = false;
      let hasOut = false;
      for (const transfer of assetTransfers) {
        if (transfer.from.toLowerCase() === userAddr) hasOut = true;
        if (transfer.to.toLowerCase() === userAddr) hasIn = true;
      }
      if (hasIn && hasOut) direction = 'mixed';
      else if (hasIn) direction = 'in';
      else if (hasOut) direction = 'out';
    }
  }

  // Build token transfers list from assetTransfers
  const tokenTransfers: TokenTransfer[] = (assetTransfers || []).map(t => ({
    tokenSymbol: t.asset || 'UNKNOWN',
    tokenName: t.asset || 'Unknown Token',
    tokenAddress: '',
    from: t.from,
    to: t.to,
    value: String(t.value || 0),
    decimals: 18,
    valueFormatted: t.value || 0,
  }));

  return {
    txHash: tx.hash,
    blockNumber: 0,
    timestamp: Date.now(),
    date: new Date().toISOString().split('T')[0],
    from: tx.from,
    to: tx.to || '',
    value: tx.value,
    valueEth,
    gasUsed,
    gasPrice: receipt.effectiveGasPrice,
    gasFeeEth,
    status: true,
    type: classifiedType,
    typeAr: TYPE_LABELS_AR[classifiedType],
    methodId,
    methodName,
    protocol,
    protocolAr,
    network,
    networkAr,
    tokenTransfers,
    direction,
  };
}

// ============================================================
// Get protocol info for a contract address
// ============================================================

export function getProtocolInfo(address: string): ProtocolInfo | null {
  return PROTOCOL_DB[address.toLowerCase()] || null;
}

// ============================================================
// Get method info for a method ID
// ============================================================

export function getMethodInfo(methodId: string): MethodInfo | null {
  return METHOD_DB[methodId.toLowerCase()] || null;
}
