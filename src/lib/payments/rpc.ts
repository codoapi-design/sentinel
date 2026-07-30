import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
import { mainnet, base, arbitrum, optimism, polygon, bsc } from 'viem/chains';
import { getApiKey } from '@/lib/env';

const CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [bsc.id]: bsc,
};

const ALCHEMY_HOST: Record<number, string> = {
  1: 'eth-mainnet.g.alchemy.com',
  8453: 'base-mainnet.g.alchemy.com',
  42161: 'arb-mainnet.g.alchemy.com',
  10: 'opt-mainnet.g.alchemy.com',
  137: 'polygon-mainnet.g.alchemy.com',
  56: 'bnb-mainnet.g.alchemy.com',
};

const PUBLIC_RPC: Record<number, string> = {
  1: 'https://ethereum.publicnode.com',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io',
  137: 'https://polygon-rpc.com',
  56: 'https://bsc-dataseed.binance.org',
};

export function getPaymentRpcUrl(chainId: number): string {
  const alchemyKey = getApiKey('alchemy');
  const host = ALCHEMY_HOST[chainId];
  if (alchemyKey && host) {
    return `https://${host}/v2/${alchemyKey}`;
  }
  const fallback = PUBLIC_RPC[chainId];
  if (!fallback) throw new Error(`No RPC configured for chain ${chainId}`);
  return fallback;
}

export function getPaymentPublicClient(chainId: number): PublicClient {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported payment chain ${chainId}`);
  return createPublicClient({
    chain,
    transport: http(getPaymentRpcUrl(chainId)),
  });
}
