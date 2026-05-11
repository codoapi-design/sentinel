// Mock data for Sentinel platform

export interface Client {
  id: string;
  name: string;
  address: string;
  notes: string;
  color: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  quantity: number;
  price: number;
  value: number;
  change24h: number;
  icon: string;
  color: string;
}

export interface Transaction {
  id: string;
  date: string;
  timestamp: number;
  type: 'income' | 'expense' | 'trade' | 'defi' | 'staking' | 'gas';
  typeLabel: string;
  token: string;
  quantity: number;
  price: number;
  value: number;
  network: string;
  networkLabel: string;
  txHash: string;
  counterparty: string;
  counterpartyLabel: string;
}

export interface PortfolioDay {
  date: string;
  value: number;
}

export interface AssetHistoryDay {
  date: string;
  price: number;
  value: number;
  quantity: number;
}

// Assets with realistic prices
export const assets: Asset[] = [
  {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    quantity: 12.5,
    price: 3456.78,
    value: 43209.75,
    change24h: 2.34,
    icon: '⟠',
    color: '#627eea',
  },
  {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    quantity: 25000,
    price: 1.0,
    value: 25000,
    change24h: 0.01,
    icon: '💲',
    color: '#2775ca',
  },
  {
    id: 'aero',
    name: 'Aerodrome',
    symbol: 'AERO',
    quantity: 8000,
    price: 0.68,
    value: 5440,
    change24h: -3.45,
    icon: '✈️',
    color: '#00d4aa',
  },
  {
    id: 'wbtc',
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    quantity: 0.5,
    price: 97250.0,
    value: 48625,
    change24h: 1.12,
    icon: '₿',
    color: '#f7931a',
  },
  {
    id: 'usdt',
    name: 'Tether',
    symbol: 'USDT',
    quantity: 5000,
    price: 1.0,
    value: 5000,
    change24h: -0.02,
    icon: '₮',
    color: '#26a17b',
  },
];

// Generate 30 days of portfolio values
export function generatePortfolioHistory(): PortfolioDay[] {
  const data: PortfolioDay[] = [];
  const now = new Date();
  let value = 68000;

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Realistic daily fluctuation between -2% and +2.5%
    const change = (Math.random() - 0.45) * 0.04;
    value = value * (1 + change);

    // Ensure it ends near $73,350
    if (i === 0) {
      value = 73350;
    }

    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    });
  }

  return data;
}

// Generate 90 days of asset price/value history
export function generateAssetHistory(symbol: string): AssetHistoryDay[] {
  const data: AssetHistoryDay[] = [];
  const now = new Date();

  const assetConfig: Record<string, { basePrice: number; baseQuantity: number; volatility: number }> = {
    ETH: { basePrice: 3456.78, baseQuantity: 12.5, volatility: 0.03 },
    USDC: { basePrice: 1.0, baseQuantity: 25000, volatility: 0.001 },
    USDT: { basePrice: 1.0, baseQuantity: 5000, volatility: 0.001 },
    WBTC: { basePrice: 97250.0, baseQuantity: 0.5, volatility: 0.025 },
    AERO: { basePrice: 0.68, baseQuantity: 8000, volatility: 0.05 },
  };

  const config = assetConfig[symbol] || { basePrice: 100, baseQuantity: 100, volatility: 0.03 };
  let price = config.basePrice * (0.8 + Math.random() * 0.2);
  let quantity = config.baseQuantity;

  for (let i = 89; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const priceChange = (Math.random() - 0.48) * config.volatility;
    price = price * (1 + priceChange);

    if (i === 0) {
      price = config.basePrice;
    }

    if (Math.random() > 0.7) {
      const qtyChange = (Math.random() - 0.45) * config.baseQuantity * 0.02;
      quantity = Math.max(config.baseQuantity * 0.5, quantity + qtyChange);
    }
    if (i === 0) {
      quantity = config.baseQuantity;
    }

    const value = price * quantity;

    data.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(price * 100) / 100,
      value: Math.round(value * 100) / 100,
      quantity: Math.round(quantity * 10000) / 10000,
    });
  }

  return data;
}

export const transactionTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'trade', label: 'Trade' },
  { value: 'defi', label: 'DeFi' },
  { value: 'staking', label: 'Staking Reward' },
  { value: 'gas', label: 'Gas Fee' },
];

// Networks
export const networks = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'optimism', label: 'Optimism' },
  { value: 'bsc', label: 'BSC' },
];

