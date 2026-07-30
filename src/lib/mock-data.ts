// Mock data for Radareum platform

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
  ...createTelegramAlertDefaults(),
};

function createTelegramAlertDefaults() {
  // Lazy inline to avoid circular imports with plans/alerts in mock-data consumers
  return {
    inboundAbove: { enabled: false, amount: 1000 },
    outboundAbove: { enabled: false, amount: 500 },
    portfolioReaches: { enabled: false, amount: 80000 },
    assetRises: { enabled: false, percentage: 5, asset: 'ETH' },
    assetDrops: { enabled: false, percentage: 5, asset: 'ETH' },
    dailySummary: { enabled: false, time: '09:00' },
    weeklyReport: { enabled: false, day: 'Monday' },
    monthlyReport: { enabled: false, day: 1 },
    gasExceeds: { enabled: false, amount: 50 },
    multiAssetMoves: { enabled: false, percentage: 5 },
    namedClientTransfer: { enabled: false },
    unknownAddress: { enabled: false },
    tradingVolumeSpike: { enabled: false, amount: 10000 },
    netFlowDaily: { enabled: false, amount: -1000 },
    pnlThreshold: { enabled: false, amount: -5000 },
    portfolioConcentration: { enabled: false, percentage: 40 },
    dormancyBreak: { enabled: false, days: 7 },
    gasWeekly: { enabled: false, amount: 200 },
    stakingRewards: { enabled: false },
    instantLargeTransfer: { enabled: false, amount: 5000 },
    tokenApprovalRisk: { enabled: false },
    defiHealthFactor: { enabled: false, threshold: 1.25 },
    spamTokenDetected: { enabled: false },
    syncFailure: { enabled: false },
  };
}

// Email notification settings defaults
export const defaultEmailSettings = {
  enabled: false,
  email: '',
  verified: false,
  ...createTelegramAlertDefaults(),
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
    syncInterval: string;
    reports: string;
    /** Shared AI request cap (Analyze + chat + Telegram). `null` = no cap. */
    aiRequests?: number | null;
  };
  costBreakdown: {
    alchemy: number;
    infra: number;
    total: number;
  };
  highlighted: boolean;
  badge?: string;
  /** True for the zero-cost trial tier. */
  isFree?: boolean;
  /** Trial length in days when `isFree` is set. */
  trialDays?: number;
}

// Days of the week (English)
export const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Backward compatibility alias
export const daysOfWeekAr = daysOfWeek;

export const pricingTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free Plan',
    nameEn: 'Free Plan',
    price: 0,
    yearlyMonthly: 0,
    description: 'Try Radareum for 3 days with limited usage across every feature',
    features: [
      '1 Wallet',
      'EVM address only (Ethereum, Base, Arbitrum, OP, Polygon, BSC…)',
      'Up to 100 recorded transactions',
      'Auto sync every 10 minutes',
      'Daily reports via Telegram only',
      'Basic alerts (Telegram)',
      '50 AI requests (Analyze, chat, or Telegram)',
      'Auto-classification (Trade, DeFi, Staking, Gas)',
      'CSV & PDF export',
      'Name your clients',
    ],
    limits: {
      wallets: 1,
      networks: 1,
      transactions: 100,
      syncInterval: '10 min',
      reports: 'Daily (Telegram)',
      aiRequests: 50,
    },
    costBreakdown: {
      alchemy: 0,
      infra: 0,
      total: 0,
    },
    highlighted: false,
    badge: '3-day trial',
    isFree: true,
    trialDays: 3,
  },
  {
    id: 'starter',
    name: 'Starter',
    nameEn: 'Starter',
    price: 9.99,
    yearlyMonthly: 8.29,
    description: 'Perfect for getting started with crypto tracking',
    features: [
      '2 Wallets',
      'EVM address only (Ethereum, Base, Arbitrum, OP, Polygon, BSC…)',
      'Up to last 1,500 recorded transactions per wallet (no spam)',
      'Auto sync every 15 minutes (manual sync anytime)',
      'Weekly & monthly auto reports via Telegram & Email',
      'Basic alerts (Telegram + Email)',
      '150 AI requests (Analyze, chat, or Telegram)',
      'Auto-classification (Trade, DeFi, Staking, Gas)',
      'CSV & PDF export',
      'Name your clients',
    ],
    limits: {
      wallets: 2,
      networks: 1,
      transactions: 1500,
      syncInterval: '15 min',
      reports: 'Weekly & Monthly',
      aiRequests: 150,
    },
    costBreakdown: {
      alchemy: 1.85,
      infra: 2.50,
      total: 4.35,
    },
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    nameEn: 'Pro',
    price: 39,
    yearlyMonthly: 32.37,
    description: 'For active traders and investors',
    features: [
      '5 Wallets',
      'EVM + Solana + Tron addresses',
      'Unlimited history transactions',
      'Auto sync every 5 minutes (manual sync anytime)',
      'Daily, weekly & monthly auto reports via Telegram & Email',
      'Advanced custom alerts',
      '1,000 AI requests (Analyze, chat, or Telegram)',
      'PDF & CSV export',
      'Name your clients',
    ],
    limits: {
      wallets: 5,
      networks: 3,
      transactions: Infinity,
      syncInterval: '5 min',
      reports: 'Daily, Weekly & Monthly',
      aiRequests: 1000,
    },
    costBreakdown: {
      alchemy: 13.21,
      infra: 4.49,
      total: 17.70,
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
      'Unlimited wallets',
      'EVM + Solana + Tron + Bitcoin addresses',
      'Unlimited transactions',
      'Real-time sync (every 30 seconds)',
      'Custom reports for any period',
      'Instant alerts',
      'Advanced classification',
      'PDF, CSV & Excel export',
      'Priority support',
    ],
    limits: {
      wallets: Infinity,
      networks: 4,
      transactions: Infinity,
      syncInterval: '30 sec',
      reports: 'Custom',
      aiRequests: null,
    },
    costBreakdown: {
      alchemy: 32.51,
      infra: 14.26,
      total: 46.77,
    },
    highlighted: false,
    badge: 'For Professionals',
  },
];
