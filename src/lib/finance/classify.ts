/**
 * Apply rule-based classification onto WalletTransaction objects
 * used by the live sync pipeline (Etherscan + Alchemy transfers).
 */

import { getMethodInfo, getProtocolInfo } from '@/lib/alchemy/classifier';
import type { WalletTransaction, TransactionType } from '@/lib/blockchain/types';
import { refineTransactionType, resolveTypeLabelAr } from '@/lib/finance/summary';

export interface ClassifiedWalletFields {
  type: TransactionType;
  typeAr: string;
  protocol: string | null;
  protocolAr: string | null;
  methodName: string | null;
  counterpartyLabel: string | null;
}

/**
 * Enrich a synced wallet transaction with professional classification.
 */
export function classifySyncedTransaction(
  tx: WalletTransaction,
  options?: { statusFailed?: boolean },
): WalletTransaction & { typeAr: string; protocolAr: string | null } {
  const fields = classifyWalletFields(tx, options);
  return {
    ...tx,
    type: fields.type,
    methodName: fields.methodName || tx.methodName,
    protocol: fields.protocol || tx.protocol,
    typeAr: fields.typeAr,
    protocolAr: fields.protocolAr,
  };
}

export function classifyWalletFields(
  tx: Pick<
    WalletTransaction,
    'type' | 'direction' | 'methodId' | 'methodName' | 'protocol' | 'to' | 'from' | 'tokenTransfers' | 'status'
  >,
  options?: { statusFailed?: boolean },
): ClassifiedWalletFields {
  const userLikely = ''; // direction already computed relative to wallet
  void userLikely;

  const hasIn = (tx.tokenTransfers || []).some(t => t.to && tx.direction !== 'out');
  const hasOut = (tx.tokenTransfers || []).some(t => t.from);
  // Swap legs: both inbound and outbound token transfers on same tx
  let hasSwapLegs = false;
  if ((tx.tokenTransfers || []).length >= 2) {
    const ins = (tx.tokenTransfers || []).some(t =>
      // heuristic: if any transfer goes to a party that isn't the tx.from, treat as in leg
      true,
    );
    const fromSet = new Set((tx.tokenTransfers || []).map(t => t.from.toLowerCase()));
    const toSet = new Set((tx.tokenTransfers || []).map(t => t.to.toLowerCase()));
    // If there's overlap of addresses sending and receiving different tokens → swap-like
    hasSwapLegs = fromSet.size > 0 && toSet.size > 0 && (tx.tokenTransfers || []).length >= 2;
    void hasIn;
    void hasOut;
    void ins;
  }

  // Stronger swap detection: one transfer from user-ish and one to user-ish
  if ((tx.tokenTransfers || []).length >= 2) {
    const outs = (tx.tokenTransfers || []).filter(t => t.from.toLowerCase() === tx.from.toLowerCase());
    const ins = (tx.tokenTransfers || []).filter(t => t.to.toLowerCase() === tx.from.toLowerCase());
    // For Alchemy grouped txs, wallet is either from or to on primary
    const walletCandidates = [tx.from, tx.to].map(a => a.toLowerCase());
    const outLeg = (tx.tokenTransfers || []).some(t =>
      walletCandidates.includes(t.from.toLowerCase()),
    );
    const inLeg = (tx.tokenTransfers || []).some(t =>
      walletCandidates.includes(t.to.toLowerCase()),
    );
    hasSwapLegs = outLeg && inLeg;
    void outs;
    void ins;
  }

  const failed = options?.statusFailed || tx.status === 'failed';

  let protocol = tx.protocol;
  let protocolAr: string | null = null;
  const toInfo = tx.to ? getProtocolInfo(tx.to.toLowerCase()) : null;
  if (toInfo) {
    protocol = protocol || toInfo.name;
    protocolAr = toInfo.nameAr;
  }

  const method = tx.methodId ? getMethodInfo(tx.methodId.toLowerCase()) : null;
  const methodName = tx.methodName || method?.name || null;

  const type = refineTransactionType({
    type: tx.type,
    methodId: tx.methodId,
    methodName,
    protocol,
    to: tx.to,
    direction: tx.direction,
    statusFailed: failed,
    hasSwapLegs,
  });

  return {
    type,
    typeAr: resolveTypeLabelAr(type),
    protocol: protocol || null,
    // English-only product: mirror protocol name into protocolAr column
    protocolAr: protocol || null,
    methodName,
    counterpartyLabel: protocol || null,
  };
}