// Generate 50 realistic transactions
export function generateTransactions(): Transaction[] {
  const txTypes: Array<{ type: Transaction['type']; typeLabel: string }> = [
    { type: 'income', typeLabel: 'Income' },
    { type: 'expense', typeLabel: 'Expense' },
    { type: 'trade', typeLabel: 'Trade' },
    { type: 'defi', typeLabel: 'DeFi' },
    { type: 'staking', typeLabel: 'Staking Reward' },
    { type: 'gas', typeLabel: 'Gas Fee' },
  ];

  const tokens = ['ETH', 'USDC', 'USDT', 'WBTC', 'AERO'];
  const tokenPrices: Record<string, number> = {
    ETH: 3456.78,
    USDC: 1.0,
    USDT: 1.0,
    WBTC: 97250.0,
    AERO: 0.68,
  };

  const networkList = [
    { value: 'ethereum', label: 'Ethereum' },
    { value: 'base', label: 'Base' },
    { value: 'arbitrum', label: 'Arbitrum' },
    { value: 'optimism', label: 'Optimism' },
    { value: 'bsc', label: 'BSC' },
  ];

  const counterparties = [
    { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', label: 'Uniswap V2' },
    { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', label: 'Uniswap V3' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC Treasury' },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', label: 'USDT Treasury' },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', label: 'DAI Contract' },
    { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', label: 'UNI Token' },
    { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', label: 'SHIB Token' },
    { address: '0xBA12222222228d8Ba445958a75a0704d566BF2C8', label: 'Balancer Vault' },
    { address: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', label: 'Compound' },
    { address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', label: 'Aave Lending' },
    { address: '0xc00e94Cb662C3520282E6f5717214004A7f26888', label: 'COMP Token' },
    { address: '0x0D8775F648430679A709E98d2b0Cb6250d2887EF', label: 'BAT Token' },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', label: 'Chainlink' },
    { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', label: 'MKR Token' },
    { address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', label: 'HEX Token' },
  ];

  const transactions: Transaction[] = [];
  const now = Date.now();

  for (let i = 0; i < 50; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(now - daysAgo * 86400000);
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const price = tokenPrices[token];
    const type = txTypes[Math.floor(Math.random() * txTypes.length)];
    const network = networkList[Math.floor(Math.random() * networkList.length)];
    const counterparty = counterparties[Math.floor(Math.random() * counterparties.length)];

    let quantity: number;
    if (token === 'WBTC') {
      quantity = Math.round((Math.random() * 0.1 + 0.001) * 10000) / 10000;
    } else if (token === 'ETH') {
      quantity = Math.round((Math.random() * 5 + 0.1) * 1000) / 1000;
    } else if (token === 'AERO') {
      quantity = Math.round((Math.random() * 2000 + 100) * 100) / 100;
    } else {
      quantity = Math.round((Math.random() * 5000 + 100) * 100) / 100;
    }

    const value = Math.round(quantity * price * 100) / 100;
    const hash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    transactions.push({
      id: `tx-${i + 1}`,
      date: date.toISOString().split('T')[0],
      timestamp: date.getTime(),
      type: type.type,
      typeLabel: type.typeLabel,
      token,
      quantity,
      price,
      value,
      network: network.value,
      networkLabel: network.label,
      txHash: hash,
      counterparty: counterparty.address,
      counterpartyLabel: counterparty.label,
    });
  }

  return transactions.sort((a, b) => b.timestamp - a.timestamp);
}

// Default clients
export const defaultClients: Client[] = [
  {
    id: 'client-1',
    name: 'Uniswap V2',
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    notes: 'Decentralized exchange - Uniswap V2',
    color: '#ff007a',
    createdAt: '2024-01-15',
  },
  {
    id: 'client-2',
    name: 'Uniswap V3',
    address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    notes: 'Decentralized exchange - Uniswap V3',
    color: '#ff007a',
    createdAt: '2024-02-01',
  },
  {
    id: 'client-3',
    name: 'USDC Treasury',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    notes: 'Official USDC token contract',
    color: '#2775ca',
    createdAt: '2024-01-20',
  },
  {
    id: 'client-4',
    name: 'Aave',
    address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
    notes: 'Decentralized lending platform - Aave',
    color: '#b6509e',
    createdAt: '2024-03-10',
  },
  {
    id: 'client-5',
    name: 'Compound',
    address: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    notes: 'Decentralized lending platform - Compound',
    color: '#00d395',
    createdAt: '2024-02-15',
  },
];

// Helper: get client name by address
export function getClientNameByAddress(address: string, clients: Client[]): string | null {
  const client = clients.find(c => c.address.toLowerCase() === address.toLowerCase());
  return client ? client.name : null;
}

// Dashboard summary cards
export const dashboardSummary = {
  totalRevenue: 28450.0,
  totalExpenses: 12350.0,
  netFlow: 16100.0,
  gasFees: 847.32,
  totalPortfolio: 127274.75,
  change24h: 2.34,
};

// Telegram notification settings defaults
export const defaultTelegramSettings = {
  enabled: false,
  inboundAbove: { enabled: false, amount: 1000 },
  outboundAbove: { enabled: false, amount: 500 },
  portfolioReaches: { enabled: false, amount: 80000 },
  assetRises: { enabled: false, percentage: 5, asset: 'ETH' },
  assetDrops: { enabled: false, percentage: 5, asset: 'ETH' },
  dailySummary: { enabled: false, time: '09:00' },
  weeklyReport: { enabled: false, day: 'Monday' },
  gasExceeds: { enabled: false, amount: 50 },
};

// Email notification settings defaults
export const defaultEmailSettings = {
  enabled: false,
  email: '',
  verified: false,
  inboundAbove: { enabled: false, amount: 1000 },
  outboundAbove: { enabled: false, amount: 500 },
  portfolioReaches: { enabled: false, amount: 80000 },
  assetRises: { enabled: false, percentage: 5, asset: 'ETH' },
  assetDrops: { enabled: false, percentage: 5, asset: 'ETH' },
  dailySummary: { enabled: false, time: '09:00' },
  weeklyReport: { enabled: false, day: 'Monday' },
  gasExceeds: { enabled: false, amount: 50 },
  monthlyReport: { enabled: false, day: 1 },
  largeTransaction: { enabled: false, amount: 5000 },
};

// AI chat responses
export const aiResponses: Record<string, string> = {
  'default': 'Hello! I\'m your intelligent accounting assistant. I can help you analyze your wallet and transactions. Ask me anything!',
  'portfolio': 'Your current portfolio value is $127,274.75, up 2.34% in the last 24 hours. Your largest asset is WBTC at $48,625, followed by ETH at $43,209.75.',
  'expenses': 'Your total expenses this month are $12,350, with gas fees of $847.32. I recommend reviewing your transactions on the Ethereum mainnet where gas fees are highest.',
  'tax': 'Based on your transactions this year, you have estimated capital gains of approximately $4,250. Please note these are approximate calculations and a specialist accountant should be consulted for confirmation.',
  'defi': 'You have 3 DeFi transactions this month with a total value of $2,450. Most are on Base and Arbitrum networks. You can see details in the transactions table with the DeFi type filter.',
  'gas': 'Total gas fees this month are $847.32. Most fees are from Ethereum mainnet transactions ($612.45). I recommend using Layer 2 networks like Base or Arbitrum to reduce fees.',
  'alert': 'You can set up custom alerts from the Telegram settings panel. Options include alerts for large transfers, portfolio changes, and periodic reports.',
};

// Pricing tiers
export interface PricingTier {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  yearlyMonthly: number;
  description: string;
  features: string[];
  limits: {
    wallets: number;
    networks: number;
    transactions: number;
    aiChats: number;
    syncInterval: string;
    reports: string;
  };
  costBreakdown: {
    alchemy: number;
    openai: number;
    infra: number;
    total: number;
  };
  highlighted: boolean;
  badge?: string;
}

// Days of the week (English)
export const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Backward compatibility alias
export const daysOfWeekAr = daysOfWeek;

export const pricingTiers: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    nameEn: 'Starter',
    price: 9.99,
    yearlyMonthly: 8.29,
    description: 'Perfect for getting started with crypto tracking',
    features: [
      '1 Wallet',
      '5 Networks (Ethereum, Base, Arbitrum, Optimism, Polygon)',
      'Up to 500 recorded transactions',
      'AI Assistant — 100 messages/month',
      'Sync every 10 minutes',
      'Weekly & monthly reports via Telegram & Email',
      'Basic alerts (Telegram + Email)',
      'Auto-classification (Trade, DeFi, Staking, Gas)',
      'CSV & PDF export',
      'Name your clients',
    ],
    limits: {
      wallets: 1,
      networks: 5,
      transactions: 500,
      aiChats: 100,
      syncInterval: '10 min',
      reports: 'Weekly & Monthly',
    },
    costBreakdown: {
      alchemy: 1.85,
      openai: 0.06,
      infra: 2.50,
      total: 4.41,
    },
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    nameEn: 'Pro',
    price: 28,
    yearlyMonthly: 23.3,
    description: 'For active traders and investors',
    features: [
      'Up to 5 Wallets',
      '5 Networks (Ethereum, Base, Arbitrum, Optimism, Polygon)',
      'Up to 5,000 recorded transactions',
      'AI Assistant — 500 messages/month',
      'Sync every minute',
      'Daily, weekly & monthly reports',
      'Advanced custom alerts',
      'Auto-classification (Trade, DeFi, Staking, Gas)',
      'PDF & CSV export',
      'Name your clients',
    ],
    limits: {
      wallets: 5,
      networks: 5,
      transactions: 5000,
      aiChats: 500,
      syncInterval: '1 min',
      reports: 'Daily',
    },
    costBreakdown: {
      alchemy: 13.21,
      openai: 0.30,
      infra: 4.49,
      total: 18.00,
    },
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameEn: 'Enterprise',
    price: 99,
    yearlyMonthly: 82.17,
    description: 'For companies and professional accountants',
    features: [
      'Up to 25 Wallets',
      'All supported networks',
      'Unlimited transactions',
      'AI Assistant — Unlimited messages',
      'Real-time sync (every 30 seconds)',
      'Custom reports for any period',
      'Instant alerts + Webhooks',
      'Advanced AI classification',
      'PDF, CSV & Excel export',
      'Automated tax analysis (FIFO/LIFO)',
      'API Access',
      'Priority support + Dedicated accountant',
    ],
    limits: {
      wallets: 25,
      networks: 10,
      transactions: Infinity,
      aiChats: Infinity,
      syncInterval: '30 sec',
      reports: 'Custom',
    },
    costBreakdown: {
      alchemy: 32.51,
      openai: 2.40,
      infra: 14.26,
      total: 49.17,
    },
    highlighted: false,
    badge: 'For Professionals',
  },
];
