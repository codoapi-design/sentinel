import { http, createConfig } from 'wagmi';
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  bsc,
  polygon,
} from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// WalletConnect Project ID (free from https://cloud.walletconnect.com)
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// Platform wallet address (where payments are sent)
export const PLATFORM_WALLET = '0xb3Ae51931CC644E64C3c43d59d0CfBB2Ee6D760F' as const;

// USDC contract addresses on supported chains
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  [polygon.id]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  [bsc.id]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

// USDT contract addresses on supported chains
export const USDT_ADDRESSES: Record<number, `0x${string}`> = {
  [mainnet.id]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  [base.id]: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  [arbitrum.id]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  [optimism.id]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  [polygon.id]: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  [bsc.id]: '0x55d398326f99059fF775485246999027B3197955',
};

// ERC-20 ABI (minimal for transfers and balance)
export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
] as const;

// Supported chains for payment
export const paymentChains = [mainnet, base, arbitrum, optimism, polygon, bsc];

// Wagmi configuration
export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, optimism, polygon, bsc],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
  },
  connectors: [
    injected(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
    coinbaseWallet({
      appName: 'CryptoBooks',
    }),
  ],
});
