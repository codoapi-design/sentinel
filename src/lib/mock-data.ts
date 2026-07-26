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
  type: 'income' | 'expense' | 'trade' | 'defi' | 'staking' | 'gas' | 'nft' | 'bridge';
  /** Accounting classification label (Income, Expense, Trade, …) */
  typeLabel: string;
  /**
   * On-chain / explorer-style activity (Receive, Transfer, Swap, Approve, …).
   * Shown beside Date, before Classification.
   */
  activity: string;
  methodName?: string | null;
  direction?: 'in' | 'out' | string | null;
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

// Supported tokens for alert/notification pickers (config only — NOT holdings).
export const assets: Pick<Asset, 'id' | 'symbol' | 'name'>[] = [
  { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
  { id: 'usdc', symbol: 'USDC', name: 'USD Coin' },
  { id: 'usdt', symbol: 'USDT', name: 'Tether' },
  { id: 'wbtc', symbol: 'WBTC', name: 'Wrapped Bitcoin' },
  { id: 'dai', symbol: 'DAI', name: 'Dai' },
];

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

// Helper: get client name by address (meaningful custom names only)
export { getClientNameByAddress } from '@/lib/clients/display';

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
      'EVM address only (Ethereum, Base, Arbitrum, OP, Polygon, BSC…)',
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
      networks: 1,
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
      'EVM + Solana + Tron addresses',
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
      networks: 3,
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
    name: 'Business',
    nameEn: 'Business',
    price: 99,
    yearlyMonthly: 82.17,
    description: 'For companies and professional accountants',
    features: [
      'Up to 25 Wallets',
      'EVM + Solana + Tron + Bitcoin addresses',
      'Unlimited transactions',
      'AI Assistant — Unlimited messages',
      'Real-time sync (every 30 seconds)',
      'Custom reports for any period',
      'Instant alerts',
      'Advanced AI classification',
      'PDF, CSV & Excel export',
      'Priority support',
    ],
    limits: {
      wallets: 25,
      networks: 4,
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
