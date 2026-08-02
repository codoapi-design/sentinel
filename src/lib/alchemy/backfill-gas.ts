/**
 * Backfill gas_fee_eth / gas_used on existing transaction rows via Alchemy receipts.
 * Only attributes gas when the wallet address is the tx sender (paid the fee).
 */

import { createServerClient } from '@/lib/supabase/server';
import { getApiKey } from '@/lib/env';
import {
  ALCHEMY_RPC_HOST_BY_KEY,
  isAlchemyNetworkTemporarilyForbidden,
  markAlchemyNetworkForbidden,
} from '@/lib/alchemy/networks';
import { rebuildWalletReadModels } from '@/lib/finance/wallet-read-models';
import { primaryDisplayAddress } from '@/lib/wallet/address-validation';

type ReceiptGas = {
  gasUsed: number;
  gasFeeWei: string;
  gasFeeEth: number;
  gasPriceWei: string;
};

async function rpcReceipt(
  networkKey: string,
  hash: string,
): Promise<{
  gasUsed?: string;
  effectiveGasPrice?: string;
  gasPrice?: string;
  from?: string;
} | null> {
  if (isAlchemyNetworkTemporarilyForbidden(networkKey)) return null;
  const apiKey = getApiKey('alchemy');
  const host = ALCHEMY_RPC_HOST_BY_KEY[networkKey];
  if (!apiKey || !host) return null;

  const response = await fetch(`https://${host}/v2/${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [hash],
    }),
  });
  if (response.status === 403) {
    markAlchemyNetworkForbidden(networkKey);
    return null;
  }
  if (!response.ok) return null;
  type ReceiptJson = {
    gasUsed?: string;
    effectiveGasPrice?: string;
    gasPrice?: string;
    from?: string;
  };
  const json = (await response.json()) as { result?: ReceiptJson | null; error?: unknown };
  return json.result || null;
}

function parseReceiptGas(
  receipt: {
    gasUsed?: string;
    effectiveGasPrice?: string;
    gasPrice?: string;
    from?: string;
  },
  payerAddress: string,
): ReceiptGas | null {
  const from = (receipt.from || '').toLowerCase();
  if (!from || from !== payerAddress.toLowerCase()) return null;
  if (!receipt.gasUsed) return null;
  try {
    const used = BigInt(receipt.gasUsed);
    const price = BigInt(receipt.effectiveGasPrice || receipt.gasPrice || '0x0');
    const fee = used * price;
    return {
      gasUsed: Number(used),
      gasFeeWei: fee.toString(),
      gasFeeEth: Number(fee) / 1e18,
      gasPriceWei: price.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fill missing gas fields for a wallet, then rebuild financial read models.
 */
export async function backfillWalletGasFees(walletId: string): Promise<{
  ok: boolean;
  scanned: number;
  updated: number;
  skipped: number;
}> {
  const supabase = createServerClient();
  const { data: wallet, error: walletErr } = await supabase
    .from('wallets')
    .select('*')
    .eq('id', walletId)
    .maybeSingle();

  if (walletErr || !wallet) {
    return { ok: false, scanned: 0, updated: 0, skipped: 0 };
  }

  const payer = primaryDisplayAddress(wallet).toLowerCase();
  if (!payer.startsWith('0x')) {
    return { ok: true, scanned: 0, updated: 0, skipped: 0 };
  }

  // Distinct hashes still missing gas (outbound/inbound rows may share a hash).
  const missing: Array<{ tx_hash: string; network: string }> = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('transactions')
      .select('tx_hash, network, gas_fee_eth')
      .eq('wallet_id', walletId)
      .or('gas_fee_eth.is.null,gas_fee_eth.eq.0')
      .order('timestamp', { ascending: false })
      .range(from, from + page - 1);
    if (error) {
      console.warn('[GasBackfill] query failed:', error.message);
      return { ok: false, scanned: 0, updated: 0, skipped: 0 };
    }
    if (!data?.length) break;
    for (const row of data) {
      if (!row.tx_hash || !row.network) continue;
      missing.push({ tx_hash: row.tx_hash, network: String(row.network).toLowerCase() });
    }
    if (data.length < page) break;
  }

  const unique = new Map<string, { tx_hash: string; network: string }>();
  for (const row of missing) {
    const key = `${row.network}:${row.tx_hash.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  const entries = [...unique.values()];
  let updated = 0;
  let skipped = 0;
  const concurrency = 8;

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ tx_hash, network }) => {
        try {
          const receipt = await rpcReceipt(network, tx_hash);
          if (!receipt) {
            skipped++;
            return;
          }
          const gas = parseReceiptGas(receipt, payer);
          if (!gas || gas.gasFeeEth <= 0) {
            skipped++;
            return;
          }
          const { error, count } = await supabase
            .from('transactions')
            .update({
              gas_used: gas.gasUsed,
              gas_price_wei: gas.gasPriceWei,
              gas_fee_eth: gas.gasFeeEth,
            })
            .eq('wallet_id', walletId)
            .eq('tx_hash', tx_hash)
            .eq('network', network);
          if (error) {
            console.warn('[GasBackfill] update failed:', tx_hash, error.message);
            skipped++;
            return;
          }
          updated += typeof count === 'number' ? count : 1;
        } catch (err) {
          skipped++;
          console.warn('[GasBackfill] receipt failed:', tx_hash, err);
        }
      }),
    );
  }

  if (updated > 0) {
    try {
      await rebuildWalletReadModels(walletId);
    } catch (err) {
      console.warn('[GasBackfill] read models rebuild skipped:', err);
    }
  }

  return { ok: true, scanned: entries.length, updated, skipped };
}
