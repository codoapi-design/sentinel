import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, recordApiUsage } from '@/lib/api-keys/service';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getBlockchainCache } from '@/lib/blockchain/cache';
import { CHAIN_IDS } from '@/lib/blockchain/types';

/**
 * GET /api/v1/nfts
 * Public API endpoint — get NFT portfolio for a wallet using hybrid architecture
 *
 * Headers:
 * - x-api-key: API key (required)
 *
 * Query params:
 * - wallet: Wallet address (required)
 * - chain: Chain name or chain ID (optional, default: ethereum)
 * - refresh: Force refresh from providers (default: false)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Authenticate ──
    const apiKeyHeader = request.headers.get('x-api-key');
    if (!apiKeyHeader) {
      return NextResponse.json(
        { error: 'Missing x-api-key header' },
        { status: 401 },
      );
    }

    const apiKey = validateApiKey(apiKeyHeader);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 },
      );
    }

    // ── Check permissions ──
    if (!apiKey.permissions.includes('portfolio:read')) {
      recordApiUsage(apiKey.id, Date.now() - startTime, true);
      return NextResponse.json(
        { error: 'Insufficient permissions: portfolio:read required' },
        { status: 403 },
      );
    }

    // ── Rate limit ──
    if (!checkRateLimit(apiKey.id)) {
      recordApiUsage(apiKey.id, Date.now() - startTime, true);
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      );
    }

    // ── Parse query params ──
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');
    const chainParam = searchParams.get('chain') || 'ethereum';
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'wallet query parameter is required' },
        { status: 400 },
      );
    }

    if (!walletAddress.startsWith('0x') || walletAddress.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    // Resolve chain ID
    let chainId: number;
    if (/^\d+$/.test(chainParam)) {
      chainId = parseInt(chainParam);
    } else if (CHAIN_IDS[chainParam]) {
      chainId = CHAIN_IDS[chainParam];
    } else {
      chainId = 1;
    }

    // ── Fetch NFTs using hybrid architecture ──
    const providerManager = getProviderManager();
    const cache = getBlockchainCache();

    if (forceRefresh) {
      await cache.invalidate(walletAddress, 'nfts');
    }

    const { nfts, providers } = await providerManager.fetchNFTs(walletAddress, chainId);

    // Record usage
    recordApiUsage(apiKey.id, Date.now() - startTime, false);

    return NextResponse.json({
      success: true,
      data: nfts.map(nft => ({
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        name: nft.name,
        description: nft.description,
        imageUrl: nft.imageUrl,
        collectionName: nft.collectionName,
        chain: nft.chain,
        chainId: nft.chainId,
        lastSalePrice: nft.lastSalePrice,
        provider: nft.provider,
      })),
      meta: {
        wallet: walletAddress,
        chainId,
        providers,
        total: nfts.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('V1 NFTs GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
